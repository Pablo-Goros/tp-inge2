from dataclasses import replace
from datetime import date
from decimal import Decimal
from io import BytesIO
from uuid import uuid4

from pypdf import PdfReader
import pytest

from app.infrastructure.pdf import CertificateData, build_verify_url, render_certificate


def diploma(**overrides):
    data = CertificateData(uuid4(), "Institución de Capacitación", "Ñandú Pérez-Gómez",
                           "Introducción a Python", date(2026, 10, 30), "https://demo.test/verify/id")
    return replace(data, **overrides)


@pytest.mark.parametrize("grade,expected", [(None, None), (Decimal("0"), "0.00"),
                                             (Decimal("9.75"), "9.75"), (Decimal("10"), "10.00")])
def test_diploma_contains_academic_data_and_optional_exact_grade(grade, expected):
    data = diploma(final_grade=grade)
    pdf = render_certificate(data)
    reader = PdfReader(BytesIO(pdf))
    assert pdf.startswith(b"%PDF-") and len(reader.pages) == 1
    page = reader.pages[0]
    assert float(page.mediabox.width) > float(page.mediabox.height)
    text = page.extract_text()
    for value in (data.institution, data.student_name, data.course_name,
                  data.completion_date.isoformat(), str(data.cert_id)):
        assert value in text
    if expected is None:
        assert "Nota final" not in text
    else:
        assert f"Nota final: {expected}" in text
    assert page["/Annots"][0].get_object()["/A"]["/URI"] == data.verify_url


def test_qr_encodes_public_url_and_document_is_stable(monkeypatch):
    import app.infrastructure.pdf as module
    actual_make = module.qrcode.make
    encoded = []

    def make(content, **kwargs):
        encoded.append(content)
        return actual_make(content, **kwargs)

    monkeypatch.setattr(module.qrcode, "make", make)
    data = diploma()
    assert render_certificate(data) == render_certificate(data)
    assert encoded == [data.verify_url, data.verify_url]
    assert render_certificate(replace(data, cert_id=uuid4())) != render_certificate(data)


def test_long_accented_names_and_markup_are_not_interpreted():
    pdf = render_certificate(diploma(student_name="Ñandú Pérez-Gómez " * 8,
                                     course_name="Programación <avanzada> & análisis " * 6))
    text = PdfReader(BytesIO(pdf)).pages[0].extract_text()
    assert "<avanzada>" in text and "Ñandú" in text


def test_verify_url_joins_without_double_slash():
    cert_id = uuid4()
    assert build_verify_url("https://demo.test/", cert_id) == f"https://demo.test/verify/{cert_id}"
    assert build_verify_url("https://demo.test", cert_id) == f"https://demo.test/verify/{cert_id}"
