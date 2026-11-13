import os
import subprocess
import sys
import time

import pika
import pytest
from sqlalchemy import text

from tests.conftest import BACKEND_DIR

QUEUES = ["cert.issue", "cert.issue.wait", "cert.issue.dlq"]


@pytest.fixture
def fresh_db(engine):
    """Esquema vacío para ejercitar init desde cero; al final deja tablas migradas y vacías."""
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    yield engine
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE users, institutions CASCADE"))


def _counts(engine):
    with engine.connect() as conn:
        insts = conn.execute(text("SELECT count(*) FROM institutions")).scalar()
        users = conn.execute(text("SELECT count(*) FROM users")).scalar()
        distinct = conn.execute(text("SELECT count(DISTINCT institution_id) FROM users")).scalar()
    return insts, users, distinct


def _run_init(**env):
    e = {**os.environ, "INIT_TIMEOUT_SECONDS": "3", "BCRYPT_ROUNDS": "4", **env}
    t = time.monotonic()
    p = subprocess.run([sys.executable, "-m", "app.entrypoints.init"], cwd=BACKEND_DIR, env=e,
                       capture_output=True, text=True, timeout=30)
    return p, time.monotonic() - t


def test_init_unreachable_db_fails_fast_naming_db(engine):
    p, elapsed = _run_init(DATABASE_URL="postgresql+psycopg://certs:certs@localhost:1/certs")
    assert p.returncode != 0
    assert "base de datos" in p.stderr
    assert elapsed < 15


def test_init_unreachable_broker_fails_fast_naming_rabbitmq(fresh_db):
    p, elapsed = _run_init(RABBITMQ_URL="amqp://guest:guest@localhost:1/%2F")
    assert p.returncode != 0
    assert "RabbitMQ" in p.stderr
    assert elapsed < 15
    assert _counts(fresh_db) == (1, 26, 1)  # la fase de DB sí terminó


def test_init_twice_happy_path(fresh_db):
    for _ in range(2):
        p, _t = _run_init(INIT_TIMEOUT_SECONDS="30")
        assert p.returncode == 0, p.stderr
    assert _counts(fresh_db) == (1, 26, 1)
    conn = pika.BlockingConnection(pika.URLParameters(os.environ["RABBITMQ_URL"]))
    try:
        ch = conn.channel()
        for q in QUEUES:
            ch.queue_declare(q, passive=True)
    finally:
        conn.close()


def test_concurrent_inits_do_not_duplicate(fresh_db):
    e = {**os.environ, "INIT_TIMEOUT_SECONDS": "60", "BCRYPT_ROUNDS": "4"}
    procs = [subprocess.Popen([sys.executable, "-m", "app.entrypoints.init"], cwd=BACKEND_DIR, env=e,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for _ in range(3)]
    outs = [p.communicate(timeout=90) for p in procs]
    for p, (_o, err) in zip(procs, outs):
        assert p.returncode == 0, err
    assert _counts(fresh_db) == (1, 26, 1)
