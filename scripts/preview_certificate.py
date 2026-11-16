"""Generate a synthetic diploma for visual review (not a registered certificate)."""
from datetime import date
from decimal import Decimal
from pathlib import Path
from uuid import UUID

from app.infrastructure.pdf import CertificateData, build_verify_url, render_certificate


if __name__ == "__main__":
    cert_id = UUID("d07b5314-7b5a-4c1f-a170-624dbe685606")
    data = CertificateData(cert_id, "Instituto de Formación Tecnológica", "Lucía Pérez-Gómez",
                           "Arquitectura de sistemas y mensajería con RabbitMQ", date(2026, 10, 30),
                           build_verify_url("http://localhost:8080", cert_id), Decimal("9.75"))
    target = Path("output/pdf/certificado-demo.pdf")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(render_certificate(data))
    print(target)
