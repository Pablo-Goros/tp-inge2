import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: list | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details if details is not None else []


def unauthenticated(message: str = "Falta el token o es inválido") -> ApiError:
    return ApiError(401, "UNAUTHENTICATED", message)


def forbidden(message: str = "No tiene permiso para esta operación") -> ApiError:
    return ApiError(403, "FORBIDDEN", message)


def not_found(message: str = "Recurso inexistente") -> ApiError:
    return ApiError(404, "NOT_FOUND", message)


def _response(status: int, code: str, message: str, details: list) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "details": details}},
    )


_HTTP_CODES = {401: "UNAUTHENTICATED", 403: "FORBIDDEN", 404: "NOT_FOUND"}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError):
        return _response(exc.status, exc.code, exc.message, exc.details)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        details = [
            {"loc": list(e.get("loc", [])), "msg": e.get("msg", ""), "type": e.get("type", "")}
            for e in exc.errors()
        ]
        return _response(400, "VALIDATION_ERROR", "Solicitud inválida", details)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        code = _HTTP_CODES.get(exc.status_code, "HTTP_ERROR")
        return _response(exc.status_code, code, str(exc.detail), [])

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        logger.exception("unhandled error", exc_info=exc)
        return _response(500, "INTERNAL_ERROR", "Error interno del servidor", [])
