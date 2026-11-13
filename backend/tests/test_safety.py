import pytest

from tests._safety import UnsafeTarget, check_broker_url, check_db_url


def test_test_urls_pass(monkeypatch):
    monkeypatch.delenv("ALLOW_TEST_RESET", raising=False)
    check_db_url("postgresql+psycopg://certs:certs@localhost:55432/certs")
    check_db_url("postgresql+psycopg://certs:certs@127.0.0.1:55432/certs")
    check_broker_url("amqp://guest:guest@localhost:55672/%2F")


@pytest.mark.parametrize("url", [
    "postgresql+psycopg://u:p@prod.example.com:55432/certs",
    "postgresql+psycopg://u:p@localhost:5432/certs",
])
def test_non_test_db_refused(monkeypatch, url):
    monkeypatch.delenv("ALLOW_TEST_RESET", raising=False)
    with pytest.raises(UnsafeTarget, match="ALLOW_TEST_RESET"):
        check_db_url(url)


@pytest.mark.parametrize("url", ["amqp://g:g@localhost:5672/%2F", "amqp://g:g@mq.example.com:55672/%2F"])
def test_non_test_broker_refused(monkeypatch, url):
    monkeypatch.delenv("ALLOW_TEST_RESET", raising=False)
    with pytest.raises(UnsafeTarget):
        check_broker_url(url)


def test_allow_test_reset_overrides(monkeypatch):
    monkeypatch.setenv("ALLOW_TEST_RESET", "1")
    check_db_url("postgresql+psycopg://u:p@prod.example.com:5432/certs")
    check_broker_url("amqp://g:g@mq.example.com:5672/%2F")
