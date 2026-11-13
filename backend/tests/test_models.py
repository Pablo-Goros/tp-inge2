import datetime as dt
import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app.infrastructure.models import (
    Batch, CertRequest, Institution, RegistryEntry, RequestStatus, User,
)

DAY = dt.date(2026, 10, 30)


def _seed(session):
    inst = Institution(id=uuid.uuid4(), name="Instituto")
    op = User(id=uuid.uuid4(), institution_id=inst.id, email="op@x.test", name="Op",
              password_hash="h", role="operator")
    st = User(id=uuid.uuid4(), institution_id=inst.id, email="a@x.test", name="A",
              password_hash="h", role="student")
    session.add_all([inst, op, st])
    session.flush()
    return op, st


def _batch(session, op, key="k1"):
    b = Batch(id=uuid.uuid4(), operator_id=op.id, course_name="Curso", completion_date=DAY,
              idempotency_key=key, request_fingerprint="f")
    session.add(b)
    session.flush()
    return b


def _req(batch, st):
    return CertRequest(id=uuid.uuid4(), batch_id=batch.id, student_id=st.id,
                       course_key="curso", completion_date=DAY)


def test_unique_student_course_date_rejects_duplicate(session):
    op, st = _seed(session)
    b = _batch(session, op)
    session.add(_req(b, st))
    session.flush()
    session.add(_req(b, st))
    with pytest.raises(IntegrityError):
        session.flush()


def test_batch_idempotency_key_unique_per_operator(session):
    op, _ = _seed(session)
    _batch(session, op)
    with pytest.raises(IntegrityError):
        _batch(session, op)


def test_registry_primary_key_is_cert_id(session):
    cid = uuid.uuid4()
    session.add(RegistryEntry(cert_id=cid, sha256="a" * 64))
    session.flush()
    session.add(RegistryEntry(cert_id=cid, sha256="b" * 64))
    with pytest.raises(IntegrityError):
        session.flush()


def test_cert_request_defaults(session):
    op, st = _seed(session)
    r = _req(_batch(session, op), st)
    session.add(r)
    session.flush()
    session.refresh(r)
    assert r.attempts == 0
    assert r.status == RequestStatus.PENDING
    assert r.last_error is None and r.created_at and r.updated_at
