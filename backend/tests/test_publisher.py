import datetime as dt
import json
import logging
import os
import signal
import subprocess
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

import pika
import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from tests._safety import require_test_db, require_test_broker
from app.application.publish_outbox import publish_pending
from app.infrastructure.broker import connect, declare_topology
from app.infrastructure.models import Batch, CertRequest, Institution, Outbox, User

COMPOSE = ["docker", "compose", "-f", os.path.join(os.path.dirname(__file__), "docker-compose.test.yml"),
           "-p", "frente-b-test"]


def _purge(ch):
    for q in ("cert.issue", "cert.issue.wait", "cert.issue.dlq"):
        ch.queue_purge(q)


@pytest.fixture
def channel():
    require_test_broker()
    conn = connect(os.environ["RABBITMQ_URL"])
    ch = conn.channel()
    declare_topology(ch)
    _purge(ch)
    ch.confirm_delivery()  # publish_pending exige confirmaciones ya habilitadas (una vez por canal)
    yield ch
    try:
        _purge(ch)
    finally:
        conn.close()


def make_outbox(session, n):
    """n filas de outbox (con sus cert_requests); devuelve los Outbox en orden de creación."""
    inst = Institution(name="ITBA")
    session.add(inst)
    session.flush()
    op = User(institution_id=inst.id, email=f"{uuid.uuid4()}@t", name="o", password_hash="x", role="operator")
    st = User(institution_id=inst.id, email=f"{uuid.uuid4()}@t", name="s", password_hash="x", role="student")
    session.add_all([op, st])
    session.flush()
    batch = Batch(operator_id=op.id, course_name="C", completion_date=dt.date(2026, 1, 1),
                  idempotency_key=str(uuid.uuid4()), request_fingerprint="f")
    session.add(batch)
    session.flush()
    rows = []
    for i in range(n):
        req = CertRequest(batch_id=batch.id, student_id=st.id, course_key=f"c{i}",
                          completion_date=dt.date(2026, 1, 1))
        session.add(req)
        session.flush()
        row = Outbox(request_id=req.id, created_at=dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc)
                     + dt.timedelta(seconds=i))
        session.add(row)
        rows.append(row)
    session.commit()  # en el fixture transaccional libera el savepoint
    return rows


@pytest.fixture
def committed(engine):
    """Filas realmente commiteadas (para tests con varias conexiones); se limpian al final."""
    require_test_db()

    def clean():
        with engine.begin() as conn:
            conn.execute(text("TRUNCATE outbox, cert_requests, batches, users, institutions CASCADE"))
    clean()
    yield lambda n: _make_committed(engine, n)
    clean()


def _make_committed(engine, n):
    with Session(engine) as s:
        rows = make_outbox(s, n)
        return [(r.request_id, r.correlation_id) for r in rows]


def drain(ch, queue="cert.issue"):
    out = []
    while True:
        m, props, body = ch.basic_get(queue, auto_ack=True)
        if m is None:
            return out
        out.append((props, json.loads(body)))


def test_publishes_pending_and_marks_published_after_confirm(session, channel):
    rows = make_outbox(session, 3)
    assert publish_pending(session, channel) == 3
    msgs = drain(channel)
    assert [b for _, b in msgs] == [
        {"request_id": str(r.request_id), "correlation_id": str(r.correlation_id)} for r in rows]
    assert all(p.delivery_mode == 2 and p.content_type == "application/json" for p, _ in msgs)
    assert all(r.published_at is not None for r in rows)


def test_message_body_has_only_request_id_and_correlation_id(session, channel):
    make_outbox(session, 1)
    publish_pending(session, channel)
    (_, body), = drain(channel)
    assert set(body) == {"request_id", "correlation_id"}
    assert all(isinstance(v, str) for v in body.values())


def test_second_run_publishes_nothing(session, channel):
    make_outbox(session, 2)
    assert publish_pending(session, channel) == 2
    assert publish_pending(session, channel) == 0
    assert len(drain(channel)) == 2


