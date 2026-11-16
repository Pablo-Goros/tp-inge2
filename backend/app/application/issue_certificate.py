"""Issuance state machine, independent of AMQP acknowledgement mechanics."""
import logging
from enum import Enum
from hashlib import sha256
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import InterfaceError, OperationalError

from app.application.faults import FaultInjector
from app.domain.errors import PermanentError, TransientError
from app.domain.registry import Registry, RegistryConflict, RegistryUnavailable
from app.infrastructure.models import Batch, Certificate, CertRequest, Institution, RequestStatus, User
from app.infrastructure.pdf import CertificateData, build_verify_url, render_certificate

log = logging.getLogger(__name__)


class Outcome(Enum):
    DONE = "done"
    RETRY = "retry"
    FAILED = "failed"


def _finish(session_factory, request_id, status, error=None):
    with session_factory() as session, session.begin():
        request = session.get(CertRequest, request_id, with_for_update=True)
        request.status = status
        request.last_error = error


def _prepare(session_factory, request_id, max_attempts, public_base_url):
    with session_factory() as session, session.begin():
        request = session.get(CertRequest, request_id, with_for_update=True)
        if request is None:
            return Outcome.FAILED
        if request.status == RequestStatus.ISSUED:
            return Outcome.DONE
        if request.status == RequestStatus.FAILED:
            # A prior delivery may have died before its confirmed DLQ publication.
            return Outcome.FAILED
        certificate = session.get(Certificate, request_id)
        if request.attempts >= max_attempts:
            return (None, certificate.sha256 if certificate else None, None)
        request.status = RequestStatus.PROCESSING
        request.attempts += 1
        request.last_error = None
        row = session.execute(
            select(User.name, User.email, Institution.name, Batch.course_name)
            .select_from(User).join(Institution, Institution.id == User.institution_id)
            .join(Batch, Batch.id == request.batch_id).where(User.id == request.student_id)
        ).one_or_none()
        if row is None:
            raise PermanentError("Faltan datos académicos para emitir el certificado")
        log.info("intento request_id=%s attempt=%s", request_id, request.attempts)
        data = CertificateData(request.id, row[2], row[0], row[3], request.completion_date,
                               build_verify_url(public_base_url, request.id), request.final_grade)
        return data, certificate.sha256 if certificate else None, row[1]


def process_request(session_factory, registry: Registry, request_id: UUID, *, max_attempts: int,
                    faults: FaultInjector, public_base_url: str) -> Outcome:
    if max_attempts < 1:
        raise ValueError("MAX_ATTEMPTS debe ser mayor a cero")
    try:
        prepared = _prepare(session_factory, request_id, max_attempts, public_base_url)
        if isinstance(prepared, Outcome):
            return prepared
        data, digest, email = prepared
        if data is None:
            # A crash after the final register may leave PROCESSING at the limit.
            # Do not fail a successfully registered certificate just for redelivery.
            if digest is not None:
                registered = registry.lookup(request_id)
                if registered == digest:
                    _finish(session_factory, request_id, RequestStatus.ISSUED)
                    return Outcome.DONE
                if registered is not None:
                    raise RegistryConflict("El registro contiene otra huella")
            _finish(session_factory, request_id, RequestStatus.FAILED, "Intentos de emisión agotados")
            return Outcome.FAILED
        if digest is None:
            try:
                pdf = render_certificate(data)
            except Exception as exc:
                raise PermanentError("No se pudo generar el certificado PDF") from exc
            digest = sha256(pdf).hexdigest()
            with session_factory() as session, session.begin():
                session.add(Certificate(request_id=request_id, pdf=pdf, sha256=digest))
        faults.before_register(email)
        registry.register(request_id, digest)
        _finish(session_factory, request_id, RequestStatus.ISSUED)
        return Outcome.DONE
    except (OperationalError, InterfaceError) as exc:
        # Without a DB commit we cannot acknowledge or safely spend an attempt.
        raise TransientError("Base de datos temporalmente no disponible") from exc
    except (RegistryUnavailable, TransientError, RegistryConflict, PermanentError) as exc:
        if isinstance(exc, RegistryUnavailable):
            with session_factory() as session:
                attempts = session.get(CertRequest, request_id).attempts
            if attempts >= max_attempts:
                # A register timeout may have committed remotely. Keep the final
                # attempt unresolved until lookup can establish its result.
                _finish(session_factory, request_id, RequestStatus.PROCESSING, str(exc))
                raise TransientError("No se pudo reconciliar el registro") from exc
        with session_factory() as session, session.begin():
            request = session.get(CertRequest, request_id, with_for_update=True)
            permanent = isinstance(exc, (RegistryConflict, PermanentError))
            failed = permanent or request.attempts >= max_attempts
            request.status = RequestStatus.FAILED if failed else RequestStatus.PENDING
            request.last_error = str(exc)
        log.warning("emisión request_id=%s outcome=%s reason=%s", request_id,
                    "failed" if failed else "retry", type(exc).__name__)
        return Outcome.FAILED if failed else Outcome.RETRY
