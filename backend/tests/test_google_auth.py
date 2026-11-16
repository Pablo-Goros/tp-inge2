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


def test_google_login_unknown_email_404(client, users, google_env):
    r = google_login(client, make_token(email="nadie@itba.test"))
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "NOT_FOUND"
    assert r.json()["error"]["message"] == "Todavía no tenés cuenta"


def test_google_login_error_body_equals_password_login_error_body(client, users, google_env):
    bad_password = client.post("/api/auth/login", json={"email": "op@itba.test", "password": "mal"})
    bad_token = google_login(client, "no-es-un-jwt")
    assert bad_password.status_code == bad_token.status_code == 401
    assert bad_password.json() == bad_token.json()


def test_verify_returns_identity_with_name():
    ident = google_auth.verify_google_id_token(make_token(email=" OP@Itba.Test ", name="Ana Pérez"), CLIENT_ID)
    assert ident == google_auth.GoogleIdentity(email=" OP@Itba.Test ", name="Ana Pérez")


@pytest.mark.parametrize("name", [None, "", "   ", 123])
def test_verify_without_name_claim_gives_none(name):
    ident = google_auth.verify_google_id_token(make_token(name=name), CLIENT_ID)
    assert ident.email == "op@itba.test"
    assert ident.name is None


def test_verify_accepts_bare_issuer():
    assert google_auth.verify_google_id_token(make_token(iss="accounts.google.com"), CLIENT_ID).email == "op@itba.test"


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
    assert google_auth.verify_google_id_token(token, CLIENT_ID).email == "op@itba.test"



# --- signup de alumno con Google ---

def google_signup(client, credential, **extra):
    return client.post("/api/auth/google/signup", json={"credential": credential, **extra})


def _user(session, email):
    from sqlalchemy import select

    from app.infrastructure.models import User

    return session.scalar(select(User).where(User.email == email))


def _count_users(session):
    from sqlalchemy import func, select

    from app.infrastructure.models import User

    return session.scalar(select(func.count()).select_from(User))


def test_google_signup_creates_student(client, users, google_env, session):
    r = google_signup(client, make_token(email="nueva@itba.test", name="Nueva Persona"), name="Nueva")
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "student"
    assert body["name"] == "Nueva"
    u = _user(session, "nueva@itba.test")
    assert u.role == "student"
    assert u.institution_id == users["student"].institution_id
    claims = jwt.decode(body["access_token"], get_settings().jwt_secret, algorithms=["HS256"])
    assert claims["sub"] == str(u.id) and claims["role"] == "student"
    me = client.get("/api/me/certificates", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200


def test_google_signup_normalizes_email_and_trims_name(client, users, google_env, session):
    r = google_signup(client, make_token(email=" Nueva@Itba.Test "), name="  Ana \U0001F600  ")
    assert r.status_code == 200
    assert r.json()["name"] == "Ana \U0001F600"
    assert _user(session, "nueva@itba.test").name == "Ana \U0001F600"


def test_google_signup_existing_account_behaves_as_login(client, users, google_env, session):
    before = _count_users(session)
    r = google_signup(client, make_token(email="op@itba.test", name="Otro"), name="Hacker")
    assert r.status_code == 200
    assert r.json()["role"] == "operator"
    assert r.json()["name"] == "Operadora"
    assert _count_users(session) == before
    assert _user(session, "op@itba.test").name == "Operadora"


def test_google_signup_ignores_role_in_body(client, users, google_env, session):
    r = google_signup(client, make_token(email="nueva@itba.test"), name="Nueva", role="operator")
    assert r.status_code == 200
    assert r.json()["role"] == "student"
    assert _user(session, "nueva@itba.test").role == "student"
    r = google_signup(client, make_token(email="al@itba.test"), role="operator")
    assert r.json()["role"] == "student"
    assert _user(session, "al@itba.test").role == "student"


@pytest.mark.parametrize("credential_kwargs", [{"aud": "otro-client"}, {"exp": int(time.time()) - 60}, {"email_verified": False}])
def test_google_signup_invalid_token_401_creates_nothing(client, users, google_env, session, credential_kwargs):
    before = _count_users(session)
    r = google_signup(client, make_token(email="nueva@itba.test", **credential_kwargs), name="Nueva")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "UNAUTHENTICATED"
    assert r.json()["error"]["message"] == "Credenciales inválidas"
    assert _count_users(session) == before


def test_google_signup_without_client_id_401(client, users, monkeypatch, clear_settings_cache, session):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "")
    before = _count_users(session)
    r = google_signup(client, make_token(email="nueva@itba.test"), name="Nueva")
    assert r.status_code == 401
    assert _count_users(session) == before


def test_google_signup_name_too_long_400(client, users, google_env, session):
    before = _count_users(session)
    r = google_signup(client, make_token(email="nueva@itba.test"), name="x" * 101)
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert _count_users(session) == before
    assert google_signup(client, make_token(email="nueva@itba.test"), name="x" * 100).status_code == 200


def test_google_signup_empty_name_falls_back_to_token_name(client, users, google_env, session):
    r = google_signup(client, make_token(email="a@itba.test", name="Del Token"), name="   ")
    assert r.json()["name"] == "Del Token"
    r = google_signup(client, make_token(email="b@itba.test", name="Del Token 2"))
    assert r.json()["name"] == "Del Token 2"
    r = google_signup(client, make_token(email="solo.local@itba.test"))
    assert r.json()["name"] == "solo.local"


def test_google_signup_twice_second_is_login(client, users, google_env, session):
    token = make_token(email="nueva@itba.test")
    first = google_signup(client, token, name="Nueva")
    n = _count_users(session)
    second = google_signup(client, token, name="Otro Nombre")
    assert first.status_code == second.status_code == 200
    assert second.json()["name"] == "Nueva"
    assert _count_users(session) == n


def test_google_signup_created_user_cannot_password_login(client, users, google_env, session):
    assert google_signup(client, make_token(email="nueva@itba.test"), name="Nueva").status_code == 200
    for pw in ["", "nueva", "demo1234", "password"]:
        r = client.post("/api/auth/login", json={"email": "nueva@itba.test", "password": pw})
        assert r.status_code == 401
    # y tras el signup, el login con Google funciona
    assert google_login(client, make_token(email="nueva@itba.test")).status_code == 200
