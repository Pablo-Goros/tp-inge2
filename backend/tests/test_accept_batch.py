import datetime as dt
import logging
import threading
import uuid

import bcrypt
import pytest
from sqlalchemy import event, func, select, text
from sqlalchemy.orm import Session

from app.api.errors import ApiError
from app.application.accept_batch import accept_batch
from app.infrastructure.models import Batch, CertRequest, Institution, Outbox, User


def _hash():
    return bcrypt.hashpw(b"demo1234", bcrypt.gensalt(rounds=4)).decode()


@pytest.fixture
def students(session, users):
    inst_id = users["operator"].institution_id
    h = _hash()
    out = [User(institution_id=inst_id, email=f"s{i}@itba.test", name=f"S{i}", password_hash=h, role="student")
           for i in range(25)]
    session.add_all(out)
    session.flush()
    return out


def _token(client, email="op@itba.test"):
    return client.post("/api/auth/login", json={"email": email, "password": "demo1234"}).json()["access_token"]


def _csv(n=20, start=0):
    return ("email\n" + "".join(f"s{i}@itba.test\n" for i in range(start, start + n))).encode()


def _post(client, token, csv_bytes, key="k1", course="Python Avanzado", date="2026-10-30"):
    headers = {"Authorization": f"Bearer {token}"}
    if key is not None:
        headers["Idempotency-Key"] = key
    return client.post(
        "/api/batches", headers=headers,
        data={"course_name": course, "completion_date": date},
        files={"file": ("a.csv", csv_bytes, "text/csv")},
    )


def _counts(session):
    return tuple(session.scalar(select(func.count()).select_from(m)) for m in (Batch, CertRequest, Outbox, User))


def test_valid_batch_201_creates_batch_requests_outbox(client, session, users, students):
    r = _post(client, _token(client), _csv(20))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "IN_PROGRESS" and body["total"] == 20
    reqs = session.scalars(select(CertRequest).where(CertRequest.batch_id == uuid.UUID(body["batch_id"]))).all()
    assert len(reqs) == 20
    assert {q.status for q in reqs} == {"PENDING"}
    assert {q.course_key for q in reqs} == {"python avanzado"}
    assert {q.completion_date for q in reqs} == {dt.date(2026, 10, 30)}
    ob = session.scalars(select(Outbox)).all()
    assert len(ob) == 20 and all(o.published_at is None for o in ob)
    assert {o.request_id for o in ob} == {q.id for q in reqs}
    assert session.scalar(select(Batch.course_name)) == "Python Avanzado"


def test_same_key_same_content_returns_200_same_batch_no_new_rows(client, session, users, students):
    t = _token(client)
    first = _post(client, t, _csv(5)).json()
    before = _counts(session)
    r = _post(client, t, _csv(5))
    assert r.status_code == 200
    assert r.json()["batch_id"] == first["batch_id"] and r.json()["total"] == 5
    assert r.json()["status"] == "IN_PROGRESS"
    assert _counts(session) == before


def test_same_key_different_csv_409_IDEMPOTENCY_CONFLICT(client, session, users, students):
    t = _token(client)
    _post(client, t, _csv(5))
    before = _counts(session)
    r = _post(client, t, _csv(5, start=10))
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    assert _counts(session) == before


@pytest.mark.parametrize("key", [None, "", "   "])
def test_missing_idempotency_key_400_nothing_created(client, session, users, students, key):
    before = _counts(session)
    r = _post(client, _token(client), _csv(3), key=key)
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert _counts(session) == before


def test_invalid_rows_400_lists_details_and_creates_nothing(client, session, users, students):
    before = _counts(session)
    csv = b"email\ns1@itba.test\nnadie@itba.test\nmalo\nS1@ITBA.test\n"
    r = _post(client, _token(client), csv)
    assert r.status_code == 400
    err = r.json()["error"]
    assert err["code"] == "VALIDATION_ERROR"
    assert err["details"] == [
        {"row": 2, "email": "nadie@itba.test", "reason": "NO_ACCOUNT"},
        {"row": 3, "email": "malo", "reason": "INVALID_EMAIL"},
        {"row": 4, "email": "s1@itba.test", "reason": "DUPLICATE_IN_FILE"},
    ]
    assert _counts(session) == before


def test_student_of_other_institution_is_no_account(client, session, users, students):
    other = Institution(name="Otra")
    session.add(other)
    session.flush()
    session.add(User(institution_id=other.id, email="ext@otra.test", name="E", password_hash=_hash(), role="student"))
    session.flush()
    r = _post(client, _token(client), b"email\next@otra.test\n")
    assert r.status_code == 400
    assert r.json()["error"]["details"] == [{"row": 1, "email": "ext@otra.test", "reason": "NO_ACCOUNT"}]


