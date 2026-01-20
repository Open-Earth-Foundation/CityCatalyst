"""
Mint a CityCatalyst JWT token for CA E2E runs and optionally write it to .env.

Usage (from climate-advisor, with venv activated):
  python scripts/mint_ca_e2e_token.py --user-id <user_id>

Optional flags:
  --env-path   Path to the .env file to update (default: climate-advisor/.env)
  --env-key    Env var key to set (default: CA_E2E_CC_TOKEN)
  --print-token Print the token to stdout (disabled by default)
  --skip-write  Do not update the .env file

Required environment:
  CC_BASE_URL, CC_API_KEY
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path
from typing import Optional

REPO_ROOT = Path(__file__).resolve().parents[1]
SERVICE_ROOT = REPO_ROOT / "service"
for extra_path in (REPO_ROOT, SERVICE_ROOT):
    path_str = str(extra_path)
    if path_str not in sys.path:
        sys.path.insert(0, path_str)

from app.services.citycatalyst_client import CityCatalystClient, TokenRefreshError
from app.utils.token_manager import redact_token

logger = logging.getLogger("mint_ca_e2e_token")


def _update_env_value(env_path: Path, key: str, value: str) -> None:
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
    async with CityCatalystClient() as client:
        token, expires_in = await client.refresh_token(user_id)
    return token, expires_in


def main() -> None:
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
        default=str(REPO_ROOT / ".env"),
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
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)
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
