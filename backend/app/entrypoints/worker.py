"""python -m app.entrypoints.worker: one consumer, manual ACK, bounded retries."""
import json
import logging
import threading
from dataclasses import dataclass
from uuid import UUID

import pika
from pika.exceptions import AMQPError
from sqlalchemy.exc import SQLAlchemyError

from app.application.faults import FaultInjector
from app.application.issue_certificate import Outcome, process_request
from app.config import Settings, get_settings
from app.domain.errors import TransientError
from app.domain.registry import Registry
from app.entrypoints.publisher import install_signal_handlers
from app.infrastructure.broker import connect, declare_topology
from app.infrastructure.db import SessionLocal
from app.infrastructure.registry_factory import get_registry

log = logging.getLogger("worker")


@dataclass
class Dependencies:
    session_factory: object
    registry: Registry
    settings: Settings
    faults: FaultInjector


def _to_dlq(channel, method, properties, body):
    # Confirms are enabled once when opening the channel. Failure leaves the
    # original delivery unacknowledged; reconnecting makes it eligible again.
    channel.basic_publish(
        exchange="certs", routing_key="dlq", body=body, mandatory=True,
        properties=pika.BasicProperties(content_type=getattr(properties, "content_type", None),
                                         delivery_mode=2,
                                         correlation_id=getattr(properties, "correlation_id", None)),
    )
    channel.basic_ack(method.delivery_tag)


def handle_message(channel, method, properties, body, *, deps: Dependencies) -> None:
    try:
        if len(body) > 4096:
            raise ValueError("Mensaje demasiado grande")
        message = json.loads(body)
        if not isinstance(message, dict) or set(message) != {"request_id", "correlation_id"}:
            raise ValueError("El mensaje debe contener solo request_id y correlation_id")
        request_id = UUID(message["request_id"])
        correlation_id = UUID(message["correlation_id"])
    except (ValueError, TypeError, AttributeError, UnicodeDecodeError, RecursionError):
        log.warning("mensaje inválido: traslado a DLQ")
        _to_dlq(channel, method, properties, body)
        return
    log.info("recibido request_id=%s correlation_id=%s redelivered=%s", request_id,
             correlation_id, getattr(method, "redelivered", False))
    outcome = process_request(deps.session_factory, deps.registry, request_id,
                              max_attempts=deps.settings.max_attempts, faults=deps.faults,
                              public_base_url=deps.settings.public_base_url)
    log.info("procesado request_id=%s correlation_id=%s outcome=%s",
             request_id, correlation_id, outcome.value)
    if outcome == Outcome.DONE:
        channel.basic_ack(method.delivery_tag)
    elif outcome == Outcome.RETRY:
        channel.basic_nack(method.delivery_tag, requeue=False)
    else:
        _to_dlq(channel, method, properties, body)


def run(stop: threading.Event | None = None, max_backoff: float = 30.0) -> None:
    stop = stop or threading.Event()
    settings = get_settings()
    deps = Dependencies(SessionLocal, get_registry(settings), settings,
                        FaultInjector.parse(settings.fault_injection))
    backoff = 1.0
    while not stop.is_set():
        try:
            conn = connect(settings.rabbitmq_url, timeout=3)
            try:
                channel = conn.channel()
                declare_topology(channel)
                channel.confirm_delivery()
                channel.basic_qos(prefetch_count=1)
                log.info("worker listo registry=%s", settings.registry_backend)
                for method, properties, body in channel.consume("cert.issue", auto_ack=False,
                                                                 inactivity_timeout=0.2):
                    if stop.is_set():
                        break
                    if method is not None:
                        handle_message(channel, method, properties, body, deps=deps)
                    backoff = 1.0
                channel.cancel()
            finally:
                try:
                    conn.close()
                except AMQPError:
                    pass
        except (AMQPError, SQLAlchemyError, TransientError, OSError) as exc:
            log.error("worker interrumpido reason=%s; reconexión en %.1fs", type(exc).__name__, backoff)
            stop.wait(backoff)
            backoff = min(backoff * 2, max_backoff)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    stop = threading.Event()
    install_signal_handlers(stop)
    run(stop)


if __name__ == "__main__":
    main()
