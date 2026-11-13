import json
import logging

from pika.exceptions import NackError, UnroutableError
from pika import BasicProperties
from pika.adapters.blocking_connection import BlockingChannel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.infrastructure.models import Outbox

log = logging.getLogger(__name__)
PROPS = BasicProperties(content_type="application/json", delivery_mode=2)


def publish_pending(session: Session, channel: BlockingChannel, batch_size: int = 50) -> int:
    """Publica filas pendientes del outbox (contracts §4) y devuelve cuántas se confirmaron.

    `published_at` se marca solo tras la confirmación del broker. El lock FOR UPDATE SKIP LOCKED
    dura lo que el lote. Si el proceso cae entre confirmar y commitear, la fila se republica
    (el worker tolera duplicados).

    El canal debe tener habilitadas las confirmaciones (`channel.confirm_delivery()`, una sola vez
    por canal: pika loguea un ERROR si se repite); lo hace el llamador.
    """
    rows = session.scalars(
        select(Outbox).where(Outbox.published_at.is_(None))
        .order_by(Outbox.created_at, Outbox.id).limit(batch_size)
        .with_for_update(skip_locked=True)
    ).all()
    published = 0
    try:
        for row in rows:
            body = json.dumps({"request_id": str(row.request_id), "correlation_id": str(row.correlation_id)})
            try:
                channel.basic_publish("certs", "issue", body.encode(), PROPS, mandatory=True)
            except (UnroutableError, NackError) as exc:
                log.warning("outbox: mensaje no confirmado (%s) request_id=%s correlation_id=%s",
                            type(exc).__name__, row.request_id, row.correlation_id)
                continue
            row.published_at = func.now()
            published += 1
            log.info("outbox: publicado request_id=%s correlation_id=%s", row.request_id, row.correlation_id)
    except BaseException:
        session.commit()  # conserva lo ya confirmado; el error se propaga
        raise
    session.commit()
    return published
