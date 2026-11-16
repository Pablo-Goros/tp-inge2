"""Insert-only PoC registry. This is a PostgreSQL registry, not blockchain."""
from uuid import UUID

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import OperationalError, InterfaceError

from app.domain.registry import RegistryConflict, RegistryUnavailable
from app.infrastructure.models import RegistryEntry


class SimulatedRegistry:
    def __init__(self, session_factory):
        self.session_factory = session_factory

    def register(self, cert_id: UUID, sha256: str) -> None:
        try:
            with self.session_factory() as session, session.begin():
                session.execute(insert(RegistryEntry).values(cert_id=cert_id, sha256=sha256)
                                .on_conflict_do_nothing(index_elements=[RegistryEntry.cert_id]))
                if session.get(RegistryEntry, cert_id).sha256 != sha256:
                    raise RegistryConflict("El identificador ya tiene otra huella registrada")
        except (OperationalError, InterfaceError) as exc:
            raise RegistryUnavailable("Registro temporalmente no disponible") from exc

    def lookup(self, cert_id: UUID) -> str | None:
        try:
            with self.session_factory() as session:
                entry = session.get(RegistryEntry, cert_id)
                return entry.sha256 if entry is not None else None
        except (OperationalError, InterfaceError) as exc:
            raise RegistryUnavailable("Registro temporalmente no disponible") from exc
