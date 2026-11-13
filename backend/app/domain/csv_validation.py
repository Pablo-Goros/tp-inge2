"""Parseo y validación del CSV de lote (docs/contracts.md §5). Funciones puras."""
import csv
import io
from dataclasses import dataclass
from datetime import date
from typing import Literal
from uuid import UUID

from app.domain.normalize import normalize_email

MAX_ROWS = 100

Reason = Literal["NO_ACCOUNT", "DUPLICATE_IN_FILE", "ALREADY_REQUESTED", "INVALID_EMAIL"]


class CsvFormatError(Exception):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class RowIssue:
    row: int
    email: str
    reason: Reason


def parse_csv(data: bytes) -> list[str]:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise CsvFormatError("INVALID_ENCODING") from None
    try:
        rows = list(csv.reader(io.StringIO(text, newline="")))
    except csv.Error:
        raise CsvFormatError("MALFORMED_CSV") from None
    rows = [r for r in rows if any(c.strip() for c in r)]
    if not rows:
        raise CsvFormatError("EMPTY_FILE")
    header = [c.strip().lower() for c in rows[0]]
    if "email" not in header:
        raise CsvFormatError("MISSING_EMAIL_COLUMN")
    idx = header.index("email")
    emails = [r[idx].strip() if idx < len(r) else "" for r in rows[1:]]
    if not emails:
        raise CsvFormatError("NO_DATA_ROWS")
    if len(emails) > MAX_ROWS:
        raise CsvFormatError("TOO_MANY_ROWS")
    return emails


def _is_valid_email(e: str) -> bool:
    if not e or any(c.isspace() for c in e) or e.count("@") != 1:
        return False
    local, domain = e.split("@")
    return bool(local) and bool(domain) and "." in domain


def validate_rows(
    emails: list[str],
    known_students: dict[str, UUID],
    existing: set[tuple[UUID, str, date]],
    course_key: str,
    completion_date: date,
) -> list[RowIssue]:
    issues: list[RowIssue] = []
    seen: set[str] = set()
    for row, raw in enumerate(emails, start=1):
        email = normalize_email(raw)
        reason: Reason | None = None
        if not _is_valid_email(email):
            reason = "INVALID_EMAIL"
        elif email not in known_students:
            reason = "NO_ACCOUNT"
        elif email in seen:
            reason = "DUPLICATE_IN_FILE"
        elif (known_students[email], course_key, completion_date) in existing:
            reason = "ALREADY_REQUESTED"
        seen.add(email)
        if reason:
            issues.append(RowIssue(row, email, reason))
    return issues
