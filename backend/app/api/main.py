from fastapi import APIRouter, FastAPI

from app.api import auth, stubs
from app.api.errors import install_error_handlers


def create_app() -> FastAPI:
    app = FastAPI(title="Certificados API", version="0.1.0")
    install_error_handlers(app)
    api = APIRouter(prefix="/api")
    api.include_router(auth.router)
    api.include_router(stubs.router)
    app.include_router(api)
    return app


app = create_app()
