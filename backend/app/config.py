from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Variables de entorno de contracts §1."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://certs:certs@localhost:55432/certs"
    rabbitmq_url: str = "amqp://guest:guest@localhost:55672/%2F"
    jwt_secret: str  # obligatorio, >= 32 bytes (sin valor por defecto)
    demo_password: str = "demo1234"
    public_base_url: str = "http://localhost:8080"
    registry_backend: str = "simulated"
    max_attempts: int = 3
    retry_delay_seconds: int = 5
    fault_injection: str = ""
    init_timeout_seconds: int = 60
    bcrypt_rounds: int = 12
    poll_interval_seconds: float = 1.0

    @field_validator("jwt_secret")
    @classmethod
    def _jwt_secret_long_enough(cls, v: str) -> str:
        if len(v.encode()) < 32:
            raise ValueError("JWT_SECRET debe tener al menos 32 bytes")
        return v

    @field_validator("database_url")
    @classmethod
    def _psycopg_scheme(cls, v: str) -> str:
        for plain in ("postgresql://", "postgres://"):
            if v.startswith(plain):
                return "postgresql+psycopg://" + v[len(plain):]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
