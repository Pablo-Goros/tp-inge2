import datetime as dt
import uuid
from collections.abc import Callable

import bcrypt
import jwt
from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.errors import forbidden, unauthenticated
from app.config import get_settings
from app.infrastructure.db import get_session
from app.infrastructure.models import User

TOKEN_TTL = dt.timedelta(hours=8)
_bearer = HTTPBearer(auto_error=False, description="JWT obtenido en POST /api/auth/login")

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    role: str
    name: str


def create_token(user: User) -> str:
    claims = {
        "sub": str(user.id),
        "role": user.role,
        "exp": dt.datetime.now(dt.timezone.utc) + TOKEN_TTL,
    }
    return jwt.encode(claims, get_settings().jwt_secret, algorithm="HS256")


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, session: Session = Depends(get_session)):
    user = session.scalar(select(User).where(User.email == body.email))
    ok = user is not None and bcrypt.checkpw(body.password.encode(), user.password_hash.encode())
    if not ok:
        raise unauthenticated("Credenciales inválidas")
    return LoginResponse(access_token=create_token(user), role=user.role, name=user.name)


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: Session = Depends(get_session),
) -> User:
    if creds is None:
        raise unauthenticated()
    try:
        claims = jwt.decode(creds.credentials, get_settings().jwt_secret, algorithms=["HS256"])
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
