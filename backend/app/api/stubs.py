"""Rutas declaradas para completar el contrato OpenAPI; las Tareas 5-9 las reemplazan."""
import datetime as dt
import uuid

from fastapi.responses import Response
from fastapi import APIRouter, Depends, File, Form, Header, UploadFile

from app.api.auth import current_user, require_role
from app.api.errors import ApiError
from app.api.schemas import (
    BatchCreated, BatchDetail, BatchSummary, ErrorResponse, MyCertificate,
    VerifyFileResponse, VerifyResponse,
)

router = APIRouter(responses={501: {"model": ErrorResponse, "description": "Aún no implementado"}})


def _todo():
    raise ApiError(501, "UNAVAILABLE", "No implementado todavía")


_AUTH = {401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}}
_PUBLIC = {404: {"model": ErrorResponse}, 503: {"model": ErrorResponse}}
_operator = Depends(require_role("operator"))
_student = Depends(require_role("student"))


@router.post(
    "/batches", status_code=201, tags=["batches"], dependencies=[_operator],
    response_model=BatchCreated,
    responses={**_AUTH, 200: {"model": BatchCreated, "description": "Reintento idempotente: devuelve el lote original"}, 400: {"model": ErrorResponse},
               409: {"model": ErrorResponse}},
)
def create_batch(
    course_name: str = Form(min_length=1, max_length=200),
    completion_date: dt.date = Form(),
    file: UploadFile = File(),
    idempotency_key: str = Header(alias="Idempotency-Key"),
):
    _todo()


@router.get("/batches", tags=["batches"], dependencies=[_operator],
            response_model=list[BatchSummary], responses=_AUTH)
def list_batches():
    _todo()


@router.get("/batches/{batch_id}", tags=["batches"], dependencies=[_operator],
            response_model=BatchDetail, responses={**_AUTH, 404: {"model": ErrorResponse}})
def get_batch(batch_id: uuid.UUID):
    _todo()


@router.get("/me/certificates", tags=["certificates"], dependencies=[_student],
            response_model=list[MyCertificate], responses=_AUTH)
def my_certificates():
    _todo()


@router.get(
    "/certificates/{cert_id}/pdf", tags=["certificates"], dependencies=[Depends(current_user)],
    response_class=Response,
    responses={**_AUTH, 404: {"model": ErrorResponse},
               200: {"content": {"application/pdf": {}}, "description": "PDF"}},
)
def certificate_pdf(cert_id: uuid.UUID):
    # Task 7 agrega la regla: alumno dueño u operator.
    _todo()


@router.get("/verify/{cert_id}", tags=["verify"], response_model=VerifyResponse, responses=_PUBLIC)
def verify(cert_id: uuid.UUID):
    _todo()


@router.post("/verify/{cert_id}/file", tags=["verify"], response_model=VerifyFileResponse,
             responses={**_PUBLIC, 400: {"model": ErrorResponse}})
def verify_file(cert_id: uuid.UUID, file: UploadFile = File()):
    _todo()
