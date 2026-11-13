import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import current_user, require_role
from app.api.errors import not_found
from app.api.schemas import ErrorResponse, MyCertificate
from app.infrastructure.db import get_session
from app.infrastructure.models import Batch, Certificate, CertRequest, RequestStatus, User

router = APIRouter()

_AUTH = {401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}}


@router.get("/me/certificates", tags=["certificates"], response_model=list[MyCertificate], responses=_AUTH)
def my_certificates(student: User = Depends(require_role("student")), session: Session = Depends(get_session)):
    rows = session.execute(
        select(CertRequest.id, Batch.course_name, CertRequest.completion_date, Certificate.issued_at)
        .join(Certificate, Certificate.request_id == CertRequest.id)
        .join(Batch, Batch.id == CertRequest.batch_id)
        .where(CertRequest.student_id == student.id, CertRequest.status == RequestStatus.ISSUED)
        .order_by(Certificate.issued_at.desc(), CertRequest.id)
    ).all()
    return [
        MyCertificate(certificate_id=i, course_name=name, completion_date=d, issued_at=at)
        for i, name, d, at in rows
    ]


@router.get(
    "/certificates/{cert_id}/pdf", tags=["certificates"], response_class=Response,
    responses={**_AUTH, 404: {"model": ErrorResponse},
               200: {"content": {"application/pdf": {}}, "description": "PDF"}},
)
def certificate_pdf(cert_id: uuid.UUID, user: User = Depends(current_user),
                    session: Session = Depends(get_session)):
    row = session.execute(
        select(Certificate.pdf, CertRequest.student_id, User.institution_id)
        .join(CertRequest, CertRequest.id == Certificate.request_id)
        .join(User, User.id == CertRequest.student_id)
        .where(Certificate.request_id == cert_id, CertRequest.status == RequestStatus.ISSUED)
    ).first()
    # Inexistente, no emitido o ajeno: el mismo 404 (no revela existencia).
    if row is None:
        raise not_found("Certificado inexistente")
    pdf, student_id, institution_id = row
    allowed = student_id == user.id if user.role == "student" else institution_id == user.institution_id
    if not allowed:
        raise not_found("Certificado inexistente")
    return Response(
        content=pdf, media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="certificado-{cert_id}.pdf"',
            "Cache-Control": "private, no-store",
        },
    )
