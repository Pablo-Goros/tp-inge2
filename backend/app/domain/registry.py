"""Registry boundary shared by issuance and public verification."""
from typing import Protocol
from uuid import UUID


class RegistryConflict(Exception):
    """The identifier already belongs to different document bytes."""


class RegistryUnavailable(Exception):
    """The registry cannot currently be read or written."""


class Registry(Protocol):
    def register(self, cert_id: UUID, sha256: str) -> None: ...

    def lookup(self, cert_id: UUID) -> str | None: ...
