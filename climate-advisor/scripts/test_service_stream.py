#!/usr/bin/env python3
import asyncio
import json
import sys
from typing import Optional

import httpx


async def main(base_url: str = "http://localhost:8080") -> None:
    url = f"{base_url.rstrip('/')}/v1/messages"
    payload = {
        "user_id": "test_user",
        "content": "Say hello from OpenRouter with a short sentence.",
        "options": {"temperature": 0.2},
    }

    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", url, json=payload, headers={"Content-Type": "application/json"}) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                print(line)


if __name__ == "__main__":
    base = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
    asyncio.run(main(base))

