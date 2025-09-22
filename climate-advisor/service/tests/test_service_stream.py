#!/usr/bin/env python3
"""
Climate Advisor Service Streaming Test Utility

This script tests the streaming functionality of the Climate Advisor service by sending
a test message and printing the server-sent events (SSE) response to stdout.
It is primarily used for development and debugging purposes.

Inputs:
    base_url: Optional base URL of the Climate Advisor service (default: http://localhost:8080)
    sys.argv[1]: Optional base URL override

Outputs:
    Prints raw SSE events to stdout as they are received from the service
    Each event shows the streaming response chunks and terminal events

Usage:
    python scripts/test_service_stream.py [base_url]

    # Test against local service
    python scripts/test_service_stream.py

    # Test against remote service
    python scripts/test_service_stream.py https://api.example.com

    # Test against specific port
    python scripts/test_service_stream.py http://localhost:8080

Note:
    This script requires the Climate Advisor service to be running and accessible.
    It sends a test message with temperature parameter and streams the response.
    The output shows the raw SSE format which can be used for debugging streaming issues.
"""


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

