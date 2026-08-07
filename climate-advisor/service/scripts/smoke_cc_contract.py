"""
Brief: Smoke-test the deployed Climate Advisor-to-CityCatalyst auth contract.

Inputs:
- CLI args: optional user, city, inventory, expected audience, and expected
  capability identifiers override their environment-backed defaults.
- Files/paths: none.
- Env vars: `CC_BASE_URL` and `CC_API_KEY` configure CityCatalyst access;
  `CA_SMOKE_USER_ID`, `CA_SMOKE_CITY_ID`, and `CA_SMOKE_INVENTORY_ID` provide
  optional scope defaults.

Outputs:
- Logs pass/fail details and exits non-zero when token or capability checks fail.

Usage (from project root or deployed service container):
- uv run --directory service python -m scripts.smoke_cc_contract
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
from typing import Any

from app.services.citycatalyst_client import (
    CityCatalystClient,
    CityCatalystClientError,
    TokenRefreshError,
)
from app.utils.logging_config import configure_logging
from app.utils.token_manager import parse_jwt_claims

logger = logging.getLogger("smoke_cc_contract")

DEFAULT_EXPECTED_CAPABILITY = "ghgi.stationary_energy.load_context"
EXPECTED_ISSUER = "climate-advisor-service"
DEFAULT_SMOKE_USER_ID = "11111111-1111-4111-8111-111111111111"
DEFAULT_SMOKE_CITY_ID = "22222222-2222-4222-8222-222222222222"
DEFAULT_SMOKE_INVENTORY_ID = "33333333-3333-4333-8333-333333333333"


def _env_or_arg(value: str | None, env_name: str, default: str | None = None) -> str:
    """Resolve a required value from a CLI argument, environment, or default."""
    resolved = value or os.environ.get(env_name) or default
    if not resolved:
        raise ValueError(f"{env_name} is required")
    return resolved


def _audience_matches(audience: Any, expected: str | None) -> bool:
    """Return whether a scalar or list JWT audience contains the expected value."""
    if not expected:
        return True
    normalized_expected = expected.rstrip("/")
    if isinstance(audience, str):
        return audience.rstrip("/") == normalized_expected
    if isinstance(audience, list):
        return any(
            isinstance(value, str) and value.rstrip("/") == normalized_expected
            for value in audience
        )
    return False


async def run_smoke(args: argparse.Namespace) -> int:
    """Run the CC token exchange and capability smoke."""
    # Resolve the complete test scope before minting credentials or calling capabilities.
    try:
        user_id = _env_or_arg(
            args.user_id,
            "CA_SMOKE_USER_ID",
            DEFAULT_SMOKE_USER_ID,
        )
        city_id = _env_or_arg(
            args.city_id,
            "CA_SMOKE_CITY_ID",
            DEFAULT_SMOKE_CITY_ID,
        )
        inventory_id = _env_or_arg(
            args.inventory_id,
            "CA_SMOKE_INVENTORY_ID",
            DEFAULT_SMOKE_INVENTORY_ID,
        )
    except ValueError as exc:
        logger.error("%s", exc)
        return 2

    expected_capability = args.expected_capability or DEFAULT_EXPECTED_CAPABILITY

    try:
        async with CityCatalystClient() as client:
            token, expires_in = await client.refresh_token(user_id)
            claims = parse_jwt_claims(token)
            if not isinstance(claims, dict):
                logger.error("Token refresh returned an unparsable JWT")
                return 1
            if claims.get("sub") != user_id:
                logger.error("Token subject does not match smoke user")
                return 1
            if claims.get("iss") != EXPECTED_ISSUER:
                logger.error("Token issuer mismatch: %s", claims.get("iss"))
                return 1

            expected_audience = args.expected_audience or client.base_url
            if not _audience_matches(claims.get("aud"), expected_audience):
                logger.error(
                    "Token audience mismatch: aud=%s expected=%s",
                    claims.get("aud"),
                    expected_audience,
                )
                return 1

            capabilities = await client.get_stationary_energy_allowed_capabilities(
                user_id=user_id,
                city_id=city_id,
                inventory_id=inventory_id,
                workflow_step="draft",
                token=token,
            )
    except TokenRefreshError as exc:
        logger.error("Token refresh smoke failed: %s", exc)
        return 1
    except CityCatalystClientError as exc:
        logger.error("Capability smoke failed: %s", exc)
        return 1

    if expected_capability not in capabilities:
        logger.error(
            "Expected capability %s not returned; got %s",
            expected_capability,
            sorted(capabilities),
        )
        return 1

    logger.info(
        "CA to CC auth smoke passed for user=%s city=%s inventory=%s expires_in=%s",
        user_id,
        city_id,
        inventory_id,
        expires_in,
    )
    return 0


def parse_args() -> argparse.Namespace:
    """Parse smoke-test scope and expected contract values."""
    # Expose explicit overrides while retaining stable local smoke defaults.
    parser = argparse.ArgumentParser(
        description="Smoke-test the deployed CA to CC auth contract.",
    )
    parser.add_argument("--user-id", help="Smoke user ID. Defaults to CA_SMOKE_USER_ID.")
    parser.add_argument("--city-id", help="Smoke city ID. Defaults to CA_SMOKE_CITY_ID.")
    parser.add_argument(
        "--inventory-id",
        help="Smoke inventory ID. Defaults to CA_SMOKE_INVENTORY_ID.",
    )
    parser.add_argument(
        "--expected-audience",
        help="Expected JWT audience. Defaults to CC_BASE_URL.",
    )
    parser.add_argument(
        "--expected-capability",
        default=DEFAULT_EXPECTED_CAPABILITY,
        help="Capability that must be present in the CC response.",
    )
    return parser.parse_args()


def main() -> None:
    """Run the deployed CityCatalyst authentication smoke test."""
    configure_logging(format_string="%(levelname)s:%(name)s:%(message)s")
    args = parse_args()
    raise SystemExit(asyncio.run(run_smoke(args)))


if __name__ == "__main__":
    main()
