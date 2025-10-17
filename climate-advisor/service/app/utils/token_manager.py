"""
Token Management Utilities for CityCatalyst Integration

This module provides utilities for handling JWT tokens securely:
- Token expiry validation
- Safe redaction for logging
- Token metadata extraction
- Context storage patterns
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def redact_token(token: Optional[str], length: int = 10) -> str:
    """Redact sensitive token, showing only first and last N characters.
    
    Args:
        token: The token to redact (JWT or bearer token)
        length: Number of characters to show at start and end
    
    Returns:
        Redacted token string (e.g., "eyJhbGc...Q2NXO" for JWT)
    """
    if not token:
        return "[NO_TOKEN]"
    
    if len(token) <= length * 2 + 4:
        return "[REDACTED]"
    
    return f"{token[:length]}...{token[-length:]}"


def parse_jwt_claims(token: str) -> Dict[str, Any] | None:
    """Safely parse JWT claims without validation.
    
    This extracts and decodes the payload portion of a JWT for inspection.
    WARNING: This does NOT verify the signature or expiry - use for local checks only.
    
    Args:
        token: JWT token to parse
    
    Returns:
        Dictionary of JWT claims or None if parsing fails
    """
    if not token or not isinstance(token, str):
        return None
    
    try:
        # JWT format: header.payload.signature
        parts = token.split(".")
        if len(parts) != 3:
            logger.debug("Invalid JWT format - expected 3 parts")
            return None
        
        # Decode payload (add padding if needed)
        payload = parts[1]
        # Add padding to make it valid base64
        padding = 4 - (len(payload) % 4)
        if padding != 4:
            payload += "=" * padding
        
        import base64
        decoded = base64.urlsafe_b64decode(payload)
        claims = json.loads(decoded)
        return claims
    except Exception as e:
        logger.debug("Failed to parse JWT claims: %s", e)
        return None


def is_token_expired(token: str, buffer_seconds: int = 60) -> bool:
    """Check if JWT token is expired or about to expire.
    
    Args:
        token: JWT token to check
        buffer_seconds: Refresh token N seconds before actual expiry (default 60)
    
    Returns:
        True if token is expired or expiring soon, False otherwise
    """
    claims = parse_jwt_claims(token)
    if not claims or "exp" not in claims:
        logger.warning("Token has no expiry claim")
        return True
    
    exp_timestamp = claims.get("exp")
    if not isinstance(exp_timestamp, (int, float)):
        logger.warning("Invalid expiry timestamp in token")
        return True
    
    now = datetime.now(timezone.utc).timestamp()
    expires_at = datetime.fromtimestamp(exp_timestamp, tz=timezone.utc)
    buffer = now + buffer_seconds
    
    if now > exp_timestamp:
        logger.debug("Token is expired (exp=%s, now=%s)", expires_at, datetime.now(timezone.utc))
        return True
    
    if buffer > exp_timestamp:
        logger.debug("Token is expiring soon (exp=%s, buffer=%s)", expires_at, buffer)
        return True
    
    return False


def get_token_expiry(token: str) -> datetime | None:
    """Extract token expiry timestamp.
    
    Args:
        token: JWT token
    
    Returns:
        Datetime of token expiry or None if not found
    """
    claims = parse_jwt_claims(token)
    if not claims or "exp" not in claims:
        return None
    
    try:
        exp_timestamp = claims.get("exp")
        return datetime.fromtimestamp(exp_timestamp, tz=timezone.utc)
    except Exception as e:
        logger.debug("Failed to parse expiry: %s", e)
        return None


def get_token_subject(token: str) -> str | None:
    """Extract token subject (typically user_id).
    
    Args:
        token: JWT token
    
    Returns:
        Subject claim or None if not found
    """
    claims = parse_jwt_claims(token)
    return claims.get("sub") if claims else None


def create_token_context(
    access_token: str,
    issued_at: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Create a thread context dictionary for storing token with metadata.
    
    Args:
        access_token: The JWT token from CityCatalyst
        issued_at: When the token was issued (optional, defaults to now)
    
    Returns:
        Dictionary suitable for storing in thread.context
    """
    context = {
        "access_token": access_token,
    }
    
    # Calculate when token expires
    expires_at = get_token_expiry(access_token)
    if expires_at:
        context["expires_at"] = expires_at.isoformat()
    
    # Record when we got this token
    if issued_at:
        context["issued_at"] = issued_at.isoformat()
    else:
        context["issued_at"] = datetime.now(timezone.utc).isoformat()
    
    return context


class LogSafeFormatter:
    """Utility to format log messages while redacting tokens."""
    
    # Pattern to match bearer tokens and JWTs in strings
    TOKEN_PATTERN = re.compile(
        r'(Bearer\s+|Authorization:\s*)["\']?([A-Za-z0-9\-._~+/]+=*)["\']?',
        re.IGNORECASE
    )
    
    @staticmethod
    def redact_tokens(message: str) -> str:
        """Redact tokens from log message.
        
        Args:
            message: Message that may contain tokens
        
        Returns:
            Message with tokens redacted
        """
        if not message:
            return message
        
        def replacer(match):
            prefix = match.group(1)
            token = match.group(2)
            redacted = redact_token(token)
            return f"{prefix}{redacted}"
        
        return LogSafeFormatter.TOKEN_PATTERN.sub(replacer, message)
