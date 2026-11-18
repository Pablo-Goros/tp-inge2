import datetime as dt
import re
from functools import lru_cache
import uuid
from collections.abc import Callable

import bcrypt
import jwt
from fastapi import APIRouter, Depends
from sqlalchemy.exc import IntegrityError
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.errors import ApiError, forbidden, unauthenticated
from app.api.schemas import ErrorResponse
from app.config import get_settings
from app.domain.normalize import normalize_email
from app.infrastructure.db import get_session
from app.infrastructure.models import Institution, User

TOKEN_TTL = dt.timedelta(hours=8)
_bearer = HTTPBearer(auto_error=False, description="JWT obtenido en POST /api/auth/login")


@lru_cache
def _dummy_hash() -> str:
    """Hash fijo (con las rondas configuradas) para igualar el tiempo cuando el email no existe."""
    return bcrypt.hashpw(b"dummy", bcrypt.gensalt(rounds=get_settings().bcrypt_rounds)).decode()


def hash_password(password: str, rounds: int = 12) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=rounds)).decode()


router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    role: str
    name: str


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(max_length=254)
    password: str = Field(min_length=8, max_length=72)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("no puede estar vacío")
        return v

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = normalize_email(v)
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v):
            raise ValueError("email inválido")
        return v

    @field_validator("password")
    @classmethod
    def _password(cls, v: str) -> str:
        if len(v.encode()) > 72:  # límite de bcrypt
            raise ValueError("máximo 72 bytes")
        return v


def create_token(user: User) -> str:
    claims = {
        "sub": str(user.id),
        "role": user.role,
        "exp": dt.datetime.now(dt.timezone.utc) + TOKEN_TTL,
    }
    return jwt.encode(claims, get_settings().jwt_secret, algorithm="HS256")


@router.post(
    "/login",
    response_model=LoginResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}},
)
def login(body: LoginRequest, session: Session = Depends(get_session)):
    user = session.scalar(select(User).where(User.email == normalize_email(body.email)))
    stored = user.password_hash if user is not None else _dummy_hash()
    try:
        ok = bcrypt.checkpw(body.password.encode(), stored.encode()) and user is not None
    except ValueError:  # contraseña >72 bytes o hash almacenado malformado
        ok = False
    if not ok:
        raise unauthenticated("Credenciales inválidas")
    return LoginResponse(access_token=create_token(user), role=user.role, name=user.name)


@router.post(
    "/register",
    status_code=201,
    response_model=LoginResponse,
    responses={400: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def register(body: RegisterRequest, session: Session = Depends(get_session)):
    """Alta de alumno con email y contraseña. Devuelve lo mismo que login (sesión iniciada)."""
    if session.scalar(select(User.id).where(User.email == body.email)) is not None:
        raise _email_taken()
    inst_id = session.scalar(select(Institution.id).order_by(Institution.name).limit(1))
    if inst_id is None:
        raise ApiError(503, "UNAVAILABLE", "El sistema aún no está inicializado")
    user = User(
        institution_id=inst_id, email=body.email, name=body.name, role="student",
        password_hash=hash_password(body.password, get_settings().bcrypt_rounds),
    )
    session.add(user)
    try:
        session.commit()
    except IntegrityError:  # carrera: otro registro con el mismo email entre el SELECT y el INSERT
        session.rollback()
        raise _email_taken() from None
    return LoginResponse(access_token=create_token(user), role=user.role, name=user.name)


def _email_taken() -> ApiError:
    return ApiError(409, "CONFLICT", "Ya existe una cuenta con ese email")


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: Session = Depends(get_session),
) -> User:
    if creds is None:
        raise unauthenticated()
    try:
        claims = jwt.decode(
            creds.credentials,
            get_settings().jwt_secret,
            algorithms=["HS256"],
            options={"require": ["exp", "sub"]},
        )
        user_id = uuid.UUID(claims["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise unauthenticated() from None
    user = session.get(User, user_id)
    if user is None:
        raise unauthenticated()
    return user


def require_role(role: str) -> Callable[..., User]:
    def dep(user: User = Depends(current_user)) -> User:
        if user.role != role:
            raise forbidden()
        return user

    return dep
