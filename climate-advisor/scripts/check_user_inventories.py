from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
SERVICE_ROOT = REPO_ROOT / "service"
for extra_path in (REPO_ROOT, SERVICE_ROOT):
    path_str = str(extra_path)
    if path_str not in sys.path:
        sys.path.insert(0, path_str)

from app.services.citycatalyst_client import CityCatalystClient, CityCatalystClientError


logger = logging.getLogger("check_user_inventories")


async def fetch_user_inventories(user_id: str) -> None:
    async with CityCatalystClient() as client:
        # Refresh token for the supplied user so we can call the inventories endpoint.
        token, expires_in = await client.refresh_token(user_id)
        logger.info("Obtained token for user %s (expires_in=%s)", user_id, expires_in)

        try:
            payload: dict[str, Any] = await client.get_user_inventories(
                token=token,
                user_id=user_id,
            )
        except CityCatalystClientError as exc:
            logger.error("Inventory lookup failed: %s", exc)
            raise

    print(json.dumps(payload, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch CityCatalyst user inventories via the service client.",
    )
    parser.add_argument(
        "--user-id",
        default="3e9c2695-ba01-470c-ae66-b564b6b36996",
        help="User ID to refresh a token for (defaults to the admin playground user).",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)
    asyncio.run(fetch_user_inventories(args.user_id))


if __name__ == "__main__":
    main()
