import hashlib
import uuid

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app.domain.registry import RegistryConflict, RegistryUnavailable
from app.infrastructure.models import RegistryEntry
from app.infrastructure.registry_simulated import SimulatedRegistry


def test_register_is_idempotent_and_conflict_preserves_original(engine):
    factory = sessionmaker(engine)
    registry = SimulatedRegistry(factory)
    cert_id = uuid.uuid4()
    digest = hashlib.sha256(b"original").hexdigest()
    try:
        assert registry.lookup(cert_id) is None
        registry.register(cert_id, digest)
        registry.register(cert_id, digest)
        with pytest.raises(RegistryConflict):
            registry.register(cert_id, hashlib.sha256(b"changed").hexdigest())
        assert registry.lookup(cert_id) == digest
        with factory() as session:
            assert session.scalar(select(func.count()).select_from(RegistryEntry)
                                  .where(RegistryEntry.cert_id == cert_id)) == 1
    finally:
        with engine.begin() as conn:
            conn.execute(RegistryEntry.__table__.delete().where(RegistryEntry.cert_id == cert_id))


def test_registry_connection_failure_is_unavailable():
    engine = create_engine("postgresql+psycopg://certs:certs@localhost:1/certs",
                           connect_args={"connect_timeout": 1})
    registry = SimulatedRegistry(sessionmaker(engine))
    try:
        with pytest.raises(RegistryUnavailable):
            registry.lookup(uuid.uuid4())
        with pytest.raises(RegistryUnavailable):
            registry.register(uuid.uuid4(), "a" * 64)
    finally:
        engine.dispose()
