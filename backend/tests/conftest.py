import os

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from tests._safety import require_test_broker, require_test_db

os.environ.setdefault("JWT_SECRET", "test-secret-test-secret-test-secret-0123456789")
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://certs:certs@localhost:55432/certs")
os.environ.setdefault("RABBITMQ_URL", "amqp://guest:guest@localhost:55672/%2F")

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@pytest.fixture(scope="session")
def engine():
    require_test_db()
    eng = create_engine(os.environ["DATABASE_URL"])
    with eng.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    cfg = Config(os.path.join(BACKEND_DIR, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(BACKEND_DIR, "migrations"))
    command.upgrade(cfg, "head")
    yield eng
    eng.dispose()


@pytest.fixture
def session(engine):
    """Sesión transaccional: todo se revierte al terminar el test."""
    conn = engine.connect()
    trans = conn.begin()
    sess = Session(bind=conn, join_transaction_mode="create_savepoint")
    yield sess
    sess.close()
    trans.rollback()
    conn.close()


@pytest.fixture
def client(session):
    from fastapi.testclient import TestClient

    from app.api.main import create_app
    from app.infrastructure.db import get_session

    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    return TestClient(app)


@pytest.fixture
def users(session):
    import bcrypt

    from app.infrastructure.models import Institution, User

    inst = Institution(name="ITBA")
    session.add(inst)
    session.flush()
    h = bcrypt.hashpw(b"demo1234", bcrypt.gensalt(rounds=4)).decode()
    op = User(institution_id=inst.id, email="op@itba.test", name="Operadora", password_hash=h, role="operator")
    st = User(institution_id=inst.id, email="al@itba.test", name="Alumno", password_hash=h, role="student")
    session.add_all([op, st])
    session.flush()
    return {"operator": op, "student": st}


@pytest.fixture
def clear_settings_cache():
    from app.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
