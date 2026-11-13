import os
import subprocess
import sys
import time

from tests.conftest import BACKEND_DIR


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


def test_init_unreachable_broker_fails_fast_naming_rabbitmq(engine):
    p, elapsed = _run_init(RABBITMQ_URL="amqp://guest:guest@localhost:1/%2F")
    assert p.returncode != 0
    assert "RabbitMQ" in p.stderr
    assert elapsed < 15
