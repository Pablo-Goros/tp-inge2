import pika
from pika.adapters.blocking_connection import BlockingChannel

from app.config import get_settings


def connect(url: str, timeout: float | None = None) -> pika.BlockingConnection:
    """Con `timeout` la conexión es acotada (un intento, todos los plazos = timeout)."""
    params = pika.URLParameters(url)
    if timeout is not None:
        params.socket_timeout = timeout
        params.blocked_connection_timeout = timeout
        params.stack_timeout = timeout
        params.connection_attempts = 1
    return pika.BlockingConnection(params)


def declare_topology(channel: BlockingChannel) -> None:
    """Topología de contracts §4. Idempotente mientras los argumentos no cambien."""
    delay_ms = get_settings().retry_delay_seconds * 1000
    channel.exchange_declare("certs", exchange_type="direct", durable=True)
    channel.exchange_declare("certs.retry", exchange_type="direct", durable=True)
    channel.queue_declare("cert.issue", durable=True, arguments={
        "x-dead-letter-exchange": "certs.retry", "x-dead-letter-routing-key": "wait"})
    channel.queue_bind("cert.issue", "certs", "issue")
    channel.queue_declare("cert.issue.wait", durable=True, arguments={
        "x-message-ttl": delay_ms,
        "x-dead-letter-exchange": "certs", "x-dead-letter-routing-key": "issue"})
    channel.queue_bind("cert.issue.wait", "certs.retry", "wait")
    channel.queue_declare("cert.issue.dlq", durable=True)
    channel.queue_bind("cert.issue.dlq", "certs", "dlq")
