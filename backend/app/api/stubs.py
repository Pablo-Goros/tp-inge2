"""Rutas declaradas para completar el contrato OpenAPI; las Tareas 5-9 las reemplazan."""
import uuid

from fastapi import APIRouter, File, UploadFile

from app.api.errors import ApiError
from app.api.schemas import (
    ErrorResponse, VerifyFileResponse, VerifyResponse,
)

router = APIRouter(responses={501: {"model": ErrorResponse, "description": "Aún no implementado"}})


def _todo():
    raise ApiError(501, "UNAVAILABLE", "No implementado todavía")


_PUBLIC = {404: {"model": ErrorResponse}, 503: {"model": ErrorResponse}}


@router.get("/verify/{cert_id}", tags=["verify"], response_model=VerifyResponse, responses=_PUBLIC)
def verify(cert_id: uuid.UUID):
    _todo()


@router.post("/verify/{cert_id}/file", tags=["verify"], response_model=VerifyFileResponse,
             responses={**_PUBLIC, 400: {"model": ErrorResponse}})
def verify_file(cert_id: uuid.UUID, file: UploadFile = File()):
    _todo()
