"""HTTP boundary for C's verification use cases.

C supplies an implementation of Verification and wires get_verification when its
integration is available. This module never treats local certificate existence
as evidence of registration.
"""
import datetime as dt
import uuid
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class RegisteredCertificate:
    certificate_id: uuid.UUID
    student_name: str
    institution: str
    course_name: str
    completion_date: dt.date


class VerificationUnavailable(Exception):
    """C's registry or verification integration cannot currently be reached."""


class Verification(Protocol):
    def lookup(self, cert_id: uuid.UUID) -> RegisteredCertificate | None: ...


class UnavailableVerification:
    def lookup(self, cert_id: uuid.UUID) -> RegisteredCertificate | None:
        raise VerificationUnavailable


def get_verification() -> Verification:
    # C is not present in this checkout. A fake registry is only valid in tests.
    return UnavailableVerification()
