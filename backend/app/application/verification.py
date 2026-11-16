"""Authenticity comes from Registry; local document existence is insufficient."""
from dataclasses import dataclass
from datetime import date
from hashlib import sha256
from typing import Literal
from uuid import UUID

from sqlalchemy import select

from app.domain.registry import Registry, RegistryUnavailable
from app.infrastructure.models import Batch, CertRequest, Institution, User


@dataclass(frozen=True)
class PublicCertificate:
    certificate_id: UUID
    student_name: str
    institution: str
    course_name: str
    completion_date: date


def get_public_certificate(session, registry: Registry, cert_id: UUID) -> PublicCertificate | None:
    if registry.lookup(cert_id) is None:
        return None
    row = session.execute(
        select(User.name, Institution.name, Batch.course_name, CertRequest.completion_date)
        .select_from(CertRequest).join(User, User.id == CertRequest.student_id)
        .join(Institution, Institution.id == User.institution_id)
        .join(Batch, Batch.id == CertRequest.batch_id).where(CertRequest.id == cert_id)
    ).one_or_none()
    if row is None:
        raise RegistryUnavailable("Registro sin metadatos académicos disponibles")
    return PublicCertificate(cert_id, *row)


def verify_file(registry: Registry, cert_id: UUID, data: bytes) -> Literal["VALID", "ALTERED", "NOT_FOUND"]:
    registered = registry.lookup(cert_id)
    if registered is None:
        return "NOT_FOUND"
    return "VALID" if sha256(data).hexdigest() == registered else "ALTERED"
