"""Guardas para fixtures destructivas: solo operan sobre la instancia de test dedicada."""
import os
from urllib.parse import urlsplit

TEST_DB_PORT = 55432
TEST_BROKER_PORT = 55672
_LOCAL = {"localhost", "127.0.0.1"}


class UnsafeTarget(RuntimeError):
    pass


def _check(kind: str, url: str, port: int) -> None:
    if os.environ.get("ALLOW_TEST_RESET") == "1":
        return
    parts = urlsplit(url)
    if parts.hostname in _LOCAL and parts.port == port:
        return
    raise UnsafeTarget(
        f"{kind} apunta a {parts.hostname}:{parts.port}; los tests destructivos solo corren contra "
        f"localhost:{port} (compose de tests). Exportá ALLOW_TEST_RESET=1 para forzarlo.")


def check_db_url(url: str) -> None:
    _check("DATABASE_URL", url, TEST_DB_PORT)


def check_broker_url(url: str) -> None:
    _check("RABBITMQ_URL", url, TEST_BROKER_PORT)


def require_test_db() -> None:
    """Para fixtures: aborta toda la corrida si DATABASE_URL no es la instancia de test."""
    import pytest
    try:
        check_db_url(os.environ["DATABASE_URL"])
    except UnsafeTarget as exc:
        pytest.exit(str(exc), returncode=2)


def require_test_broker() -> None:
    import pytest
    try:
        check_broker_url(os.environ["RABBITMQ_URL"])
    except UnsafeTarget as exc:
        pytest.exit(str(exc), returncode=2)
