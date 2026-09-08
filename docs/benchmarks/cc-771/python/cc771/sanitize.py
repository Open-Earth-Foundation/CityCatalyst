"""Secret and payload sanitization for CC-771 artifacts."""

from __future__ import annotations

import copy
import hashlib
import re
from typing import Any


SIGNED_URL_PATTERNS = (
    re.compile(r"https?://[^\s\"']+X-Amz-Signature=[^\s\"']+", re.I),
    re.compile(r"https?://[^\s\"']+Signature=[^\s\"']+", re.I),
    re.compile(r"https?://storage\.googleapis\.com/[^\s\"']+", re.I),
)

AUTH_HEADER_KEYS = {
    "authorization",
    "x-api-key",
    "api-key",
    "api_key",
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_base64_payload(value: str | None) -> str | None:
    if not value:
        return None
    payload = value
    if "," in payload and payload.startswith("data:"):
        payload = payload.split(",", 1)[1]
    try:
        import base64

        raw = base64.b64decode(payload, validate=False)
    except Exception:
        raw = payload.encode("utf-8", errors="replace")
    return sha256_bytes(raw)


def redact_string(value: str) -> str:
    out = value
    for pattern in SIGNED_URL_PATTERNS:
        out = pattern.sub("<signed-url-omitted>", out)
    if "Bearer " in out:
        out = re.sub(r"Bearer\s+\S+", "Bearer <redacted>", out)
    return out


def sanitize_for_persistence(obj: Any) -> Any:
    """Deep-copy and strip secrets / bulky base64 from provider payloads."""
    data = copy.deepcopy(obj)
    return _walk(data)


def _walk(node: Any) -> Any:
    if isinstance(node, dict):
        cleaned: dict[str, Any] = {}
        for key, value in node.items():
            lower = str(key).lower()
            if lower in AUTH_HEADER_KEYS:
                cleaned[key] = "<redacted>"
                continue
            if lower in {"document_url", "url", "signed_url"} and isinstance(value, str):
                cleaned[key] = "<signed-url-omitted>"
                continue
            if lower in {"image_base64", "imageBase64"}:
                cleaned["image_sha256"] = sha256_base64_payload(
                    value if isinstance(value, str) else None
                )
                cleaned["image_base64_omitted"] = True
                continue
            cleaned[key] = _walk(value)
        return cleaned
    if isinstance(node, list):
        return [_walk(item) for item in node]
    if isinstance(node, str):
        return redact_string(node)
    return node