def test_batch_size_limits_one_cycle(session, channel):
    make_outbox(session, 5)
    assert publish_pending(session, channel, batch_size=2) == 2
    assert publish_pending(session, channel, batch_size=2) == 2
    assert publish_pending(session, channel, batch_size=2) == 1
    assert len(drain(channel)) == 5


def test_unroutable_message_is_not_marked_published(session, channel):
    rows = make_outbox(session, 2)
    channel.queue_unbind("cert.issue", "certs", "issue")
    assert publish_pending(session, channel) == 0
    assert all(r.published_at is None for r in rows)
    declare_topology(channel)
    assert publish_pending(session, channel) == 2
    assert all(r.published_at is not None for r in rows)
    assert len(drain(channel)) == 2


def test_crash_between_publish_and_mark_may_republish_same_request_id(session, channel, monkeypatch):
    rows = make_outbox(session, 1)
    real_commit = session.commit

    def boom():
        raise RuntimeError("crash antes de commit")

    monkeypatch.setattr(session, "commit", boom)
    with pytest.raises(RuntimeError):
        publish_pending(session, channel)
    session.rollback()
    monkeypatch.setattr(session, "commit", real_commit)
    session.refresh(rows[0])
    assert rows[0].published_at is None
    assert publish_pending(session, channel) == 1
    messages = [body for _, body in drain(channel)]
    assert messages == [{"request_id": str(rows[0].request_id),
                         "correlation_id": str(rows[0].correlation_id)}] * 2


def test_two_publishers_do_not_double_publish_same_row(engine, committed, channel):
    expected = {str(rid) for rid, _ in committed(20)}

    def worker():
        conn = connect(os.environ["RABBITMQ_URL"])
        try:
            ch = conn.channel()
            ch.confirm_delivery()
            with Session(engine) as s:
                total = 0
                while (n := publish_pending(s, ch, batch_size=3)):
                    total += n
                return total
        finally:
            conn.close()

    with ThreadPoolExecutor(2) as ex:
        totals = [f.result() for f in [ex.submit(worker), ex.submit(worker)]]
    assert sum(totals) == 20
    ids = [b["request_id"] for _, b in drain(channel)]
    assert len(ids) == 20 and set(ids) == expected
    with Session(engine) as s:
        assert s.scalar(select(text("count(*)")).select_from(Outbox).where(Outbox.published_at.is_(None))) == 0


