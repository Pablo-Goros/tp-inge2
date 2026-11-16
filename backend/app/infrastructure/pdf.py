"""One-page diploma. Only persisted academic data enters the document."""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from io import BytesIO
from uuid import UUID
from xml.sax.saxutils import escape

import qrcode
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph


@dataclass(frozen=True)
class CertificateData:
    cert_id: UUID
    institution: str
    student_name: str
    course_name: str
    completion_date: date
    verify_url: str
    final_grade: Decimal | None = None


def build_verify_url(public_base_url: str, cert_id: UUID) -> str:
    return f"{public_base_url.rstrip('/')}/verify/{cert_id}"


def _centered(canvas, text, top, width, max_height, font, size, color):
    # Paragraph escapes prevent academic names being interpreted as markup.
    while size >= 8:
        style = ParagraphStyle("diploma", fontName=font, fontSize=size,
                               leading=size * 1.25, alignment=TA_CENTER, textColor=color)
        paragraph = Paragraph(escape(text), style)
        _, height = paragraph.wrap(width, max_height)
        if height <= max_height:
            paragraph.drawOn(canvas, (landscape(A4)[0] - width) / 2, top - height)
            return
        size -= 1
    raise ValueError("El texto no cabe en el certificado")


def render_certificate(data: CertificateData) -> bytes:
    output = BytesIO()
    width, height = landscape(A4)
    navy, gold = HexColor("#17334D"), HexColor("#B28A4E")
    canvas = Canvas(output, pagesize=(width, height), invariant=True, pageCompression=1)
    canvas.setTitle("Certificado de finalización")
    canvas.setAuthor(data.institution)
    canvas.setFillColor(HexColor("#FCFAF5"))
    canvas.rect(0, 0, width, height, fill=1, stroke=0)
    canvas.setStrokeColor(navy)
    canvas.setLineWidth(2)
    canvas.rect(24, 24, width - 48, height - 48)
    canvas.setStrokeColor(gold)
    canvas.setLineWidth(0.6)
    canvas.rect(31, 31, width - 62, height - 62)
    _centered(canvas, data.institution, 547, 680, 42, "Helvetica-Bold", 17, navy)
    _centered(canvas, "CERTIFICADO DE FINALIZACIÓN", 480, 710, 50, "Times-Roman", 29, navy)
    _centered(canvas, "Se certifica que", 408, 680, 24, "Helvetica", 12, navy)
    _centered(canvas, data.student_name, 375, 680, 68, "Times-Bold", 29, navy)
    _centered(canvas, "ha finalizado el curso", 292, 680, 24, "Helvetica", 12, navy)
    _centered(canvas, data.course_name, 258, 680, 66, "Helvetica-Bold", 20, navy)
    _centered(canvas, f"Fecha de finalización: {data.completion_date.isoformat()}",
              178, 520, 24, "Helvetica", 11, navy)
    if data.final_grade is not None:
        _centered(canvas, f"Nota final: {data.final_grade:.2f}",
                  153, 520, 24, "Helvetica-Bold", 11, navy)
    qr = qrcode.make(data.verify_url, box_size=8, border=4).get_image()
    canvas.drawImage(ImageReader(qr), width - 158, 49, width=102, height=102)
    canvas.setFillColor(navy)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(56, 93, "Identificador del certificado")
    canvas.setFont("Courier", 9)
    canvas.drawString(56, 76, str(data.cert_id))
    canvas.setFont("Helvetica", 8)
    canvas.drawString(56, 56, "Escaneá el QR para consultar el registro y verificar el archivo original.")
    canvas.linkURL(data.verify_url, (width - 158, 49, width - 56, 151), relative=0)
    canvas.showPage()
    canvas.save()
    return output.getvalue()
