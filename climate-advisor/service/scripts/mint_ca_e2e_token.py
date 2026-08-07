"""
Brief: Mint a CityCatalyst JWT for Climate Advisor E2E runs.

Inputs:
- CLI args: `--user-id` is required; `--env-path` and `--env-key` select the
  destination; `--skip-write` avoids file changes; `--print-token` explicitly
  opts into printing the secret token.
- Files/paths: optionally updates the selected `.env`-format file.
- Env vars: `CC_BASE_URL` and `CC_API_KEY` authorize token creation.

Outputs:
- Logs redacted token metadata and optionally updates one environment variable
  or prints the token to stdout.

Usage (from project root):
- uv run --directory service python -m scripts.mint_ca_e2e_token --user-id <user_id>
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from pathlib import Path

from app.services.citycatalyst_client import CityCatalystClient, TokenRefreshError
from app.utils.logging_config import configure_logging
from app.utils.token_manager import redact_token

logger = logging.getLogger("mint_ca_e2e_token")


def _update_env_value(env_path: Path, key: str, value: str) -> None:
    """Set one environment-file value while preserving unrelated entries."""
    lines: list[str] = []
    if env_path.exists():
        lines = env_path.read_text(encoding="utf-8").splitlines()

    updated = False
    new_lines: list[str] = []
    for line in lines:
        if line.startswith(f"{key}="):
            new_lines.append(f"{key}={value}")
            updated = True
        else:
            new_lines.append(line)

    if not updated:
        new_lines.append(f"{key}={value}")

    env_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


async def _mint_token(user_id: str) -> tuple[str, int]:
    """Mint and return a CityCatalyst token and its lifetime."""
    async with CityCatalystClient() as client:
        token, expires_in = await client.refresh_token(user_id)
    return token, expires_in


def parse_args() -> argparse.Namespace:
    """Parse the user scope and token output options."""
    # Separate token destination controls from the required CityCatalyst user scope.
    parser = argparse.ArgumentParser(
        description="Mint a CityCatalyst user token and store it for CA E2E tests.",
    )
    parser.add_argument(
        "--user-id",
        required=True,
        help="CityCatalyst user ID to scope the token.",
    )
    parser.add_argument(
        "--env-path",
        default=str(Path(__file__).resolve().parent.parent.parent / ".env"),
        help="Path to climate-advisor .env file.",
    )
    parser.add_argument(
        "--env-key",
        default="CA_E2E_CC_TOKEN",
        help="Env var key to update with the minted token.",
    )
    parser.add_argument(
        "--print-token",
        action="store_true",
        help="Print the minted token to stdout (disabled by default).",
    )
    parser.add_argument(
        "--skip-write",
        action="store_true",
        help="Do not update the .env file.",
    )
    return parser.parse_args()


def main() -> None:
    """Mint a scoped CityCatalyst token and optionally persist or print it."""
    # Configure logging before any token request or filesystem write.
    args = parse_args()

    configure_logging()
    env_path = Path(args.env_path)

    try:
        token, expires_in = asyncio.run(_mint_token(args.user_id))
    except TokenRefreshError as exc:
        logger.error("Token refresh failed: %s", exc)
        raise SystemExit(1) from exc

    logger.info(
        "Minted token for user=%s (expires_in=%s, token=%s)",
        args.user_id,
        expires_in,
        redact_token(token),
    )

    if not args.skip_write:
        _update_env_value(env_path, args.env_key, token)
        logger.info("Updated %s with %s", env_path, args.env_key)

    if args.print_token:
        print(token)


if __name__ == "__main__":
    main()
