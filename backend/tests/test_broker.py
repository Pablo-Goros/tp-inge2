import os

import pytest

from app.infrastructure.broker import connect, declare_topology


@pytest.fixture
def channel():
    conn = connect(os.environ["RABBITMQ_URL"])
    ch = conn.channel()
    for q in ("cert.issue", "cert.issue.wait", "cert.issue.dlq"):
        ch.queue_delete(q)
    for e in ("certs", "certs.retry"):
        ch.exchange_delete(e)
    yield ch
    conn.close()


def test_declare_topology_creates_all_queues_and_is_idempotent(channel):
    declare_topology(channel)
    declare_topology(channel)
    for q in ("cert.issue", "cert.issue.wait", "cert.issue.dlq"):
        assert channel.queue_declare(q, passive=True).method.queue == q
    # redeclarar con los mismos argumentos no falla; con distintos sí (verifica argumentos)
    channel.queue_declare("cert.issue", durable=True, arguments={
        "x-dead-letter-exchange": "certs.retry", "x-dead-letter-routing-key": "wait"})
    channel.queue_declare("cert.issue.wait", durable=True, arguments={
        "x-message-ttl": 5000, "x-dead-letter-exchange": "certs",
        "x-dead-letter-routing-key": "issue"})
    channel.queue_declare("cert.issue.dlq", durable=True)
    channel.exchange_declare("certs", exchange_type="direct", durable=True)
    channel.exchange_declare("certs.retry", exchange_type="direct", durable=True)


def test_routing_issue_wait_dlq(channel):
    import pika
    channel.confirm_delivery()
    declare_topology(channel)
    props = pika.BasicProperties(content_type="application/json", delivery_mode=2)
    channel.basic_publish("certs", "dlq", b"{}", props)
    channel.basic_publish("certs", "issue", b"{}", props)
    assert channel.queue_declare("cert.issue.dlq", passive=True).method.message_count == 1
    assert channel.queue_declare("cert.issue", passive=True).method.message_count == 1
