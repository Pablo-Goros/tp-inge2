import datetime as dt
import uuid

import bcrypt
import pytest
from sqlalchemy import event

from app.application.batch_status import Counts, derive_batch_status
from app.infrastructure.models import Batch, CertRequest, User


def test_status_in_progress_when_any_pending_or_processing():
    assert derive_batch_status(Counts(pending=1, processing=0, issued=5, failed=2)) == "IN_PROGRESS"
    assert derive_batch_status(Counts(pending=0, processing=1, issued=0, failed=0)) == "IN_PROGRESS"


def test_completed_when_all_issued():
    assert derive_batch_status(Counts(0, 0, 3, 0)) == "COMPLETED"


def test_completed_with_errors_when_any_failed_and_none_open():
    assert derive_batch_status(Counts(0, 0, 2, 1)) == "COMPLETED_WITH_ERRORS"


def test_zero_total_derive_does_not_crash():
    assert derive_batch_status(Counts(0, 0, 0, 0)) == "COMPLETED"


def _token(client, email="op@itba.test"):
    return client.post("/api/auth/login", json={"email": email, "password": "demo1234"}).json()["access_token"]


def _h(client, email="op@itba.test"):
    return {"Authorization": f"Bearer {_token(client, email)}"}


def _mk_batch(session, operator, n_by_status, course="Curso", date=dt.date(2026, 10, 30), created=None, errors=None):
    """n_by_status: lista de estados, un alumno nuevo por cada uno."""
    b = Batch(id=uuid.uuid4(), operator_id=operator.id, course_name=course, completion_date=date,
              idempotency_key=str(uuid.uuid4()), request_fingerprint="x")
    if created:
        b.created_at = created
    session.add(b)
    session.flush()
    h = bcrypt.hashpw(b"demo1234", bcrypt.gensalt(rounds=4)).decode()
    reqs = []
    for i, st in enumerate(n_by_status):
        u = User(institution_id=operator.institution_id, email=f"{b.id}-{i}@itba.test", name=f"Alumno {i:02d}",
                 password_hash=h, role="student")
        session.add(u)
        session.flush()
        r = CertRequest(id=uuid.uuid4(), batch_id=b.id, student_id=u.id, course_key=course.lower(),
                        completion_date=date, status=st, attempts=(errors or {}).get(i, (0, None))[0],
                        last_error=(errors or {}).get(i, (0, None))[1])
        session.add(r)
        reqs.append(r)
    session.flush()
    return b, reqs


def test_counts_match_across_statuses_with_all_four_states(client, session, users):
    b, _ = _mk_batch(session, users["operator"], ["PENDING", "PROCESSING", "PROCESSING", "ISSUED", "ISSUED", "ISSUED", "FAILED"])
    r = client.get(f"/api/batches/{b.id}", headers=_h(client))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["counts"] == {"total": 7, "pending": 1, "processing": 2, "issued": 3, "failed": 1}
    assert body["status"] == "IN_PROGRESS"
    assert body["batch_id"] == str(b.id) and body["course_name"] == "Curso" and body["completion_date"] == "2026-10-30"
    assert [i["student_name"] for i in body["items"]] == [f"Alumno {i:02d}" for i in range(7)]


def test_detail_includes_last_error_and_attempts(client, session, users):
    b, reqs = _mk_batch(session, users["operator"], ["ISSUED", "FAILED"], errors={1: (3, "boom")})
    body = client.get(f"/api/batches/{b.id}", headers=_h(client)).json()
    assert body["status"] == "COMPLETED_WITH_ERRORS"
    ok, bad = body["items"]
    assert ok == {"certificate_id": str(reqs[0].id), "student_name": "Alumno 00",
                  "student_email": f"{b.id}-0@itba.test", "status": "ISSUED", "attempts": 0, "last_error": None}
    assert bad["attempts"] == 3 and bad["last_error"] == "boom" and bad["status"] == "FAILED"


def test_other_operators_batch_404(client, session, users):
    from app.infrastructure.models import User as U
    h = bcrypt.hashpw(b"demo1234", bcrypt.gensalt(rounds=4)).decode()
    op2 = U(institution_id=users["operator"].institution_id, email="op2@itba.test", name="Op2", password_hash=h, role="operator")
    session.add(op2)
    session.flush()
    b, _ = _mk_batch(session, op2, ["ISSUED"])
    r = client.get(f"/api/batches/{b.id}", headers=_h(client))
    assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"


def test_unknown_id_404_and_malformed_400(client, users):
    r = client.get(f"/api/batches/{uuid.uuid4()}", headers=_h(client))
    assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"
    r = client.get("/api/batches/nope", headers=_h(client))
    assert r.status_code == 400 and r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_student_403_on_both_routes(client, users):
    h = _h(client, "al@itba.test")
    for path in ("/api/batches", f"/api/batches/{uuid.uuid4()}"):
        r = client.get(path, headers=h)
        assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN"


def test_list_most_recent_first_with_counts_and_scoped_to_operator(client, session, users):
    op = users["operator"]
    t = dt.datetime(2026, 11, 1, tzinfo=dt.timezone.utc)
    old, _ = _mk_batch(session, op, ["ISSUED"], course="Viejo", created=t)
    new, _ = _mk_batch(session, op, ["PENDING", "FAILED"], course="Nuevo", created=t + dt.timedelta(days=1))
    h = bcrypt.hashpw(b"demo1234", bcrypt.gensalt(rounds=4)).decode()
    op2 = User(institution_id=op.institution_id, email="op2@itba.test", name="Op2", password_hash=h, role="operator")
    session.add(op2)
    session.flush()
    _mk_batch(session, op2, ["ISSUED"], course="Ajeno", created=t + dt.timedelta(days=2))
    r = client.get("/api/batches", headers=_h(client))
    assert r.status_code == 200
    body = r.json()
    assert [b["batch_id"] for b in body] == [str(new.id), str(old.id)]
    assert body[0]["status"] == "IN_PROGRESS" and body[0]["total"] == 2
    assert body[0]["counts"] == {"total": 2, "pending": 1, "processing": 0, "issued": 0, "failed": 1}
    assert body[1]["status"] == "COMPLETED" and body[1]["course_name"] == "Viejo"
    assert body[1]["completion_date"] == "2026-10-30" and "created_at" in body[1]


def _count_statements(engine_conn_session, fn):
    n = []
    bind = engine_conn_session.get_bind()
    eng = bind.engine if hasattr(bind, "engine") else bind
    def cb(*a, **k):
        n.append(1)
    event.listen(eng, "before_cursor_execute", cb)
    try:
        fn()
    finally:
        event.remove(eng, "before_cursor_execute", cb)
    return len(n)


def test_detail_and_list_statement_count_does_not_grow_with_items(client, session, users):
    op = users["operator"]
    h = _h(client)
    small, _ = _mk_batch(session, op, ["ISSUED"] * 2)
    big, _ = _mk_batch(session, op, ["ISSUED", "FAILED", "PENDING"] * 10)
    n_small = _count_statements(session, lambda: client.get(f"/api/batches/{small.id}", headers=h))
    n_big = _count_statements(session, lambda: client.get(f"/api/batches/{big.id}", headers=h))
    assert n_small == n_big
    l2 = _count_statements(session, lambda: client.get("/api/batches", headers=h))
    _mk_batch(session, op, ["ISSUED"])
    _mk_batch(session, op, ["ISSUED"])
    l4 = _count_statements(session, lambda: client.get("/api/batches", headers=h))
    assert l2 == l4
