import datetime as dt

import jwt

from app.config import get_settings


def login(client, email, password="demo1234"):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def test_login_ok_returns_token_role_name(client, users):
    r = login(client, "op@itba.test")
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "operator"
    assert body["name"] == "Operadora"
    claims = jwt.decode(body["access_token"], get_settings().jwt_secret, algorithms=["HS256"])
    assert claims["sub"] == str(users["operator"].id)
    assert claims["role"] == "operator"
    exp = dt.datetime.fromtimestamp(claims["exp"], dt.timezone.utc)
    assert dt.timedelta(hours=7, minutes=55) < exp - dt.datetime.now(dt.timezone.utc) <= dt.timedelta(hours=8)


def test_login_wrong_password_401_envelope(client, users):
    r = login(client, "op@itba.test", "mala")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "UNAUTHENTICATED"


def test_login_unknown_email_same_response(client, users):
    a = login(client, "op@itba.test", "mala")
    b = login(client, "nadie@itba.test")
    assert b.status_code == 401
    assert a.json() == b.json()


def test_student_token_on_operator_route_403(client, users):
    token = login(client, "al@itba.test").json()["access_token"]
    r = client.get("/api/batches", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "FORBIDDEN"


def test_operator_token_reaches_stub_501(client, users):
    token = login(client, "op@itba.test").json()["access_token"]
    r = client.get("/api/batches", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 501


def test_missing_token_401(client, users):
    r = client.get("/api/batches")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "UNAUTHENTICATED"


def test_invalid_token_401(client, users):
    r = client.get("/api/batches", headers={"Authorization": "Bearer basura"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "UNAUTHENTICATED"


# --- seguridad negativa ---
import time
import uuid

import pytest


def _tok(claims, secret=None, alg="HS256"):
    return jwt.encode(claims, secret or get_settings().jwt_secret, algorithm=alg)


def _get(client, token):
    return client.get("/api/batches", headers={"Authorization": f"Bearer {token}"})


def _assert_401(r):
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "UNAUTHENTICATED"


def test_expired_token_401(client, users):
    _assert_401(_get(client, _tok({"sub": str(users["operator"].id), "role": "operator", "exp": int(time.time()) - 10})))


def test_alg_none_token_401(client, users):
    t = jwt.encode({"sub": str(users["operator"].id), "role": "operator", "exp": int(time.time()) + 100}, None, algorithm="none")
    _assert_401(_get(client, t))


def test_wrong_secret_token_401(client, users):
    _assert_401(_get(client, _tok({"sub": str(users["operator"].id), "role": "operator", "exp": int(time.time()) + 100}, secret="x" * 40)))


def test_token_for_deleted_user_401(client, users):
    _assert_401(_get(client, _tok({"sub": str(uuid.uuid4()), "role": "operator", "exp": int(time.time()) + 100})))


def test_token_without_exp_401(client, users):
    _assert_401(_get(client, _tok({"sub": str(users["operator"].id), "role": "operator"})))


def test_token_without_sub_401(client, users):
    _assert_401(_get(client, _tok({"role": "operator", "exp": int(time.time()) + 100})))


def test_login_long_password_401_not_500(client, users):
    r = login(client, "op@itba.test", "a" * 100)
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "UNAUTHENTICATED"


def test_login_malformed_stored_hash_401(client, users, session):
    users["operator"].password_hash = "no-es-bcrypt"
    session.flush()
    assert login(client, "op@itba.test").status_code == 401


def test_stub_501_has_envelope(client, users):
    token = login(client, "op@itba.test").json()["access_token"]
    r = client.get("/api/batches", headers={"Authorization": f"Bearer {token}"})
    assert r.json()["error"]["code"] == "UNAVAILABLE"


@pytest.mark.parametrize("path", ["/api/batches", f"/api/batches/{uuid.uuid4()}"])
def test_student_forbidden_on_operator_routes(client, users, path):
    token = login(client, "al@itba.test").json()["access_token"]
    r = client.get(path, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


def test_student_forbidden_on_post_batches(client, users):
    token = login(client, "al@itba.test").json()["access_token"]
    r = client.post(
        "/api/batches",
        headers={"Authorization": f"Bearer {token}", "Idempotency-Key": "k"},
        data={"course_name": "c", "completion_date": "2026-10-30"},
        files={"file": ("a.csv", b"email\n")},
    )
    assert r.status_code == 403


def test_operator_forbidden_on_student_route(client, users):
    token = login(client, "op@itba.test").json()["access_token"]
    r = client.get("/api/me/certificates", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
