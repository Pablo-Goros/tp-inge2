"""python -m app.entrypoints.init: migra, siembra y declara la topología."""
import sys
import time
from pathlib import Path

import pika
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.application.seed import seed
from app.config import get_settings
from app.infrastructure.broker import declare_topology

BACKEND_DIR = Path(__file__).resolve().parents[2]
INIT_LOCK_KEY = 420101  # clave fija del advisory lock de init
SLEEP_SECONDS = 1
ATTEMPT_TIMEOUT = 3  # segundos por intento de conexión


def _retry(what: str, fn, deadline: float, total: int):
    while True:
        try:
            return fn()
        except Exception as exc:  # servicio aún arrancando o inalcanzable
            if time.monotonic() >= deadline:
                sys.exit(f"init: no se pudo conectar a {what} tras {total}s: {exc!r}")
            time.sleep(SLEEP_SECONDS)


def _broker_connect(url: str) -> pika.BlockingConnection:
    params = pika.URLParameters(url)
    params.socket_timeout = ATTEMPT_TIMEOUT
    params.blocked_connection_timeout = ATTEMPT_TIMEOUT
    params.stack_timeout = ATTEMPT_TIMEOUT
    params.connection_attempts = 1
    return pika.BlockingConnection(params)


def _migrate_and_seed(engine, bcrypt_rounds: int) -> None:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    command.upgrade(cfg, "head")
    with Session(engine) as session:
        seed(session, bcrypt_rounds)


def main() -> None:
    settings = get_settings()
    total = settings.init_timeout_seconds
    deadline = time.monotonic() + total  # un solo plazo para todo init
    engine = create_engine(settings.database_url, connect_args={"connect_timeout": ATTEMPT_TIMEOUT})

    def ping_db():
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

    _retry("la base de datos (PostgreSQL)", ping_db, deadline, total)
    # Lock de sesión en conexión dedicada: serializa inits concurrentes (migrar + sembrar).
    lock_conn = engine.connect().execution_options(isolation_level="AUTOCOMMIT")
    try:
        lock_conn.execute(text("SELECT pg_advisory_lock(:k)"), {"k": INIT_LOCK_KEY})
        _migrate_and_seed(engine, settings.bcrypt_rounds)
    finally:
        try:
            lock_conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": INIT_LOCK_KEY})
        finally:
            lock_conn.close()
    engine.dispose()

    conn = _retry("RabbitMQ", lambda: _broker_connect(settings.rabbitmq_url), deadline, total)
    try:
        declare_topology(conn.channel())
    finally:
        conn.close()
    print("init: migraciones, datos demo y topologia listos")


if __name__ == "__main__":
    main()
