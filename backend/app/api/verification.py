"""HTTP adapter for the real registry-backed verification use cases."""
import datetime as dt
import uuid
from dataclasses import dataclass
from typing import Literal, Protocol


@dataclass(frozen=True)
class RegisteredCertificate:
    certificate_id: uuid.UUID
    student_name: str
    institution: str
    course_name: str
    completion_date: dt.date


class VerificationUnavailable(Exception):
    """C's registry or verification integration cannot currently be reached."""


VerificationResult = Literal["VALID", "ALTERED", "NOT_FOUND"]


class Verification(Protocol):
    def lookup(self, cert_id: uuid.UUID) -> RegisteredCertificate | None: ...

    def compare_file(self, cert_id: uuid.UUID, content: bytes) -> VerificationResult: ...


class UnavailableVerification:
    def lookup(self, cert_id: uuid.UUID) -> RegisteredCertificate | None:
        raise VerificationUnavailable

    def compare_file(self, cert_id: uuid.UUID, content: bytes) -> VerificationResult:
        raise VerificationUnavailable


class RegistryVerification:
    def __init__(self, session_factory, registry):
        self.session_factory = session_factory
        self.registry = registry

    def lookup(self, cert_id: uuid.UUID) -> RegisteredCertificate | None:
        from sqlalchemy.exc import InterfaceError, OperationalError
        from app.application.verification import get_public_certificate
        from app.domain.registry import RegistryUnavailable

        try:
            with self.session_factory() as session:
                record = get_public_certificate(session, self.registry, cert_id)
            if record is None:
                return None
            return RegisteredCertificate(record.certificate_id, record.student_name, record.institution,
                                         record.course_name, record.completion_date)
        except (RegistryUnavailable, OperationalError, InterfaceError) as exc:
            raise VerificationUnavailable from exc

    def compare_file(self, cert_id: uuid.UUID, content: bytes) -> VerificationResult:
        from app.application.verification import verify_file
        from app.domain.registry import RegistryUnavailable

        try:
            return verify_file(self.registry, cert_id, content)
        except RegistryUnavailable as exc:
            raise VerificationUnavailable from exc


def get_verification() -> Verification:
    from app.config import get_settings
    from app.infrastructure.db import SessionLocal
    from app.infrastructure.registry_factory import get_registry

    return RegistryVerification(SessionLocal, get_registry(get_settings()))
