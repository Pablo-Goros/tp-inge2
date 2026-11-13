from datetime import date
from uuid import uuid4

import pytest

from app.domain.csv_validation import CsvFormatError, RowIssue, parse_csv, validate_rows
from app.domain.normalize import course_key, normalize_email

D = date(2026, 10, 30)


def reason_of(data: bytes) -> str:
    with pytest.raises(CsvFormatError) as e:
        parse_csv(data)
    return e.value.reason


def test_bom_and_crlf_accepted():
    assert parse_csv(b"\xef\xbb\xbfemail\r\na@x.com\r\nb@x.com\r\n") == ["a@x.com", "b@x.com"]


def test_trailing_blank_line_ignored():
    assert parse_csv(b"email\na@x.com\n\n\n") == ["a@x.com"]


def test_header_only_rejected():
    assert reason_of(b"email\n") == "NO_DATA_ROWS"


def test_empty_file_rejected():
    assert reason_of(b"") == "EMPTY_FILE"


def test_missing_email_column_rejected():
    assert reason_of(b"mail\na@x.com\n") == "MISSING_EMAIL_COLUMN"


def test_invalid_encoding_rejected():
    assert reason_of(b"email\n\xff\xfe@x.com\n") == "INVALID_ENCODING"


def test_101_rows_rejected():
    data = "email\n" + "".join(f"a{i}@x.com\n" for i in range(101))
    assert reason_of(data.encode()) == "TOO_MANY_ROWS"


def test_100_rows_accepted():
    data = "email\n" + "".join(f"a{i}@x.com\n" for i in range(100))
    assert len(parse_csv(data.encode())) == 100


def test_course_key_collapses_spaces_and_casefolds():
    assert course_key("  Intro   a  Python ") == "intro a python"
    assert normalize_email(" A@X.com ") == "a@x.com"


def test_email_case_and_spaces_normalized_before_duplicate_check():
    sid = uuid4()
    issues = validate_rows([" A@x.com", "a@x.com"], {"a@x.com": sid}, set(), "c", D)
    assert issues == [RowIssue(row=2, email="a@x.com", reason="DUPLICATE_IN_FILE")]


def test_row_numbers_start_at_1_without_header():
    issues = validate_rows(["bad"], {}, set(), "c", D)
    assert issues[0].row == 1


def test_no_account():
    issues = validate_rows(["a@x.com"], {}, set(), "c", D)
    assert issues == [RowIssue(row=1, email="a@x.com", reason="NO_ACCOUNT")]


def test_already_requested():
    sid = uuid4()
    issues = validate_rows(["a@x.com"], {"a@x.com": sid}, {(sid, "c", D)}, "c", D)
    assert issues == [RowIssue(row=1, email="a@x.com", reason="ALREADY_REQUESTED")]


def test_invalid_email():
    for bad in ["nope", "a@b", "a@@x.com", "@x.com", "a@", "a b@x.com", ""]:
        issues = validate_rows([bad], {}, set(), "c", D)
        assert issues[0].reason == "INVALID_EMAIL", bad


def test_valid_rows_no_issues():
    sid = uuid4()
    assert validate_rows(["a@x.com"], {"a@x.com": sid}, set(), "c", D) == []


def test_all_issues_reported_not_only_first():
    sid = uuid4()
    known = {"a@x.com": sid, "d@x.com": uuid4()}
    existing = {(known["d@x.com"], "c", D)}
    issues = validate_rows(["bad", "zz@x.com", "a@x.com", "A@x.com", "d@x.com"], known, existing, "c", D)
    assert [(i.row, i.reason) for i in issues] == [
        (1, "INVALID_EMAIL"),
        (2, "NO_ACCOUNT"),
        (4, "DUPLICATE_IN_FILE"),
        (5, "ALREADY_REQUESTED"),
    ]
