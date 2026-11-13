import datetime as dt
import json
import os
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
    ids = [b["request_id"] for _, b in drain(channel)]
    assert ids == [str(rows[0].request_id)] * 2


def test_two_publishers_do_not_double_publish_same_row(engine, committed, channel):
    expected = {str(rid) for rid, _ in committed(20)}

    def worker():
        conn = connect(os.environ["RABBITMQ_URL"])
        try:
            with Session(engine) as s:
                total = 0
                while (n := publish_pending(s, conn.channel(), batch_size=3)):
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


def test_broker_down_leaves_rows_pending_and_recovers(engine, committed):
    from app.entrypoints.publisher import run

    require_test_broker()
    conn = connect(os.environ["RABBITMQ_URL"])
    declare_topology(conn.channel())
    _purge(conn.channel())
    conn.close()
    committed(3)
    stop = threading.Event()
    t = threading.Thread(target=run, args=(stop,), kwargs={"max_backoff": 1.0}, daemon=True)
    try:
        subprocess.run(COMPOSE + ["stop", "rabbitmq"], check=True, capture_output=True)
        t.start()
        time.sleep(4)  # la publicación falla; el loop sigue vivo reintentando
        assert t.is_alive()
        with Session(engine) as s:
            assert s.query(Outbox).filter(Outbox.published_at.is_(None)).count() == 3
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
        assert len(drain(conn.channel())) == 3
    finally:
        conn.close()
