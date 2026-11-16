from decimal import Decimal
from hashlib import sha256
from io import BytesIO
from uuid import uuid4

from fastapi.testclient import TestClient
from pypdf import PdfReader
from sqlalchemy import select

from app.api.main import create_app
from app.api.verification import RegistryVerification, VerificationUnavailable
from app.application.publish_outbox import publish_pending
from app.domain.registry import RegistryUnavailable
from app.entrypoints.worker import handle_message
from app.infrastructure.models import Certificate, CertRequest, User
from app.infrastructure.registry_simulated import SimulatedRegistry
from tests.test_worker_integration import dependencies, receive, worker_channel


def token(client, email):
    response = client.post("/api/auth/login", json={"email": email, "password": "demo1234"})
    assert response.status_code == 200, response.text
    return {"Authorization": "Bearer " + response.json()["access_token"]}


def test_real_http_batch_to_worker_download_and_public_verification(issuance_db, worker_channel):
    factory, make = issuance_db
    make(2)
    with factory() as session:
        email = session.scalar(select(User.email).where(User.role == "operator"))
    with TestClient(create_app()) as client:
        operator = token(client, email)
        response = client.post("/api/batches", headers={**operator, "Idempotency-Key": str(uuid4())},
                               data={"course_name": "Curso E2E", "completion_date": "2026-10-30"},
                               files={"file": ("students.csv", b"email,final_grade\nalumno01@demo.test,9.75\nalumno02@demo.test,\n")})
        assert response.status_code == 201, response.text
        batch_id = response.json()["batch_id"]
        with factory() as session:
            publish_pending(session, worker_channel)
        deps = dependencies(factory)
        for _ in range(4):  # two fixture requests and the two accepted over HTTP
            handle_message(worker_channel, *receive(worker_channel), deps=deps)
        batch = client.get(f"/api/batches/{batch_id}", headers=operator).json()
        assert batch["status"] == "COMPLETED" and batch["counts"]["issued"] == 2
        for item in batch["items"]:
            cert_id = item["certificate_id"]
            owner = token(client, item["student_email"])
            response = client.get(f"/api/certificates/{cert_id}/pdf", headers=owner)
            assert response.status_code == 200 and response.headers["content-type"] == "application/pdf"
            pdf = response.content
            text = PdfReader(BytesIO(pdf)).pages[0].extract_text()
            assert ("Nota final: 9.75" in text) == (item["final_grade"] is not None)
            if item["final_grade"] is None:
                assert "Nota final" not in text
            public = client.get(f"/api/verify/{cert_id}")
            assert public.status_code == 200
            assert set(public.json()) == {"status", "certificate_id", "student_name", "institution",
                                          "course_name", "completion_date"}
            assert client.post(f"/api/verify/{cert_id}/file", files={"file": ("x.pdf", pdf)}).json() == {"result": "VALID"}
            assert client.post(f"/api/verify/{cert_id}/file", files={"file": ("x.pdf", pdf + b"x")}).json() == {"result": "ALTERED"}
            other_email = "alumno02@demo.test" if item["student_email"] == "alumno01@demo.test" else "alumno01@demo.test"
            assert client.get(f"/api/certificates/{cert_id}/pdf", headers=token(client, other_email)).status_code == 404
        ghost = uuid4()
        assert client.get(f"/api/verify/{ghost}").status_code == 404
        assert client.post(f"/api/verify/{ghost}/file", files={"file": ("x", b"x")}).json() == {"result": "NOT_FOUND"}


def test_local_certificate_alone_does_not_prove_registration(issuance_db):
    factory, make = issuance_db
    request_id, = make(final_grade=Decimal("0"))
    with factory() as session, session.begin():
        session.add(Certificate(request_id=request_id, pdf=b"original", sha256=sha256(b"wrong").hexdigest()))
    registry = SimulatedRegistry(factory)
    service = RegistryVerification(factory, registry)
    assert service.lookup(request_id) is None
    assert service.compare_file(request_id, b"original") == "NOT_FOUND"
    registry.register(request_id, sha256(b"original").hexdigest())
    assert service.compare_file(request_id, b"original") == "VALID"
    assert service.lookup(request_id).certificate_id == request_id


def test_registry_outage_maps_to_http_unavailability(issuance_db):
    import pytest
    factory, _ = issuance_db
    class Offline:
        def lookup(self, cert_id):
            raise RegistryUnavailable
    service = RegistryVerification(factory, Offline())
    with pytest.raises(VerificationUnavailable):
        service.lookup(uuid4())
    with pytest.raises(VerificationUnavailable):
        service.compare_file(uuid4(), b"x")
