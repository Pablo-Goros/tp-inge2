"""Aceptar un lote: una sola transacción con batch + cert_requests + outbox."""
import datetime as dt
import hashlib
import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.errors import ApiError
from app.domain.csv_validation import CsvFormatError, RowIssue, parse_csv, validate_rows
from app.domain.normalize import course_key as make_course_key
from app.domain.normalize import normalize_email
from app.infrastructure.models import Batch, CertRequest, Outbox, RequestStatus, User

UQ_BATCH_KEY = "uq_batches_operator_key"
UQ_BUSINESS = "uq_cert_requests_student_course_date"


@dataclass(frozen=True)
class AcceptResult:
    batch_id: uuid.UUID
    status: str
    total: int
    replayed: bool


def fingerprint(ckey: str, completion_date: dt.date, csv_bytes: bytes) -> str:
    h = hashlib.sha256()
    h.update(ckey.encode())
    h.update(b"\0" + completion_date.isoformat().encode() + b"\0")
    h.update(csv_bytes)
    return h.hexdigest()


def _validation_error(issues: list[RowIssue]) -> ApiError:
    return ApiError(400, "VALIDATION_ERROR", "El lote tiene filas inválidas",
                    [{"row": i.row, "email": i.email, "reason": i.reason} for i in issues])


def _batch_status(session: Session, batch_id: uuid.UUID) -> tuple[str, int]:
    rows = dict(session.execute(
        select(CertRequest.status, func.count()).where(CertRequest.batch_id == batch_id).group_by(CertRequest.status)
    ).all())
    total = sum(rows.values())
    if rows.get("PENDING") or rows.get("PROCESSING"):
        return "IN_PROGRESS", total
    return ("COMPLETED_WITH_ERRORS" if rows.get("FAILED") else "COMPLETED"), total


def _existing_batch(session: Session, operator_id: uuid.UUID, key: str) -> Batch | None:
    return session.scalar(select(Batch).where(Batch.operator_id == operator_id, Batch.idempotency_key == key))


def _replay_or_conflict(session: Session, existing: Batch, fp: str) -> AcceptResult:
    if existing.request_fingerprint != fp:
        raise ApiError(409, "IDEMPOTENCY_CONFLICT", "La Idempotency-Key ya se usó con otro contenido")
    status, total = _batch_status(session, existing.id)
    return AcceptResult(existing.id, status, total, replayed=True)


def _issues(session, institution_id, emails, ckey, completion_date) -> tuple[list[RowIssue], dict]:
    wanted = {normalize_email(e) for e in emails}
    known = {
        email: sid
        for email, sid in session.execute(
            select(func.lower(User.email), User.id).where(
                User.role == "student", User.institution_id == institution_id,
                func.lower(User.email).in_(wanted),
            )
        ).all()
    }
    existing = {
        tuple(r) for r in session.execute(
            select(CertRequest.student_id, CertRequest.course_key, CertRequest.completion_date).where(
                CertRequest.student_id.in_(list(known.values())), CertRequest.course_key == ckey,
                CertRequest.completion_date == completion_date,
            )
        )
    }
    return validate_rows(emails, known, existing, ckey, completion_date), known


def accept_batch(
    session: Session, operator_id: uuid.UUID, course_name: str, completion_date: dt.date,
    csv_bytes: bytes, idempotency_key: str,
) -> AcceptResult:
    course_name = course_name.strip()
    ckey = make_course_key(course_name)
    fp = fingerprint(ckey, completion_date, csv_bytes)

    existing = _existing_batch(session, operator_id, idempotency_key)
    if existing is not None:
        return _replay_or_conflict(session, existing, fp)

    try:
        emails = parse_csv(csv_bytes)
    except CsvFormatError as e:
        raise ApiError(400, "VALIDATION_ERROR", "CSV inválido", [{"row": 0, "reason": e.reason}]) from None

    institution_id = session.scalar(select(User.institution_id).where(User.id == operator_id))
    issues, known = _issues(session, institution_id, emails, ckey, completion_date)
    if issues:
        raise _validation_error(issues)

    batch = Batch(id=uuid.uuid4(), operator_id=operator_id, course_name=course_name,
                  completion_date=completion_date, idempotency_key=idempotency_key, request_fingerprint=fp)
    reqs = [
        CertRequest(id=uuid.uuid4(), batch_id=batch.id, student_id=known[normalize_email(e)], course_key=ckey,
                    completion_date=completion_date, status=RequestStatus.PENDING)
        for e in emails
    ]
    # Orden determinista de bloqueo en el índice único: evita deadlocks entre lotes solapados.
    reqs.sort(key=lambda r: r.student_id)
    outbox = [Outbox(id=uuid.uuid4(), request_id=r.id, correlation_id=uuid.uuid4()) for r in reqs]
    try:
        session.add(batch)
        session.flush()
        session.add_all(reqs)
        session.flush()
        session.add_all(outbox)
        session.commit()
    except IntegrityError as exc:
        constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
        session.rollback()
        if constraint == UQ_BATCH_KEY:
            existing = _existing_batch(session, operator_id, idempotency_key)
            if existing is not None:
                return _replay_or_conflict(session, existing, fp)
        elif constraint == UQ_BUSINESS:
            issues, _ = _issues(session, institution_id, emails, ckey, completion_date)
            if issues:
                raise _validation_error(issues) from None
        raise
    return AcceptResult(batch.id, "IN_PROGRESS", len(reqs), replayed=False)
