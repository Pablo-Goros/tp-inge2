from decimal import Decimal
from hashlib import sha256
from io import BytesIO
from uuid import uuid4

from pypdf import PdfReader
import pytest

from app.application.faults import FaultInjector
from app.application.issue_certificate import Outcome, process_request
from app.domain.registry import RegistryConflict, RegistryUnavailable
from app.domain.errors import TransientError
from app.infrastructure.models import Certificate, CertRequest, RegistryEntry
from app.infrastructure.registry_simulated import SimulatedRegistry


def issue(factory, registry, request_id, *, max_attempts=3, faults=None):
    return process_request(factory, registry, request_id, max_attempts=max_attempts,
                           faults=faults or FaultInjector(), public_base_url="https://demo.test")


def snapshot(factory, request_id):
    with factory() as s:
        request = s.get(CertRequest, request_id)
        certificate = s.get(Certificate, request_id)
        return (request.status, request.attempts, request.last_error,
                certificate.pdf if certificate else None, certificate.sha256 if certificate else None)


def test_issue_persists_exact_document_hash_and_optional_grade_once(issuance_db):
    factory, make = issuance_db
    request_id, = make(final_grade=Decimal("9.75"))
    registry = SimulatedRegistry(factory)
    assert issue(factory, registry, request_id) == Outcome.DONE
    original = snapshot(factory, request_id)
    assert original[:3] == ("ISSUED", 1, None)
    assert sha256(original[3]).hexdigest() == original[4] == registry.lookup(request_id)
    assert "Nota final: 9.75" in PdfReader(BytesIO(original[3])).pages[0].extract_text()
    assert issue(factory, registry, request_id) == Outcome.DONE
    assert snapshot(factory, request_id) == original


def test_transient_failure_reuses_saved_pdf_and_clears_error(issuance_db):
    factory, make = issuance_db
    request_id, = make()
    registry = SimulatedRegistry(factory)
    assert issue(factory, registry, request_id, faults=FaultInjector.parse("transient:1")) == Outcome.RETRY
    before = snapshot(factory, request_id)
    assert before[0] == "PENDING" and before[1] == 1 and before[2]
    assert registry.lookup(request_id) is None
    assert issue(factory, registry, request_id) == Outcome.DONE
    after = snapshot(factory, request_id)
    assert after[:3] == ("ISSUED", 2, None)
    assert before[3:] == after[3:]
    assert "Nota final" not in PdfReader(BytesIO(after[3])).pages[0].extract_text()


@pytest.mark.parametrize("checkpoint", ["pdf", "register"])
@pytest.mark.parametrize("max_attempts", [1, 3])
def test_crash_recovery_preserves_pdf_and_reconciles_at_attempt_limit(issuance_db, checkpoint, max_attempts):
    factory, make = issuance_db
    request_id, = make()
    registry = SimulatedRegistry(factory)

    class Crash:
        def register(self, cert_id, digest):
            if checkpoint == "register":
                registry.register(cert_id, digest)
            raise SystemExit("simulated process death")

    with pytest.raises(SystemExit):
        issue(factory, Crash(), request_id, max_attempts=max_attempts)
    before = snapshot(factory, request_id)
    assert before[0] == "PROCESSING" and before[3]
    result = issue(factory, registry, request_id, max_attempts=max_attempts)
    if max_attempts == 1 and checkpoint == "pdf":
        assert result == Outcome.FAILED
    else:
        assert result == Outcome.DONE
        assert snapshot(factory, request_id)[0] == "ISSUED"
    assert snapshot(factory, request_id)[3:] == before[3:]


def test_transient_attempts_are_bounded_and_failed_requests_remain_terminal(issuance_db):
    factory, make = issuance_db
    request_id, = make()
    registry = SimulatedRegistry(factory)
    faults = FaultInjector.parse("transient:10")
    assert [issue(factory, registry, request_id, faults=faults) for _ in range(3)] == [
        Outcome.RETRY, Outcome.RETRY, Outcome.FAILED]
    failed = snapshot(factory, request_id)
    assert failed[:2] == ("FAILED", 3) and failed[2]
    assert issue(factory, registry, request_id) == Outcome.FAILED
    assert snapshot(factory, request_id) == failed


def test_permanent_failure_does_not_stop_other_students(issuance_db):
    factory, make = issuance_db
    first, second = make(2)
    registry = SimulatedRegistry(factory)
    faults = FaultInjector.parse("permanent:alumno01@demo.test")
    assert issue(factory, registry, first, faults=faults) == Outcome.FAILED
    assert issue(factory, registry, second, faults=faults) == Outcome.DONE
    assert snapshot(factory, first)[:2] == ("FAILED", 1)
    assert snapshot(factory, second)[0] == "ISSUED"


def test_registry_conflict_is_permanent_and_does_not_overwrite(issuance_db):
    factory, make = issuance_db
    request_id, = make()
    registry = SimulatedRegistry(factory)
    registry.register(request_id, "a" * 64)
    assert issue(factory, registry, request_id) == Outcome.FAILED
    assert registry.lookup(request_id) == "a" * 64


def test_unavailable_registry_consumes_attempt_and_retries(issuance_db):
    factory, make = issuance_db
    request_id, = make()
    class Offline:
        def register(self, cert_id, digest):
            raise RegistryUnavailable("offline")
    assert issue(factory, Offline(), request_id) == Outcome.RETRY
    assert snapshot(factory, request_id)[:3] == ("PENDING", 1, "offline")


def test_pdf_failure_is_permanent_and_unknown_request_is_not_retried(issuance_db, monkeypatch):
    factory, make = issuance_db
    request_id, = make()
    def broken(_data):
        raise ValueError("bad PDF data")
    monkeypatch.setattr("app.application.issue_certificate.render_certificate", broken)
    registry = SimulatedRegistry(factory)
    assert issue(factory, registry, request_id) == Outcome.FAILED
    assert snapshot(factory, request_id)[3] is None
    assert issue(factory, registry, uuid4()) == Outcome.FAILED


def test_final_register_timeout_is_reconciled_before_declaring_failure(issuance_db):
    factory, make = issuance_db
    request_id, = make()
    registry = SimulatedRegistry(factory)
    class TimedOutAfterCommit:
        def register(self, cert_id, digest):
            registry.register(cert_id, digest)
            raise RegistryUnavailable("timeout after commit")
    with pytest.raises(TransientError):
        issue(factory, TimedOutAfterCommit(), request_id, max_attempts=1)
    assert snapshot(factory, request_id)[:2] == ("PROCESSING", 1)
    assert issue(factory, registry, request_id, max_attempts=1) == Outcome.DONE
    assert snapshot(factory, request_id)[:3] == ("ISSUED", 1, None)
