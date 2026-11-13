from fastapi import APIRouter, FastAPI
from fastapi.openapi.utils import get_openapi

from app.api import auth, batches, stubs
from app.api.errors import install_error_handlers


def create_app() -> FastAPI:
    app = FastAPI(title="Certificados API", version="0.1.0")
    install_error_handlers(app)
    api = APIRouter(prefix="/api")
    api.include_router(auth.router)
    api.include_router(batches.router)
    api.include_router(stubs.router)
    app.include_router(api)
    app.openapi = lambda: _openapi(app)
    return app


def _openapi(app: FastAPI) -> dict:
    """FastAPI anuncia 422; esta API responde 400 con el sobre de error."""
    if app.openapi_schema:
        return app.openapi_schema
    spec = get_openapi(title=app.title, version=app.version, routes=app.routes)
    err = {"$ref": "#/components/schemas/ErrorResponse"}
    for ops in spec["paths"].values():
        for op in ops.values():
            if "422" in op["responses"] or "requestBody" in op or "parameters" in op:
                op["responses"].pop("422", None)
                op["responses"].setdefault("400", {
                    "description": "VALIDATION_ERROR",
                    "content": {"application/json": {"schema": err}},
                })
    for name in ("HTTPValidationError", "ValidationError"):
        spec["components"]["schemas"].pop(name, None)
    app.openapi_schema = spec
    return spec


app = create_app()
