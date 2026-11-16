"""Parseo y validación del CSV de lote (docs/contracts.md §5). Funciones puras."""
import csv
import io
from dataclasses import dataclass
from datetime import date
from typing import Literal
from uuid import UUID

from app.domain.normalize import normalize_email

MAX_ROWS = 100
csv.field_size_limit(1_048_576)

Reason = Literal["NO_ACCOUNT", "DUPLICATE_IN_FILE", "ALREADY_REQUESTED", "INVALID_EMAIL", "EMPTY_ROW", "INVALID_FIELD_COUNT", "INVALID_GRADE"]


class CsvFormatError(Exception):
    def __init__(self, reason: str, row: int = 0):
        super().__init__(reason)
        self.reason = reason
        self.row = row
        self.issues: list[RowIssue] = []
        self.rows: list[CsvRow] | None = None


@dataclass(frozen=True)
class RowIssue:
    row: int
    email: str
    reason: Reason


@dataclass(frozen=True)
class CsvRow:
    email: str
    final_grade: str = ""


def parse_csv(data: bytes) -> list[str]:
    return [row.email for row in parse_csv_rows(data)]


def parse_csv_rows(data: bytes) -> list[CsvRow]:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise CsvFormatError("INVALID_ENCODING") from None
    try:
        rows = list(csv.reader(io.StringIO(text, newline=""), strict=True))
    except csv.Error:
        raise CsvFormatError("MALFORMED_CSV") from None
    while rows and not rows[-1]:
        rows.pop()
    if not rows:
        raise CsvFormatError("EMPTY_FILE")
    header = [c.strip().lower() for c in rows[0]]
    if "email" not in header:
        raise CsvFormatError("MISSING_EMAIL_COLUMN")
    if len(set(header)) != len(header):
        raise CsvFormatError("DUPLICATE_COLUMN")
    if set(header) - {"email", "final_grade"}:
        raise CsvFormatError("UNKNOWN_COLUMN")
    idx = header.index("email")
    parsed = []
    issues = []
    for number, fields in enumerate(rows[1:], start=1):
        email = fields[idx].strip() if idx < len(fields) else ""
        grade_index = header.index("final_grade") if "final_grade" in header else None
        grade = fields[grade_index].strip() if grade_index is not None and grade_index < len(fields) else ""
        parsed.append(CsvRow(email, grade))
        if not fields:
            issues.append(RowIssue(number, email, "EMPTY_ROW"))
        elif len(fields) != len(header):
            issues.append(RowIssue(number, email, "INVALID_FIELD_COUNT"))
    if not parsed:
        raise CsvFormatError("NO_DATA_ROWS")
    if len(parsed) > MAX_ROWS:
        raise CsvFormatError("TOO_MANY_ROWS")
    if issues:
        error = CsvFormatError(issues[0].reason, issues[0].row)
        error.issues = issues
        error.rows = parsed
        raise error
    return parsed


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
    excluded_rows: set[int] | None = None,
) -> list[RowIssue]:
    issues: list[RowIssue] = []
    seen: set[str] = set()
    for row, raw in enumerate(emails, start=1):
        if excluded_rows and row in excluded_rows:
            continue
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
