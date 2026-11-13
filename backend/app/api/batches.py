import datetime as dt
import uuid

from fastapi import APIRouter, Depends, File, Form, Header, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import require_role
from app.api.errors import ApiError, not_found
from app.api.schemas import (
    BatchCounts, BatchCreated, BatchDetail, BatchItem, BatchSummary, ErrorResponse,
)
from app.application.accept_batch import accept_batch
from app.infrastructure.db import get_session
from app.application.batch_status import Counts, counts_for_batches, derive_batch_status
from app.infrastructure.models import Batch, CertRequest, User

router = APIRouter()

MAX_UPLOAD_BYTES = 1024 * 1024


def _bad(message: str) -> ApiError:
    return ApiError(400, "VALIDATION_ERROR", message)


@router.post(
    "/batches", status_code=201, tags=["batches"], response_model=BatchCreated,
    responses={
        401: {"model": ErrorResponse}, 403: {"model": ErrorResponse},
        200: {"model": BatchCreated, "description": "Reintento idempotente: devuelve el lote original"},
        400: {"model": ErrorResponse}, 409: {"model": ErrorResponse},
    },
)
def create_batch(
    response: Response,
    course_name: str = Form(min_length=1, max_length=200),
    completion_date: str = Form(pattern=r"^\d{4}-\d{2}-\d{2}$", json_schema_extra={"format": "date"}),
    file: UploadFile = File(),
    idempotency_key: str = Header(alias="Idempotency-Key"),
    operator: User = Depends(require_role("operator")),
    session: Session = Depends(get_session),
):
    if not idempotency_key.strip():
        raise _bad("Idempotency-Key es obligatoria")
    if len(idempotency_key.strip()) > 255:
        raise _bad("Idempotency-Key supera 255 caracteres")
    try:
        date = dt.date.fromisoformat(completion_date)
    except ValueError:
        raise _bad("completion_date debe ser una fecha YYYY-MM-DD válida") from None
    if not course_name.strip():
        raise _bad("course_name no puede estar vacío")
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise _bad("El CSV supera el tamaño máximo de 1 MB")
    res = accept_batch(session, operator.id, course_name, date, data, idempotency_key.strip())
    if res.replayed:
        response.status_code = 200
    return BatchCreated(batch_id=res.batch_id, status=res.status, total=res.total)


LIST_LIMIT = 100  # los 100 lotes más recientes; sin paginación


def _counts_model(c: Counts) -> BatchCounts:
    return BatchCounts(total=c.total, pending=c.pending, processing=c.processing, issued=c.issued, failed=c.failed)


_AUTH = {401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}}


@router.get("/batches", tags=["batches"], response_model=list[BatchSummary], responses=_AUTH)
def list_batches(operator: User = Depends(require_role("operator")), session: Session = Depends(get_session)):
    batches = session.scalars(
        select(Batch).where(Batch.operator_id == operator.id)
        .order_by(Batch.created_at.desc(), Batch.id.desc()).limit(LIST_LIMIT)
    ).all()
    counts = counts_for_batches(session, [b.id for b in batches])
    return [
        BatchSummary(
            batch_id=b.id, status=derive_batch_status(counts[b.id]), total=counts[b.id].total,
            course_name=b.course_name, completion_date=b.completion_date, created_at=b.created_at,
            counts=_counts_model(counts[b.id]),
        )
        for b in batches
    ]


@router.get("/batches/{batch_id}", tags=["batches"], response_model=BatchDetail,
            responses={**_AUTH, 404: {"model": ErrorResponse}})
def get_batch(batch_id: uuid.UUID, operator: User = Depends(require_role("operator")),
              session: Session = Depends(get_session)):
    # Lote ajeno o inexistente: mismo 404 (no revela existencia).
    batch = session.scalar(select(Batch).where(Batch.id == batch_id, Batch.operator_id == operator.id))
    if batch is None:
        raise not_found("Lote inexistente")
    counts = counts_for_batches(session, [batch.id])[batch.id]
    rows = session.execute(
        select(CertRequest, User.name, User.email)
        .join(User, User.id == CertRequest.student_id)
        .where(CertRequest.batch_id == batch.id)
        .order_by(User.name, CertRequest.id)
    ).all()
    items = [
        BatchItem(certificate_id=r.id, student_name=name, student_email=email, status=r.status,
                  attempts=r.attempts, last_error=r.last_error)
        for r, name, email in rows
    ]
    return BatchDetail(
        batch_id=batch.id, course_name=batch.course_name, completion_date=batch.completion_date,
        status=derive_batch_status(counts), counts=_counts_model(counts), items=items,
    )