def test_already_requested_in_previous_batch_400(client, session, users, students):
    t = _token(client)
    assert _post(client, t, _csv(3), key="a").status_code == 201
    before = _counts(session)
    r = _post(client, t, _csv(5), key="b", course="  python   AVANZADO ")
    assert r.status_code == 400
    details = r.json()["error"]["details"]
    assert [(d["row"], d["reason"]) for d in details] == [(1, "ALREADY_REQUESTED"), (2, "ALREADY_REQUESTED"),
                                                          (3, "ALREADY_REQUESTED")]
    assert _counts(session) == before
    # otra fecha sí es válida
    assert _post(client, t, _csv(3), key="c", date="2026-11-01").status_code == 201


def test_student_token_403(client, users, students):
    r = _post(client, _token(client, "al@itba.test"), _csv(1))
    assert r.status_code == 403


def test_each_request_gets_its_own_correlation_id(client, session, users, students):
    _post(client, _token(client), _csv(10))
    ids = session.scalars(select(Outbox.correlation_id)).all()
    assert len(ids) == 10 and len(set(ids)) == 10


def test_accept_logs_one_info_line_per_request_with_correlation_id(client, session, users, students, caplog):
    caplog.set_level(logging.INFO, logger="app.application.accept_batch")
    r = _post(client, _token(client), _csv(3))
    batch_id = r.json()["batch_id"]
    rows = session.execute(select(Outbox.request_id, Outbox.correlation_id)).all()
    recs = [x for x in caplog.records if x.name == "app.application.accept_batch" and x.levelno == logging.INFO]
    assert len(recs) == 3
    for rid, cid in rows:
        (msg,) = [x.getMessage() for x in recs if f"correlation_id={cid}" in x.getMessage()]
        assert f"batch_id={batch_id}" in msg and f"request_id={rid}" in msg


@pytest.mark.parametrize("csv", [b"", b"nombre\nx\n", b"email\n", b"\xff\xfe\x00bad"])
def test_csv_format_error_400_row_zero(client, session, users, students, csv):
    before = _counts(session)
    r = _post(client, _token(client), csv)
    assert r.status_code == 400
    d = r.json()["error"]
    assert d["code"] == "VALIDATION_ERROR"
    assert d["details"][0]["row"] == 0 and d["details"][0]["reason"]
    assert _counts(session) == before


def test_csv_field_over_limit_is_malformed_400(client, session, users, students):
    csv = b"email\n" + b"a" * 200_000 + b"\n"
    r = _post(client, _token(client), csv)
    assert r.status_code == 400
    assert r.json()["error"]["details"] == [{"row": 0, "reason": "MALFORMED_CSV"}]


def test_too_many_rows_400(client, session, users, students):
    csv = b"email\n" + b"".join(f"x{i}@itba.test\n".encode() for i in range(101))
    r = _post(client, _token(client), csv)
    assert r.status_code == 400
    assert r.json()["error"]["details"] == [{"row": 0, "reason": "TOO_MANY_ROWS"}]


def test_oversized_upload_400(client, session, users, students):
    r = _post(client, _token(client), b"email\n" + b"x@itba.test\n" * 100_000)
    assert r.status_code == 400 and r.json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.parametrize("kw", [{"date": "30/10/2026"}, {"date": "2026-13-45"}, {"course": ""}, {"course": "x" * 201}])
def test_bad_form_fields_400(client, session, users, students, kw):
    before = _counts(session)
    r = _post(client, _token(client), _csv(2), **kw)
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert _counts(session) == before


def test_whitespace_only_course_name_400(client, session, users, students):
    r = _post(client, _token(client), _csv(2), course="   ")
    assert r.status_code == 400


# --- concurrencia: dos hilos, sesiones/conexiones separadas, datos confirmados ---

_TABLES = "outbox, certificates, cert_requests, batches, users, institutions"


@pytest.fixture
def committed(engine):
    with Session(engine) as s:
        inst = Institution(name="C")
        s.add(inst)
        s.flush()
        op = User(institution_id=inst.id, email="cop@c.test", name="O", password_hash="x", role="operator")
        st = User(institution_id=inst.id, email="cs@c.test", name="S", password_hash="x", role="student")
        s.add_all([op, st])
        s.commit()
        op_id = op.id
    yield op_id
    with engine.begin() as c:
        c.execute(text(f"TRUNCATE {_TABLES} CASCADE"))


