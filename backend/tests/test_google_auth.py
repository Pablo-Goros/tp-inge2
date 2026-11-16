import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from app.api import google_auth
from app.config import get_settings

CLIENT_ID = "test-client-id.apps.googleusercontent.com"
ISS = "https://accounts.google.com"

_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def make_token(key=_KEY, algorithm="RS256", **overrides):
    claims = {
        "iss": ISS,
        "aud": CLIENT_ID,
        "email": "op@itba.test",
        "email_verified": True,
        "exp": int(time.time()) + 600,
    }
    claims.update(overrides)
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, key, algorithm=algorithm)


@pytest.fixture(autouse=True)
def patched_key(monkeypatch):
    monkeypatch.setattr(google_auth, "_signing_key", lambda token: _KEY.public_key())


@pytest.fixture
def google_env(monkeypatch, clear_settings_cache):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", CLIENT_ID)


def google_login(client, credential):
    return client.post("/api/auth/google", json={"credential": credential})


def test_google_login_ok_returns_login_response(client, users, google_env):
    r = google_login(client, make_token())
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "operator"
    assert body["name"] == "Operadora"
    claims = jwt.decode(body["access_token"], get_settings().jwt_secret, algorithms=["HS256"])
    assert claims["sub"] == str(users["operator"].id)
    assert claims["role"] == "operator"


def test_google_login_normalizes_email(client, users, google_env):
    r = google_login(client, make_token(email=" OP@Itba.Test "))
    assert r.status_code == 200
    assert r.json()["role"] == "operator"


def test_google_login_unknown_email_401(client, users, google_env):
    r = google_login(client, make_token(email="nadie@itba.test"))
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "UNAUTHENTICATED"


def test_google_login_error_body_equals_password_login_error_body(client, users, google_env):
    bad_password = client.post("/api/auth/login", json={"email": "op@itba.test", "password": "mal"})
    unknown_google = google_login(client, make_token(email="nadie@itba.test"))
    bad_token = google_login(client, "no-es-un-jwt")
    assert bad_password.status_code == unknown_google.status_code == bad_token.status_code == 401
    assert bad_password.json() == unknown_google.json() == bad_token.json()


def test_verify_returns_email_unnormalized():
    assert google_auth.verify_google_id_token(make_token(email=" OP@Itba.Test "), CLIENT_ID) == " OP@Itba.Test "


def test_verify_accepts_bare_issuer():
    assert google_auth.verify_google_id_token(make_token(iss="accounts.google.com"), CLIENT_ID) == "op@itba.test"


@pytest.mark.parametrize("verified", [False, None, "true"])
def test_google_login_unverified_email_401(verified):
    with pytest.raises(google_auth.InvalidGoogleToken):
        google_auth.verify_google_id_token(make_token(email_verified=verified), CLIENT_ID)


def test_google_login_wrong_audience_401():
    with pytest.raises(google_auth.InvalidGoogleToken):
        google_auth.verify_google_id_token(make_token(aud="otro-client"), CLIENT_ID)


def test_google_login_wrong_issuer_401():
    with pytest.raises(google_auth.InvalidGoogleToken):
        google_auth.verify_google_id_token(make_token(iss="https://evil.example"), CLIENT_ID)


def test_google_login_expired_401():
    with pytest.raises(google_auth.InvalidGoogleToken):
        google_auth.verify_google_id_token(make_token(exp=int(time.time()) - 60), CLIENT_ID)


def test_google_login_missing_email_401():
    with pytest.raises(google_auth.InvalidGoogleToken):
        google_auth.verify_google_id_token(make_token(email=None), CLIENT_ID)


def test_google_login_signed_with_other_key_401():
    with pytest.raises(google_auth.InvalidGoogleToken):
        google_auth.verify_google_id_token(make_token(key=_OTHER_KEY), CLIENT_ID)


def test_google_login_hs256_token_rejected():
    token = jwt.encode(
        {"iss": ISS, "aud": CLIENT_ID, "email": "op@itba.test", "email_verified": True, "exp": int(time.time()) + 600},
        "x" * 40,
        algorithm="HS256",
    )
    with pytest.raises(google_auth.InvalidGoogleToken):
        google_auth.verify_google_id_token(token, CLIENT_ID)


def test_google_login_without_client_id_401():
    with pytest.raises(google_auth.InvalidGoogleToken):
        google_auth.verify_google_id_token(make_token(aud=""), "")


def test_google_login_jwks_fetch_error_401(monkeypatch):
    def boom(token):
        raise jwt.PyJWKClientConnectionError("sin red")

    monkeypatch.setattr(google_auth, "_signing_key", boom)
    with pytest.raises(google_auth.InvalidGoogleToken):
        google_auth.verify_google_id_token(make_token(), CLIENT_ID)


def test_google_login_garbage_token_401():
    with pytest.raises(google_auth.InvalidGoogleToken):
        google_auth.verify_google_id_token("basura", CLIENT_ID)


@pytest.mark.parametrize("exc", [ValueError("json"), OSError("socket")])
def test_google_login_non_jwt_error_from_key_fetch_is_invalid_token(monkeypatch, exc):
    def boom(token):
        raise exc

    monkeypatch.setattr(google_auth, "_signing_key", boom)
    with pytest.raises(google_auth.InvalidGoogleToken):
        google_auth.verify_google_id_token(make_token(), CLIENT_ID)


def test_verify_accepts_iat_slightly_in_future():
    token = make_token(iat=int(time.time()) + 10)
    assert google_auth.verify_google_id_token(token, CLIENT_ID) == "op@itba.test"

