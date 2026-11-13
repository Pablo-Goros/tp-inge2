"""python -m app.entrypoints.publisher: publica el outbox a RabbitMQ; reconecta ante errores."""
import logging
import threading

from pika.exceptions import AMQPError
from sqlalchemy.exc import SQLAlchemyError

from app.application.publish_outbox import publish_pending
from app.config import get_settings
from app.infrastructure.broker import connect
from app.infrastructure.db import SessionLocal

log = logging.getLogger("publisher")
CONNECT_TIMEOUT = 3  # segundos


def run(stop: threading.Event | None = None, max_backoff: float = 30.0) -> None:
    stop = stop or threading.Event()
    settings = get_settings()
    backoff = 1.0
    while not stop.is_set():
        try:
            conn = connect(settings.rabbitmq_url, CONNECT_TIMEOUT)
            try:
                channel = conn.channel()
                with SessionLocal() as session:
                    while not stop.is_set():
                        n = publish_pending(session, channel)
                        backoff = 1.0  # un ciclo completo sin error
                        if n == 0:
                            stop.wait(settings.poll_interval_seconds)
            finally:
                try:
                    conn.close()
                except Exception:
                    pass
        except (AMQPError, SQLAlchemyError, OSError) as exc:
            log.error("publisher: error transitorio (%r); reintento en %.1fs", exc, backoff)
            stop.wait(backoff)
            backoff = min(backoff * 2, max_backoff)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    run()


if __name__ == "__main__":
    main()
