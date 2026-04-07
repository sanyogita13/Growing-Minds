import base64
import hashlib
import hmac
import json
import os
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Callable, Iterable
from uuid import uuid4

from .config import settings


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("utf-8")


def _b64url_decode(raw: str) -> bytes:
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(raw + padding)


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or os.urandom(16).hex()
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120000)
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    salt, expected = stored_hash.split("$", 1)
    candidate = hash_password(password, salt).split("$", 1)[1]
    return hmac.compare_digest(candidate, expected)


def create_access_token(subject: str, role: str, organization_id: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": subject,
        "role": role,
        "organization_id": organization_id,
        "exp": int((datetime.now(UTC) + timedelta(minutes=settings.access_token_ttl_minutes)).timestamp()),
    }
    encoded_header = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    encoded_payload = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{encoded_header}.{encoded_payload}".encode("utf-8")
    signature = hmac.new(settings.secret_key.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{encoded_header}.{encoded_payload}.{_b64url_encode(signature)}"


def decode_access_token(token: str) -> dict:
    encoded_header, encoded_payload, encoded_signature = token.split(".")
    signing_input = f"{encoded_header}.{encoded_payload}".encode("utf-8")
    expected_signature = hmac.new(settings.secret_key.encode("utf-8"), signing_input, hashlib.sha256).digest()
    actual_signature = _b64url_decode(encoded_signature)
    if not hmac.compare_digest(actual_signature, expected_signature):
        raise ValueError("Invalid token signature")

    payload = json.loads(_b64url_decode(encoded_payload))
    if int(payload["exp"]) < int(datetime.now(UTC).timestamp()):
        raise ValueError("Token expired")
    return payload


@dataclass
class SeedUser:
    id: str
    organization_id: str
    full_name: str
    email: str
    role: str
    password_hash: str


def seeded_users() -> list[SeedUser]:
    return [
        SeedUser(
            id=str(uuid4()),
            organization_id="org-demo",
            full_name="Admin User",
            email="admin@hiresight.ai",
            role="admin",
            password_hash=hash_password("Admin@123"),
        ),
        SeedUser(
            id=str(uuid4()),
            organization_id="org-demo",
            full_name="HR User",
            email="hr@hiresight.ai",
            role="hr",
            password_hash=hash_password("Hr@12345"),
        ),
    ]
