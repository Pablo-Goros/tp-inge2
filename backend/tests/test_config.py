import pytest
from pydantic import ValidationError

from app.config import Settings, get_settings

GOOD = "x" * 32


def test_jwt_secret_missing_fails(monkeypatch):
    monkeypatch.delenv("JWT_SECRET", raising=False)
    with pytest.raises(ValidationError, match="jwt_secret"):
        Settings(_env_file=None)


def test_jwt_secret_too_short_fails(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "short")
    with pytest.raises(ValidationError, match="32"):
        Settings(_env_file=None)


def test_jwt_secret_ok(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", GOOD)
    assert Settings(_env_file=None).jwt_secret == GOOD


def test_create_app_fails_fast_without_secret(monkeypatch, clear_settings_cache):
    from app.api.main import create_app

    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.chdir("/")  # sin .env
    get_settings.cache_clear()
    with pytest.raises(ValidationError):
        create_app()


@pytest.mark.parametrize("given", ["postgresql://u:p@h:5432/d", "postgres://u:p@h:5432/d"])
def test_database_url_scheme_rewritten(monkeypatch, given):
    monkeypatch.setenv("JWT_SECRET", GOOD)
    monkeypatch.setenv("DATABASE_URL", given)
    assert Settings(_env_file=None).database_url == "postgresql+psycopg://u:p@h:5432/d"


def test_database_url_psycopg_scheme_untouched(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", GOOD)
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:p@h:5432/d")
    assert Settings(_env_file=None).database_url == "postgresql+psycopg://u:p@h:5432/d"


def test_get_settings_is_cached(clear_settings_cache):
    assert get_settings() is get_settings()
