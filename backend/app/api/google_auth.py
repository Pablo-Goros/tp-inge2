"""Verificación de ID tokens de Google Identity Services (RS256, claves JWKS de Google)."""
from functools import lru_cache

import jwt

GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = {"https://accounts.google.com", "accounts.google.com"}


class InvalidGoogleToken(Exception):
    pass


@lru_cache
def _jwks_client() -> jwt.PyJWKClient:
    return jwt.PyJWKClient(GOOGLE_JWKS_URL, timeout=5)


def _signing_key(token: str):
    return _jwks_client().get_signing_key_from_jwt(token).key


def verify_google_id_token(credential: str, client_id: str) -> str:
    """Devuelve el email (sin normalizar) de un ID token válido con email verificado."""
    if not client_id:
        raise InvalidGoogleToken("GOOGLE_CLIENT_ID no configurado")
    try:
        key = _signing_key(credential)
        claims = jwt.decode(
            credential,
            key,
            algorithms=["RS256"],
            audience=client_id,
            issuer=GOOGLE_ISSUERS,
            leeway=30,
            options={"require": ["exp", "iss", "aud", "email"]},
        )
    except jwt.PyJWTError as e:
        raise InvalidGoogleToken(str(e)) from None
    except Exception as e:  # red/JSON/IncompleteRead al traer JWKS: nunca 500
        raise InvalidGoogleToken(f"verificación fallida: {type(e).__name__}") from None
    email = claims["email"]
    if claims.get("email_verified") is not True or not isinstance(email, str):
        raise InvalidGoogleToken("email no verificado")
    return email
