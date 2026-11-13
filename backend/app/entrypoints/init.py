"""python -m app.entrypoints.init: migra, siembra y declara la topología."""
import sys
import time
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.application.seed import seed
from app.config import get_settings
from app.infrastructure.broker import connect, declare_topology

BACKEND_DIR = Path(__file__).resolve().parents[2]
WAIT_SECONDS = 60
SLEEP_SECONDS = 2


def _retry(what: str, fn):
    deadline = time.monotonic() + WAIT_SECONDS
    while True:
        try:
            return fn()
        except Exception as exc:  # servicio aún arrancando
            if time.monotonic() >= deadline:
                sys.exit(f"init: no se pudo conectar a {what} tras {WAIT_SECONDS}s: {exc}")
            time.sleep(SLEEP_SECONDS)


def main() -> None:
    settings = get_settings()
    engine = create_engine(settings.database_url)

    def ping_db():
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

    _retry("la base de datos", ping_db)
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    command.upgrade(cfg, "head")
    with Session(engine) as session:
        seed(session)
    engine.dispose()

    conn = _retry("RabbitMQ", lambda: connect(settings.rabbitmq_url))
    try:
        declare_topology(conn.channel())
    finally:
        conn.close()
    print("init: migraciones, datos demo y topología listos")


if __name__ == "__main__":
    main()
