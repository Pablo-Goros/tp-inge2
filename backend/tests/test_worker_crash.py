import os
import subprocess
import sys
import time
from hashlib import sha256

import pytest
from sqlalchemy import func, select

from app.application.publish_outbox import publish_pending
from app.infrastructure.models import Certificate, CertRequest, RegistryEntry
from tests.conftest import BACKEND_DIR
from tests.test_worker_integration import worker_channel


def eventually(predicate, timeout=30):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.1)
    pytest.fail("Worker did not reach the expected state")


@pytest.mark.parametrize("checkpoint", ["after_pdf", "after_register"])
def test_kill_unacked_worker_then_restart_finishes_twenty_without_duplicates(issuance_db, worker_channel,
                                                                          tmp_path, checkpoint):
    factory, make = issuance_db
    ids = make(20)
    marker = tmp_path / "checkpoint"
    log = tmp_path / "worker.log"
    env = {**os.environ, "FAULT_INJECTION": ""}
    with factory() as session:
        assert publish_pending(session, worker_channel) == 20
    with log.open("w", encoding="utf-8") as stream:
        child = subprocess.Popen([sys.executable, "-m", "tests.worker_checkpoint", str(marker), checkpoint],
                                 cwd=BACKEND_DIR, env=env, stdout=stream, stderr=stream)
        try:
            eventually(marker.exists)
            with factory() as session:
                pdf = session.scalar(select(Certificate.pdf))
                assert pdf
                assert session.scalar(select(func.count()).select_from(RegistryEntry)) == (checkpoint == "after_register")
            child.kill()
            child.wait(timeout=10)
        finally:
            if child.poll() is None:
                child.kill()
                child.wait(timeout=10)
        restarted = subprocess.Popen([sys.executable, "-m", "app.entrypoints.worker"], cwd=BACKEND_DIR,
                                     env=env, stdout=stream, stderr=stream)
        try:
            def complete():
                with factory() as session:
                    return session.scalar(select(func.count()).select_from(CertRequest)
                                          .where(CertRequest.status == "ISSUED")) == 20
            eventually(complete)
            with factory() as session:
                certificates = session.scalars(select(Certificate)).all()
                entries = session.scalars(select(RegistryEntry)).all()
                assert len(certificates) == len(entries) == 20
                assert {c.request_id for c in certificates} == set(ids)
                assert len({c.sha256 for c in certificates}) == 20
                assert all(sha256(c.pdf).hexdigest() == c.sha256 for c in certificates)
                assert pdf in [c.pdf for c in certificates]
                assert not session.scalar(select(func.count()).select_from(CertRequest)
                                          .where(CertRequest.status == "PROCESSING"))
        finally:
            restarted.terminate()
            restarted.wait(timeout=10)
