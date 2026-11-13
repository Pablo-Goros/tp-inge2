import datetime as dt
import uuid
from typing import Literal

from pydantic import BaseModel

BatchStatus = Literal["IN_PROGRESS", "COMPLETED", "COMPLETED_WITH_ERRORS"]


class ErrorBody(BaseModel):
    code: Literal[
        "VALIDATION_ERROR", "UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND",
        "IDEMPOTENCY_CONFLICT", "UNAVAILABLE",
    ]
    message: str
    details: list = []


class ErrorResponse(BaseModel):
    error: ErrorBody


class BatchCreated(BaseModel):
    batch_id: uuid.UUID
    status: BatchStatus
    total: int


class BatchSummary(BatchCreated):
    course_name: str
    completion_date: dt.date
    created_at: dt.datetime


class BatchCounts(BaseModel):
    total: int
    pending: int
    processing: int
    issued: int
    failed: int


class BatchItem(BaseModel):
    certificate_id: uuid.UUID
    student_name: str
    student_email: str
    status: Literal["PENDING", "PROCESSING", "ISSUED", "FAILED"]
    attempts: int
    last_error: str | None


class BatchDetail(BaseModel):
    batch_id: uuid.UUID
    course_name: str
    completion_date: dt.date
    status: BatchStatus
    counts: BatchCounts
    items: list[BatchItem]


class MyCertificate(BaseModel):
    certificate_id: uuid.UUID
    course_name: str
    completion_date: dt.date
    issued_at: dt.datetime


class VerifyResponse(BaseModel):
    status: Literal["REGISTERED"]
    certificate_id: uuid.UUID
    student_name: str
    institution: str
    course_name: str
    completion_date: dt.date


class VerifyFileResponse(BaseModel):
    result: Literal["VALID", "ALTERED", "NOT_FOUND"]
