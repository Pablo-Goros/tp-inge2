from app.config import Settings
from app.domain.registry import Registry
from app.infrastructure.db import SessionLocal
from app.infrastructure.registry_simulated import SimulatedRegistry


def get_registry(settings: Settings) -> Registry:
    if settings.registry_backend != "simulated":
        raise ValueError("REGISTRY_BACKEND soportado: simulated")
    return SimulatedRegistry(SessionLocal)
