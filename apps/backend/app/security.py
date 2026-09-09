import hashlib
import hmac
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.config import get_settings

hasher = PasswordHasher()
DUMMY_HASH = hasher.hash(secrets.token_urlsafe(32))


def hash_password(password: str) -> str:
    if len(password) < 12 or len(password) > 128 or "CHANGE_ME" in password:
        raise ValueError("Password must contain 12-128 characters and cannot be a placeholder")
    return hasher.hash(password)


def verify_password(password: str, encoded: str) -> bool:
    try:
        return hasher.verify(encoded, password)
    except VerificationError, InvalidHashError:
        return False


def digest(value: str) -> str:
    return hmac.new(
        get_settings().app_secret_key.get_secret_value().encode(), value.encode(), hashlib.sha256
    ).hexdigest()
