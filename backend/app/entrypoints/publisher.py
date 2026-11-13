"""python -m app.entrypoints.publisher: publica el outbox a RabbitMQ; reconecta ante errores."""
import logging
import signal
import threading
import time

from pika.exceptions import AMQPError
from sqlalchemy.exc import SQLAlchemyError

from app.application.publish_outbox import publish_pending
from app.config import get_settings
from app.infrastructure.broker import connect
from app.infrastructure.db import SessionLocal

log = logging.getLogger("publisher")
CONNECT_TIMEOUT = 3  # segundos
STOP_SLICE = 0.2  # segundos: granularidad con la que se atiende la parada mientras se duerme


def install_signal_handlers(stop: threading.Event) -> None:
    """SIGTERM/SIGINT (p. ej. `docker stop` al ser PID 1) piden una salida limpia."""
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.set())


def _idle(conn, stop: threading.Event, seconds: float) -> None:
    """Duerme atendiendo los heartbeats de la conexión; vuelve antes si se pide parar."""
    deadline = time.monotonic() + seconds
    while not stop.is_set() and (left := deadline - time.monotonic()) > 0:
        conn.sleep(min(STOP_SLICE, left))


def run(stop: threading.Event | None = None, max_backoff: float = 30.0) -> None:
    stop = stop or threading.Event()
    settings = get_settings()
    backoff = 1.0
    while not stop.is_set():
        try:
            conn = connect(settings.rabbitmq_url, CONNECT_TIMEOUT)
            try:
                channel = conn.channel()
                channel.confirm_delivery()  # una sola vez por canal
                with SessionLocal() as session:
                    while not stop.is_set():
                        n = publish_pending(session, channel)
                        backoff = 1.0  # un ciclo completo sin error
                        if n == 0:
                            _idle(conn, stop, settings.poll_interval_seconds)
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
    stop = threading.Event()
    install_signal_handlers(stop)
    run(stop)


if __name__ == "__main__":
    main()
