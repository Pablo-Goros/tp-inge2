import json
import os
import time
from uuid import uuid4

import pika
import pytest

from app.application.faults import FaultInjector
from app.config import get_settings
from app.entrypoints.worker import Dependencies, handle_message
from app.infrastructure.broker import connect, declare_topology
from app.infrastructure.models import CertRequest
from app.infrastructure.registry_simulated import SimulatedRegistry
from tests._safety import require_test_broker


@pytest.fixture
def worker_channel():
    require_test_broker()
    connection = connect(os.environ["RABBITMQ_URL"])
    channel = connection.channel()
    declare_topology(channel)
    channel.confirm_delivery()
    for name in ("cert.issue", "cert.issue.wait", "cert.issue.dlq"):
        channel.queue_purge(name)
    yield channel
    if connection.is_open:
        connection.close()


def publish(channel, request_id):
    body = json.dumps({"request_id": str(request_id), "correlation_id": str(uuid4())}).encode()
    channel.basic_publish("certs", "issue", body,
                          pika.BasicProperties(content_type="application/json", delivery_mode=2), mandatory=True)
    return body


def receive(channel, queue="cert.issue", timeout=10):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        delivery = channel.basic_get(queue, auto_ack=False)
        if delivery[0] is not None:
            return delivery
        channel.connection.sleep(0.05)
    pytest.fail(f"No delivery from {queue}")


def dependencies(factory, spec=""):
    return Dependencies(factory, SimulatedRegistry(factory), get_settings(), FaultInjector.parse(spec))


def test_ack_follows_issued_commit_and_duplicate_has_no_effect(issuance_db, worker_channel, monkeypatch):
    factory, make = issuance_db
    request_id, = make()
    publish(worker_channel, request_id)
    real_ack = worker_channel.basic_ack
    attempts = []

    def ack(tag):
        with factory() as session:
            request = session.get(CertRequest, request_id)
            assert request.status == "ISSUED"
            attempts.append(request.attempts)
        real_ack(tag)

    monkeypatch.setattr(worker_channel, "basic_ack", ack)
    deps = dependencies(factory)
    handle_message(worker_channel, *receive(worker_channel), deps=deps)
    publish(worker_channel, request_id)
    handle_message(worker_channel, *receive(worker_channel), deps=deps)
    assert attempts == [1, 1]
    assert worker_channel.basic_get("cert.issue")[0] is None


def test_retry_uses_wait_queue_then_same_document_is_issued(issuance_db, worker_channel):
    factory, make = issuance_db
    request_id, = make()
    body = publish(worker_channel, request_id)
    deps = dependencies(factory, "transient:1")
    handle_message(worker_channel, *receive(worker_channel), deps=deps)
    assert worker_channel.basic_get("cert.issue")[0] is None
    assert worker_channel.queue_declare("cert.issue.wait", passive=True).method.message_count == 1
    method, props, received = receive(worker_channel)
    assert received == body
    handle_message(worker_channel, method, props, received, deps=deps)
    with factory() as session:
        request = session.get(CertRequest, request_id)
        assert (request.status, request.attempts) == ("ISSUED", 2)


@pytest.mark.parametrize("body", [b"not-json", b"[]", b'{}', b'{"request_id": 1,"correlation_id": 2}',
                                 b'\xff', b'{"request_id":"bad","correlation_id":"bad"}'])
def test_malformed_messages_are_isolated_in_dlq(issuance_db, worker_channel, body):
    factory, _ = issuance_db
    worker_channel.basic_publish("certs", "issue", body)
    handle_message(worker_channel, *receive(worker_channel), deps=dependencies(factory))
    method, properties, received = receive(worker_channel, "cert.issue.dlq")
    assert received == body and properties.delivery_mode == 2
    worker_channel.basic_ack(method.delivery_tag)
    assert worker_channel.basic_get("cert.issue")[0] is None


def test_unknown_request_goes_to_dlq(issuance_db, worker_channel):
    factory, _ = issuance_db
    body = publish(worker_channel, uuid4())
    handle_message(worker_channel, *receive(worker_channel), deps=dependencies(factory))
    method, _, received = receive(worker_channel, "cert.issue.dlq")
    assert received == body
    worker_channel.basic_ack(method.delivery_tag)


def test_failed_dlq_publication_preserves_terminal_error_and_recovers_without_reissuing(issuance_db,
                                                                                       worker_channel):
    factory, make = issuance_db
    request_id, = make()
    body = publish(worker_channel, request_id)
    deps = dependencies(factory, "permanent:alumno01@demo.test")
    worker_channel.queue_unbind("cert.issue.dlq", "certs", "dlq")
    with pytest.raises(pika.exceptions.UnroutableError):
        handle_message(worker_channel, *receive(worker_channel), deps=deps)
    with factory() as session:
        request = session.get(CertRequest, request_id)
        assert (request.status, request.attempts) == ("FAILED", 1)
        assert request.last_error
    worker_channel.close()  # the unacknowledged original is redelivered
    channel = worker_channel.connection.channel()
    declare_topology(channel)
    channel.confirm_delivery()
    handle_message(channel, *receive(channel), deps=deps)
    method, _, received = receive(channel, "cert.issue.dlq")
    assert received == body
    channel.basic_ack(method.delivery_tag)
    with factory() as session:
        assert session.get(CertRequest, request_id).attempts == 1
