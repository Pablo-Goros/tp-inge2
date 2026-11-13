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


def test_method_not_allowed_is_http_error_envelope(client):
    r = client.put("/api/auth/login")
    assert r.status_code == 405
    assert r.json()["error"]["code"] == "HTTP_ERROR"


def test_unhandled_exception_is_500_envelope(session):
    from fastapi.testclient import TestClient

    from app.api.main import create_app

    app = create_app()

    @app.get("/boom")
    def boom():
        raise RuntimeError("secreto interno")

    r = TestClient(app, raise_server_exceptions=False).get("/boom")
    assert r.status_code == 500
    assert r.json()["error"]["code"] == "INTERNAL_ERROR"
    assert "secreto" not in r.text


def test_openapi_has_no_422_and_documents_400_and_501():
    from app.api.main import create_app

    spec = create_app().openapi()
    for path, ops in spec["paths"].items():
        for op in ops.values():
            assert "422" not in op["responses"], path
    assert "HTTPValidationError" not in spec["components"]["schemas"]
    login = spec["paths"]["/api/auth/login"]["post"]["responses"]
    assert "400" in login and "401" in login
    assert "501" in spec["paths"]["/api/me/certificates"]["get"]["responses"]
    pdf = spec["paths"]["/api/certificates/{cert_id}/pdf"]["get"]["responses"]["200"]["content"]
    assert list(pdf) == ["application/pdf"]
    post = spec["paths"]["/api/batches"]["post"]["responses"]
    assert "200" in post and "201" in post