def _race(engine, op_id, keys, csvs=None):
    csvs = csvs or [b"email\ncs@c.test\n"] * len(keys)
    barrier = threading.Barrier(len(keys))
    results = [None] * len(keys)

    def run(i):
        with Session(engine) as s:
            barrier.wait(timeout=10)
            try:
                results[i] = accept_batch(s, op_id, "Curso", dt.date(2026, 10, 30), csvs[i], keys[i])
            except Exception as e:  # ApiError esperado; otro tipo (p. ej. deadlock) lo detecta el test
                results[i] = e

    ts = [threading.Thread(target=run, args=(i,)) for i in range(len(keys))]
    [t.start() for t in ts]
    [t.join(timeout=30) for t in ts]
    assert all(r is not None for r in results)
    return results


def _final_counts(engine):
    with Session(engine) as s:
        return tuple(s.scalar(select(func.count()).select_from(m)) for m in (Batch, CertRequest, Outbox))


def test_concurrent_identical_pairs_one_wins_other_gets_400_ALREADY_REQUESTED(engine, committed):
    for _ in range(5):
        with engine.begin() as c:
            c.execute(text("TRUNCATE outbox, cert_requests, batches CASCADE"))
        res = _race(engine, committed, ["ka", "kb"])
        wins = [r for r in res if not isinstance(r, ApiError)]
        losses = [r for r in res if isinstance(r, ApiError)]
        assert len(wins) == 1 and len(losses) == 1
        assert losses[0].status == 400 and losses[0].code == "VALIDATION_ERROR"
        assert losses[0].details == [{"row": 1, "email": "cs@c.test", "reason": "ALREADY_REQUESTED"}]
        assert _final_counts(engine) == (1, 1, 1)
        with Session(engine) as s:
            assert s.scalar(select(Batch.id)) == wins[0].batch_id


def test_concurrent_same_key_one_creates_other_replays(engine, committed):
    for _ in range(5):
        with engine.begin() as c:
            c.execute(text("TRUNCATE outbox, cert_requests, batches CASCADE"))
        res = _race(engine, committed, ["same", "same"])
        assert not any(isinstance(r, ApiError) for r in res), res
        assert sorted(r.replayed for r in res) == [False, True]
        assert res[0].batch_id == res[1].batch_id
        assert _final_counts(engine) == (1, 1, 1)


def test_concurrent_overlapping_reversed_order_no_deadlock(engine, committed):
    n = 60  # filas suficientes para que las inserciones se solapen de verdad
    with Session(engine) as s:
        inst = s.scalar(select(User.institution_id).where(User.id == committed))
        s.add_all([User(institution_id=inst, email=f"r{i}@c.test", name="R", password_hash="x", role="student")
                   for i in range(n)])
        s.commit()
    emails = [f"r{i}@c.test" for i in range(n)]
    a = "\n".join(["email", *emails, ""]).encode()
    b = "\n".join(["email", *reversed(emails), ""]).encode()
    # Sincroniza ambos hilos justo antes del INSERT de cert_requests para forzar el solapamiento.
    gate = {"b": threading.Barrier(2)}

    def _sync(conn, cursor, statement, params, context, executemany):
        if statement.startswith("INSERT INTO cert_requests"):
            try:
                gate["b"].wait(timeout=5)
            except threading.BrokenBarrierError:
                pass

    event.listen(engine, "before_cursor_execute", _sync)
    try:
        for _ in range(10):
            gate["b"] = threading.Barrier(2)
            with engine.begin() as c:
                c.execute(text("TRUNCATE outbox, cert_requests, batches CASCADE"))
            res = _race(engine, committed, ["ka", "kb"], [a, b])
            assert not [r for r in res if isinstance(r, Exception) and not isinstance(r, ApiError)], res
            wins = [r for r in res if not isinstance(r, ApiError)]
            losses = [r for r in res if isinstance(r, ApiError)]
            assert len(wins) == 1 and len(losses) == 1, res
            assert losses[0].status == 400 and losses[0].code == "VALIDATION_ERROR"
            assert {d["reason"] for d in losses[0].details} == {"ALREADY_REQUESTED"}
            assert _final_counts(engine) == (1, n, n)
    finally:
        event.remove(engine, "before_cursor_execute", _sync)


def test_idempotency_key_over_255_400(client, session, users, students):
    before = _counts(session)
    r = _post(client, _token(client), _csv(2), key="k" * 256)
    assert r.status_code == 400 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert _counts(session) == before
    assert _post(client, _token(client), _csv(2), key="k" * 255).status_code == 201


@pytest.mark.parametrize("d", ["0", "2026-13-40", "30/10/2026", "2026-10-30T00:00", "2026-1-3"])
def test_completion_date_strict_format_400(client, session, users, students, d):
    before = _counts(session)
    r = _post(client, _token(client), _csv(2), date=d)
    assert r.status_code == 400 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert _counts(session) == before
