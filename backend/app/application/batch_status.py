"""Estado derivado de un lote (contracts.md §3) y conteos agregados por estado."""
import uuid
from typing import Literal, NamedTuple

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.infrastructure.models import CertRequest

BatchStatusName = Literal["IN_PROGRESS", "COMPLETED", "COMPLETED_WITH_ERRORS"]


class Counts(NamedTuple):
    """Cantidad de solicitudes por estado (orden posicional: pending, processing, issued, failed)."""

    pending: int = 0
    processing: int = 0
    issued: int = 0
    failed: int = 0

    @property
    def total(self) -> int:
        return sum(self)


def derive_batch_status(counts: Counts) -> BatchStatusName:
    if counts.pending or counts.processing:
        return "IN_PROGRESS"
    return "COMPLETED_WITH_ERRORS" if counts.failed else "COMPLETED"


def counts_for_batches(session: Session, batch_ids: list[uuid.UUID]) -> dict[uuid.UUID, Counts]:
    """Una sola consulta GROUP BY (batch_id, status) para todos los lotes pedidos."""
    per: dict[uuid.UUID, dict[str, int]] = {b: {} for b in batch_ids}
    if batch_ids:
        rows = session.execute(
            select(CertRequest.batch_id, CertRequest.status, func.count())
            .where(CertRequest.batch_id.in_(batch_ids))
            .group_by(CertRequest.batch_id, CertRequest.status)
        ).all()
        for bid, status, n in rows:
            per[bid][getattr(status, "value", status)] = n
    return {
        b: Counts(m.get("PENDING", 0), m.get("PROCESSING", 0), m.get("ISSUED", 0), m.get("FAILED", 0))
        for b, m in per.items()
    }
