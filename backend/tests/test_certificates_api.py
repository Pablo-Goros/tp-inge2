import datetime as dt
import uuid

import bcrypt
import pytest

from app.infrastructure.models import Batch, Certificate, CertRequest, Institution, RequestStatus, User

PDF = b"%PDF-1.4\n\x00\xff fake pdf bytes \n%%EOF"


def _auth(client, email):
    r = client.post("/api/auth/login", json={"email": email, "password": "demo1234"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _cert(session, op, student, status=RequestStatus.ISSUED, course="Curso", date=dt.date(2026, 1, 5),
          issued_at=None, pdf=PDF, with_row=True):
    b = Batch(operator_id=op.id, course_name=course, completion_date=date,
              idempotency_key=str(uuid.uuid4()), request_fingerprint="x")
    session.add(b)
    session.flush()
    r = CertRequest(batch_id=b.id, student_id=student.id, course_key=course.lower(),
                    completion_date=date, status=status)
    session.add(r)
    session.flush()
    if with_row:
        c = Certificate(request_id=r.id, pdf=pdf, sha256="0" * 64)
        if issued_at:
            c.issued_at = issued_at
        session.add(c)
        session.flush()
    return r


def _other_student(session, users, email="otro@itba.test"):
    s = User(institution_id=users["student"].institution_id, email=email, name="Otro",
             password_hash=users["student"].password_hash, role="student")
    session.add(s)
    session.flush()
    return s


def test_student_lists_only_own_issued_certificates(client, users, session):
    op, st = users["operator"], users["student"]
    mine = _cert(session, op, st, course="Python")
    _cert(session, op, _other_student(session, users), course="Ajeno")
    r = client.get("/api/me/certificates", headers=_auth(client, "al@itba.test"))
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["certificate_id"] == str(mine.id)
    assert body[0]["course_name"] == "Python"
    assert body[0]["completion_date"] == "2026-01-05"
    assert set(body[0]) == {"certificate_id", "course_name", "completion_date", "issued_at"}
    assert "@" not in r.text and "$2" not in r.text


def test_list_excludes_not_issued(client, users, session):
    op, st = users["operator"], users["student"]
    for i, s in enumerate((RequestStatus.PENDING, RequestStatus.PROCESSING, RequestStatus.FAILED)):
        _cert(session, op, st, status=s, course=f"c{i}", with_row=False)
    # ISSUED sin fila certificates: tampoco se lista
    _cert(session, op, st, course="sinfila", with_row=False)
    # No emitidos CON PDF almacenado: tampoco se listan
    for i, s in enumerate((RequestStatus.PENDING, RequestStatus.PROCESSING, RequestStatus.FAILED)):
        _cert(session, op, st, status=s, course=f"conpdf{i}")
    assert client.get("/api/me/certificates", headers=_auth(client, "al@itba.test")).json() == []


def test_list_ordering_issued_at_desc(client, users, session):
    op, st = users["operator"], users["student"]
    t = dt.datetime(2026, 3, 1, tzinfo=dt.timezone.utc)
    old = _cert(session, op, st, course="viejo", issued_at=t)
    new = _cert(session, op, st, course="nuevo", issued_at=t + dt.timedelta(days=1))
    ids = [c["certificate_id"] for c in client.get("/api/me/certificates", headers=_auth(client, "al@itba.test")).json()]
    assert ids == [str(new.id), str(old.id)]


def test_student_downloads_own_pdf(client, users, session):
    r = _cert(session, users["operator"], users["student"])
    resp = client.get(f"/api/certificates/{r.id}/pdf", headers=_auth(client, "al@itba.test"))
    assert resp.status_code == 200
    assert resp.content == PDF
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.headers["content-disposition"] == f'attachment; filename="certificado-{r.id}.pdf"'
    assert resp.headers["content-length"] == str(len(PDF))
    assert resp.headers["cache-control"] == "private, no-store"


def test_student_other_students_pdf_404(client, users, session):
    r = _cert(session, users["operator"], _other_student(session, users))
    resp = client.get(f"/api/certificates/{r.id}/pdf", headers=_auth(client, "al@itba.test"))
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


@pytest.mark.parametrize("with_row", [False, True])
@pytest.mark.parametrize("status", [RequestStatus.PENDING, RequestStatus.PROCESSING, RequestStatus.FAILED])
def test_pdf_not_yet_issued_404(client, users, session, status, with_row):
    r = _cert(session, users["operator"], users["student"], status=status, with_row=with_row)
    for email in ("al@itba.test", "op@itba.test"):
        resp = client.get(f"/api/certificates/{r.id}/pdf", headers=_auth(client, email))
        assert resp.status_code == 404


def test_operator_can_download_any_pdf_of_its_institution(client, users, session):
    r = _cert(session, users["operator"], users["student"])
    resp = client.get(f"/api/certificates/{r.id}/pdf", headers=_auth(client, "op@itba.test"))
    assert resp.status_code == 200
    assert resp.content == PDF


def test_operator_of_other_institution_404(client, users, session):
    r = _cert(session, users["operator"], users["student"])
    inst2 = Institution(name="Otra")
    session.add(inst2)
    session.flush()
    session.add(User(institution_id=inst2.id, email="op2@x.test", name="Op2",
                     password_hash=users["operator"].password_hash, role="operator"))
    session.flush()
    resp = client.get(f"/api/certificates/{r.id}/pdf", headers=_auth(client, "op2@x.test"))
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


def test_nonexistent_id_404_and_malformed_400(client, users):
    h = _auth(client, "al@itba.test")
    assert client.get(f"/api/certificates/{uuid.uuid4()}/pdf", headers=h).status_code == 404
    r = client.get("/api/certificates/no-es-uuid/pdf", headers=h)
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_operator_token_on_me_certificates_403(client, users):
    r = client.get("/api/me/certificates", headers=_auth(client, "op@itba.test"))
    assert r.status_code == 403


def test_no_token_401(client, users):
    assert client.get("/api/me/certificates").status_code == 401
    assert client.get(f"/api/certificates/{uuid.uuid4()}/pdf").status_code == 401


def test_all_404_bodies_identical(client, users, session):
    op, st = users["operator"], users["student"]
    inst2 = Institution(name="Otra")
    session.add(inst2)
    session.flush()
    session.add(User(institution_id=inst2.id, email="op2@x.test", name="Op2",
                     password_hash=users["operator"].password_hash, role="operator"))
    session.flush()
    other = _cert(session, op, _other_student(session, users))
    mine = _cert(session, op, st)
    failed = _cert(session, op, st, status=RequestStatus.FAILED, course="f")
    proc = _cert(session, op, st, status=RequestStatus.PROCESSING, course="p")
    cases = [
        ("al@itba.test", other.id), ("op2@x.test", mine.id), ("al@itba.test", failed.id),
        ("op@itba.test", proc.id), ("al@itba.test", uuid.uuid4()),
    ]
    bodies = []
    for email, cid in cases:
        r = client.get(f"/api/certificates/{cid}/pdf", headers=_auth(client, email))
        assert r.status_code == 404
        bodies.append(r.json())
    assert all(b == bodies[0] for b in bodies)
    assert bodies[0]["error"]["code"] == "NOT_FOUND"
