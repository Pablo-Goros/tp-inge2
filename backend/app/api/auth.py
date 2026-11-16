import datetime as dt
from functools import lru_cache
import secrets
import uuid
from collections.abc import Callable

import bcrypt
import jwt
from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api import google_auth
from app.api.errors import forbidden, not_found, unauthenticated
from app.api.schemas import ErrorResponse
from app.config import get_settings
from app.domain.normalize import normalize_email
from app.infrastructure.db import get_session
from app.infrastructure.models import Institution, User

TOKEN_TTL = dt.timedelta(hours=8)
MAX_NAME_LEN = 100
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


class GoogleLoginRequest(BaseModel):
    credential: str


class GoogleSignupRequest(BaseModel):
    credential: str
    name: str | None = None

    @field_validator("name")
    @classmethod
    def _clean_name(cls, v: str | None) -> str | None:
        v = v.strip() if v is not None else None
        if v and len(v) > MAX_NAME_LEN:
            raise ValueError(f"máximo {MAX_NAME_LEN} caracteres")
        return v or None  # vacío = no enviado: se usa el nombre del token


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


def _verified_identity(credential: str) -> google_auth.GoogleIdentity:
    try:
        return google_auth.verify_google_id_token(credential, get_settings().google_client_id)
    except google_auth.InvalidGoogleToken:
        raise unauthenticated("Credenciales inválidas") from None


def _user_by_email(session: Session, identity: google_auth.GoogleIdentity) -> User | None:
    return session.scalar(select(User).where(User.email == normalize_email(identity.email)))


def _login_response(user: User) -> LoginResponse:
    return LoginResponse(access_token=create_token(user), role=user.role, name=user.name)


@router.post(
    "/google",
    response_model=LoginResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def login_google(body: GoogleLoginRequest, session: Session = Depends(get_session)):
    user = _user_by_email(session, _verified_identity(body.credential))
    if user is None:
        raise not_found("Todavía no tenés cuenta")
    return _login_response(user)


@router.post(
    "/google/signup",
    response_model=LoginResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}},
)
def signup_google(body: GoogleSignupRequest, session: Session = Depends(get_session)):
    """Alta de alumno (siempre `student`) con un ID token de Google; si ya existe, es un login."""
    identity = _verified_identity(body.credential)
    user = _user_by_email(session, identity)
    if user is None:
        institution_id = session.scalar(select(Institution.id).order_by(Institution.name, Institution.id).limit(1))
        if institution_id is None:
            raise unauthenticated("Credenciales inválidas")
        email = normalize_email(identity.email)
        name = (body.name or identity.name or email.split("@")[0]).strip()[:MAX_NAME_LEN] or email[:MAX_NAME_LEN]
        user = User(
            institution_id=institution_id, email=email, name=name, role="student",
            password_hash=hash_password(secrets.token_urlsafe(32), get_settings().bcrypt_rounds),
        )
        try:
            with session.begin_nested():
                session.add(user)
            session.commit()
        except IntegrityError:  # carrera: otra request creó el mismo email
            user = _user_by_email(session, identity)
            if user is None:
                raise
    return _login_response(user)


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
