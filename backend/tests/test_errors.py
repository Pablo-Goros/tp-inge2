def test_unknown_route_uses_error_envelope(client):
    r = client.get("/api/no-existe")
    assert r.status_code == 404
    err = r.json()["error"]
    assert err["code"] == "NOT_FOUND"
    assert "message" in err and "details" in err


def test_request_validation_error_is_400_envelope(client):
    r = client.post("/api/auth/login", json={"email": "x"})
    assert r.status_code == 400
    err = r.json()["error"]
    assert err["code"] == "VALIDATION_ERROR"
    assert isinstance(err["details"], list) and err["details"]


def test_verify_routes_are_public_stubs(client):
    r = client.get("/api/verify/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 501
