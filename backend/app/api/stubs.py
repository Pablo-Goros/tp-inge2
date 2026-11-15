"""Public HTTP adapters for the verification use cases owned by C."""
import uuid

from fastapi import APIRouter, Depends, File, UploadFile

from app.api.errors import ApiError, not_found
from app.api.schemas import ErrorResponse, VerifyFileResponse, VerifyResponse
from app.api.verification import Verification, VerificationUnavailable, get_verification

router = APIRouter()
_PUBLIC = {404: {"model": ErrorResponse}, 503: {"model": ErrorResponse}}


@router.get("/verify/{cert_id}", tags=["verify"], response_model=VerifyResponse, responses=_PUBLIC)
def verify(cert_id: uuid.UUID, service: Verification = Depends(get_verification)):
    """Return registered public academic data; never expose account data or grades."""
    try:
        record = service.lookup(cert_id)
    except VerificationUnavailable:
        raise ApiError(503, "UNAVAILABLE", "Verificación temporalmente no disponible")
    if record is None:
        raise not_found("Certificado no registrado")
    return VerifyResponse(
        status="REGISTERED", certificate_id=record.certificate_id,
        student_name=record.student_name, institution=record.institution,
        course_name=record.course_name, completion_date=record.completion_date,
    )


@router.post("/verify/{cert_id}/file", tags=["verify"], response_model=VerifyFileResponse,
             responses={**_PUBLIC, 400: {"model": ErrorResponse}, 501: {"model": ErrorResponse}})
def verify_file(cert_id: uuid.UUID, file: UploadFile = File()):
    raise ApiError(501, "UNAVAILABLE", "No implementado todavía")
