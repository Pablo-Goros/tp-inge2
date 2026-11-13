import datetime as dt
import enum
import uuid

from sqlalchemy import (
    CheckConstraint, Date, DateTime, ForeignKey, Integer, LargeBinary, Text,
    UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class RequestStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    ISSUED = "ISSUED"
    FAILED = "FAILED"


class Base(DeclarativeBase):
    pass


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def _now() -> Mapped[dt.datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now())


class Institution(Base):
    __tablename__ = "institutions"
    id: Mapped[uuid.UUID] = _uuid_pk()
    name: Mapped[str] = mapped_column(Text)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('operator','student')", name="ck_users_role"),)
    id: Mapped[uuid.UUID] = _uuid_pk()
    institution_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("institutions.id"))
    email: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(Text)


class Batch(Base):
    __tablename__ = "batches"
    __table_args__ = (UniqueConstraint("operator_id", "idempotency_key", name="uq_batches_operator_key"),)
    id: Mapped[uuid.UUID] = _uuid_pk()
    operator_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    course_name: Mapped[str] = mapped_column(Text)
    completion_date: Mapped[dt.date] = mapped_column(Date)
    idempotency_key: Mapped[str] = mapped_column(Text)
    request_fingerprint: Mapped[str] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = _now()


class CertRequest(Base):
    """`id` es el identificador del certificado."""

    __tablename__ = "cert_requests"
    __table_args__ = (
        UniqueConstraint("student_id", "course_key", "completion_date", name="uq_cert_requests_student_course_date"),
        CheckConstraint("status IN ('PENDING','PROCESSING','ISSUED','FAILED')", name="ck_cert_requests_status"),
    )
    id: Mapped[uuid.UUID] = _uuid_pk()
    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("batches.id"), index=True)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    course_key: Mapped[str] = mapped_column(Text)
    completion_date: Mapped[dt.date] = mapped_column(Date)
    status: Mapped[RequestStatus] = mapped_column(
        Text, default=RequestStatus.PENDING, server_default=RequestStatus.PENDING.value
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[dt.datetime] = _now()
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Outbox(Base):
    __tablename__ = "outbox"
    id: Mapped[uuid.UUID] = _uuid_pk()
    request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cert_requests.id"))
    correlation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), default=uuid.uuid4)
    created_at: Mapped[dt.datetime] = _now()
    published_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Certificate(Base):
    __tablename__ = "certificates"
    request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cert_requests.id"), primary_key=True)
    pdf: Mapped[bytes] = mapped_column(LargeBinary)
    sha256: Mapped[str] = mapped_column(Text)
    issued_at: Mapped[dt.datetime] = _now()


class RegistryEntry(Base):
    __tablename__ = "registry"
    cert_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    sha256: Mapped[str] = mapped_column(Text)
    registered_at: Mapped[dt.datetime] = _now()
