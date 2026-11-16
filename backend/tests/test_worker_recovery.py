import os
import subprocess
import threading
import time

from sqlalchemy import select

from app.application.publish_outbox import publish_pending
from app.entrypoints import worker
from app.infrastructure.broker import connect, declare_topology
from app.infrastructure.models import CertRequest
from tests._safety import require_test_broker
from tests.conftest import BACKEND_DIR
from tests.test_worker_crash import eventually


def test_worker_reconnects_after_real_broker_restart(issuance_db, monkeypatch, caplog):
    require_test_broker()
    factory, make = issuance_db
    request_id, = make()
    monkeypatch.setattr(worker, "SessionLocal", factory)
    stop = threading.Event()
    thread = threading.Thread(target=worker.run, args=(stop,), kwargs={"max_backoff": 1}, daemon=True)
    compose = ["docker", "compose", "-f", os.path.join(BACKEND_DIR, "tests", "docker-compose.test.yml")]
    thread.start()
    try:
        time.sleep(1)
        subprocess.run(compose + ["stop", "rabbitmq"], capture_output=True, check=True, timeout=45)
        eventually(lambda: any("worker interrumpido" in record.getMessage() for record in caplog.records))
    finally:
        subprocess.run(compose + ["start", "rabbitmq"], capture_output=True, check=True, timeout=45)
    try:
        def publish():
            try:
                connection = connect(os.environ["RABBITMQ_URL"], timeout=1)
            except Exception:
                return False
            try:
                channel = connection.channel()
                declare_topology(channel)
                channel.confirm_delivery()
                with factory() as session:
                    publish_pending(session, channel)
            finally:
                connection.close()
            return True
        eventually(publish)
        def issued():
            with factory() as session:
                return session.scalar(select(CertRequest.status).where(CertRequest.id == request_id)) == "ISSUED"
        eventually(issued)
        assert thread.is_alive()
    finally:
        stop.set()
        thread.join(10)
    assert not thread.is_alive()