def test_broker_down_accepts_http_batch_and_recovers(engine, committed):
    from app.entrypoints.publisher import run

    require_test_broker()
    conn = connect(os.environ["RABBITMQ_URL"])
    declare_topology(conn.channel())
    _purge(conn.channel())
    conn.close()
    from fastapi.testclient import TestClient

    from app.api.auth import hash_password
    from app.api.main import create_app
    from app.infrastructure.db import get_session

    with Session(engine) as s:
        inst = Institution(name="Recovery test")
        s.add(inst)
        s.flush()
        password_hash = hash_password("test-recovery", rounds=4)
        s.add(User(institution_id=inst.id, email="recovery-op@test.local", name="Operator",
                   role="operator", password_hash=password_hash))
        s.add(User(institution_id=inst.id, email="recovery-st@test.local", name="Student",
                   role="student", password_hash=password_hash))
        s.commit()

    def sessions():
        with Session(engine) as s:
            yield s

    app = create_app()
    app.dependency_overrides[get_session] = sessions
    stop = threading.Event()
    t = threading.Thread(target=run, args=(stop,), kwargs={"max_backoff": 1.0}, daemon=True)
    try:
        subprocess.run(COMPOSE + ["stop", "rabbitmq"], check=True, capture_output=True)
        with TestClient(app) as client:
            login = client.post("/api/auth/login", json={
                "email": "recovery-op@test.local", "password": "test-recovery"})
            assert login.status_code == 200, login.text
            response = client.post("/api/batches", headers={
                "Authorization": "Bearer " + login.json()["access_token"],
                "Idempotency-Key": "broker-recovery",
            }, data={"course_name": "Recovery", "completion_date": "2020-01-01"},
                files={"file": ("students.csv", b"email\nrecovery-st@test.local\n", "text/csv")})
            assert response.status_code == 201, response.text
            batch_id = uuid.UUID(response.json()["batch_id"])
        with Session(engine) as s:
            request = s.scalar(select(CertRequest).where(CertRequest.batch_id == batch_id))
            assert request.status == "PENDING"
            row = s.scalar(select(Outbox).where(Outbox.request_id == request.id))
            assert row.published_at is None
            expected = {"request_id": str(row.request_id), "correlation_id": str(row.correlation_id)}
        t.start()
        time.sleep(4)  # la publicación falla; el loop sigue vivo reintentando
        assert t.is_alive()
        with Session(engine) as s:
            assert s.query(Outbox).filter(Outbox.published_at.is_(None)).count() == 1
    finally:
        subprocess.run(COMPOSE + ["start", "rabbitmq"], check=True, capture_output=True)
    try:
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            with Session(engine) as s:
                if s.query(Outbox).filter(Outbox.published_at.is_(None)).count() == 0:
                    break
            time.sleep(1)
        else:
            pytest.fail("el publicador no se recuperó tras reiniciar RabbitMQ")
    finally:
        stop.set()
        t.join(10)
    conn = connect(os.environ["RABBITMQ_URL"])
    try:
        messages = drain(conn.channel())
        assert [body for _, body in messages] == [expected]
        assert messages[0][0].delivery_mode == 2
        ch = conn.channel()
        ch.confirm_delivery()
        with Session(engine) as s:
            assert publish_pending(s, ch) == 0
        assert drain(ch) == []
    finally:
        conn.close()


def test_idle_cycles_log_no_pika_errors_and_connection_survives(engine, committed, monkeypatch, caplog,
                                                                clear_settings_cache):
    from app.entrypoints.publisher import run

    committed(0)  # outbox vacío
    monkeypatch.setenv("POLL_INTERVAL_SECONDS", "0.1")
    get_settings_cache_clear()
    caplog.set_level(logging.DEBUG)
    stop = threading.Event()
    t = threading.Thread(target=run, args=(stop,), daemon=True)
    t.start()
    time.sleep(2.5)  # ~25 ciclos ociosos
    assert t.is_alive()
    stop.set()
    t.join(5)
    assert not t.is_alive()
    bad = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert bad == [], [r.getMessage() for r in bad]


def get_settings_cache_clear():
    from app.config import get_settings
    get_settings.cache_clear()


def test_signal_handlers_set_stop_event():
    from app.entrypoints.publisher import install_signal_handlers

    stop = threading.Event()
    old = {s: signal.getsignal(s) for s in (signal.SIGTERM, signal.SIGINT)}
    try:
        install_signal_handlers(stop)
        signal.raise_signal(signal.SIGTERM)
        assert stop.is_set()
        stop.clear()
        signal.raise_signal(signal.SIGINT)
        assert stop.is_set()
    finally:
        for s, h in old.items():
            signal.signal(s, h)


def test_run_exits_promptly_after_stop(engine, committed, monkeypatch, clear_settings_cache):
    from app.entrypoints.publisher import run

    committed(0)
    monkeypatch.setenv("POLL_INTERVAL_SECONDS", "30")  # la parada no espera el intervalo completo
    get_settings_cache_clear()
    stop = threading.Event()
    t = threading.Thread(target=run, args=(stop,), daemon=True)
    t.start()
    time.sleep(1.5)
    t0 = time.monotonic()
    stop.set()
    t.join(5)
    assert not t.is_alive() and time.monotonic() - t0 < 2
