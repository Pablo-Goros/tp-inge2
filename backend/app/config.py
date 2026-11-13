from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Variables de entorno de contracts §1."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://certs:certs@localhost:55432/certs"
    rabbitmq_url: str = "amqp://guest:guest@localhost:55672/%2F"
    jwt_secret: str = "dev-secret-change-me"
    demo_password: str = "demo1234"
    public_base_url: str = "http://localhost:8080"
    registry_backend: str = "simulated"
    max_attempts: int = 3
    retry_delay_seconds: int = 5
    fault_injection: str = ""


def get_settings() -> Settings:
    return Settings()
