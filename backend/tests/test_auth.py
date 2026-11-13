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
