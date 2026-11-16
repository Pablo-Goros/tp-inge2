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


@pytest.fixture
def issuance_db(engine):
    """Committed data for issuance phases using independent DB connections."""
    import datetime as dt
    import uuid
    from sqlalchemy.orm import sessionmaker
    from app.infrastructure.models import Batch, CertRequest, Institution, Outbox, User
    from app.api.auth import hash_password

    require_test_db()
    factory = sessionmaker(engine, expire_on_commit=False)
    password_hash = hash_password("demo1234", rounds=4)

    def clean():
        with engine.begin() as conn:
            conn.execute(text("TRUNCATE registry, institutions CASCADE"))

    clean()

    def make(count=1, final_grade=None):
        with factory() as s, s.begin():
            institution = Institution(name="Institución de prueba")
            s.add(institution)
            s.flush()
            operator = User(institution_id=institution.id, email=f"{uuid.uuid4()}@demo.test",
                            name="Operador", password_hash=password_hash, role="operator")
            s.add(operator)
            s.flush()
            batch = Batch(operator_id=operator.id, course_name="Programación avanzada",
                          completion_date=dt.date(2026, 10, 30), idempotency_key=str(uuid.uuid4()),
                          request_fingerprint="fixture")
            s.add(batch)
            s.flush()
            ids = []
            for index in range(count):
                student = User(institution_id=institution.id, email=f"alumno{index + 1:02}@demo.test",
                               name=f"Alumno Ñandú {index + 1}", password_hash=password_hash, role="student")
                s.add(student)
                s.flush()
                request = CertRequest(batch_id=batch.id, student_id=student.id,
                                      course_key="programación avanzada", completion_date=batch.completion_date,
                                      final_grade=final_grade)
                s.add(request)
                s.flush()
                s.add(Outbox(request_id=request.id))
                ids.append(request.id)
        return ids

    yield factory, make
    clean()
