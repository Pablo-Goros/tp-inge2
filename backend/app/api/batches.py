import datetime as dt

from fastapi import APIRouter, Depends, File, Form, Header, Response, UploadFile
from sqlalchemy.orm import Session

from app.api.auth import require_role
from app.api.errors import ApiError
from app.api.schemas import BatchCreated, ErrorResponse
from app.application.accept_batch import accept_batch
from app.infrastructure.db import get_session
from app.infrastructure.models import User

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
