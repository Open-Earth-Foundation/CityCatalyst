"""
Run the Stationary Energy draft flow against CA using a mock CC capability server.

Usage (from climate-advisor/):
  uv run --directory service python -m tests.run_stationary_energy_mock_flow

This starts a local mock CC server that serves:
  POST /api/v1/internal/ca/capabilities/allowed-capabilities
  POST /api/v1/internal/ca/capabilities/ghgi/stationary-energy/load-context

Then it calls CA's real FastAPI route handlers with an in-memory SQLite database.
The output JSON contains the start/status/review responses and the requests that
CA sent to the mock CC server.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
from pathlib import Path
from typing import AsyncIterator

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from tests.mock_cc_stationary_energy_server import start_mock_cc_server


DEFAULT_FIXTURE = Path(__file__).parent / "fixtures" / "stationary_energy_load_context_mock.json"
DEFAULT_OUTPUT = Path(__file__).parent / "output" / "stationary_energy_mock_flow.json"


def _unsigned_jwt(user_id: str) -> str:
    def encode_json(payload: dict) -> str:
        raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

    return (
        f"{encode_json({'alg': 'none', 'typ': 'JWT'})}."
        f"{encode_json({'sub': user_id, 'exp': 4102444800})}."
        "signature"
    )


def _load_fixture(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError("Fixture must be a JSON object")
    return payload


async def _create_session_factory() -> tuple:
    from app.db import Base
    import app.models.db  # noqa: F401

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
        engine,
        expire_on_commit=False,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return engine, session_factory


async def _dispose_engine(engine) -> None:
    from app.db import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


def _build_review_decisions(status_payload: dict) -> list[dict]:
    decisions: list[dict] = []
    for proposal in status_payload.get("proposals") or []:
        proposal_id = proposal.get("proposal_id")
        if not proposal_id:
            continue
        if proposal.get("recommended_candidate_id"):
            decisions.append({"proposal_id": proposal_id, "action": "accept"})
        else:
            decisions.append({"proposal_id": proposal_id, "action": "leave_draft"})
    return decisions


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for the mock Stationary Energy flow runner."""
    parser = argparse.ArgumentParser(
        description="Run CA Stationary Energy endpoints with mock CC load_context data.",
    )
    parser.add_argument("--fixture", default=str(DEFAULT_FIXTURE))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--user-id", default="mock-user")
    parser.add_argument("--locale", default="en")
    return parser.parse_args()


def main() -> int:
    """Run the mock Stationary Energy flow and persist a JSON summary."""
    parser = argparse.ArgumentParser(
        description="Run CA Stationary Energy endpoints with mock CC load_context data.",
    )
    args = parse_args()

    fixture_path = Path(args.fixture)
    output_path = Path(args.output)
    fixture = _load_fixture(fixture_path)

    city_id = fixture["city"]["city_id"]
    inventory_id = fixture["inventory"]["inventory_id"]

    server, base_url = start_mock_cc_server(fixture_path)
    old_env = {
        key: os.environ.get(key)
        for key in ("CA_FEATURE_FLAGS", "CC_BASE_URL", "CC_API_KEY")
    }
    os.environ["CA_FEATURE_FLAGS"] = "STATIONARY_ENERGY_AGENTIC"
    os.environ["CC_BASE_URL"] = base_url
    os.environ["CC_API_KEY"] = "mock-cc-api-key"

    engine = None
    try:
        engine, session_factory = asyncio.run(_create_session_factory())
        from app.db.session import get_session
        from app.main import get_app

        app = get_app()

        async def get_test_session() -> AsyncIterator[AsyncSession]:
            async with session_factory() as session:
                yield session

        app.dependency_overrides[get_session] = get_test_session
        client = TestClient(app)

        access_token = _unsigned_jwt(args.user_id)
        auth_headers = {"Authorization": f"Bearer {access_token}"}
        start_request = {
            "user_id": args.user_id,
            "city_id": city_id,
            "inventory_id": inventory_id,
            "locale": args.locale,
            "context": {"access_token": access_token},
        }
        start_response = client.post(
            "/v1/stationary-energy-drafts/start",
            json=start_request,
        )
        start_payload = start_response.json()

        draft_run_id = start_payload.get("draft_run_id")
        status_payload = None
        review_payload = None

        if draft_run_id:
            status_response = client.get(
                f"/v1/stationary-energy-drafts/{draft_run_id}",
                params={"user_id": args.user_id},
                headers=auth_headers,
            )
            status_payload = status_response.json()

            decisions = _build_review_decisions(status_payload)
            if decisions:
                review_response = client.post(
                    f"/v1/stationary-energy-drafts/{draft_run_id}/review",
                    json={"user_id": args.user_id, "decisions": decisions},
                    headers=auth_headers,
                )
                review_payload = review_response.json()
            else:
                review_response = None
        else:
            status_response = None
            review_response = None

        output = {
            "mock_cc_base_url": base_url,
            "fixture": str(fixture_path),
            "start": {
                "status_code": start_response.status_code,
                "request": start_request,
                "response": start_payload,
            },
            "status": {
                "status_code": status_response.status_code if status_response else None,
                "response": status_payload,
            },
            "review": {
                "status_code": review_response.status_code if review_response else None,
                "response": review_payload,
            },
            "mock_cc_requests": server.requests_seen,
        }

        output_path.parent.mkdir(parents=True, exist_ok=True)
        with output_path.open("w", encoding="utf-8") as handle:
            json.dump(output, handle, indent=2, ensure_ascii=True)

        print(f"Wrote mock flow output to {output_path}")
        print(f"Start status: {start_response.status_code}")
        if status_payload:
            print(f"Draft run: {status_payload.get('draft_run_id')}")
            print(f"Proposals: {len(status_payload.get('proposals') or [])}")
            print(f"Source candidates: {len(status_payload.get('source_candidates') or [])}")
        if review_response:
            print(f"Review status: {review_response.status_code}")
        return 0 if start_response.is_success else 1
    finally:
        server.shutdown()
        server.server_close()
        if engine is not None:
            asyncio.run(_dispose_engine(engine))
        for key, value in old_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


if __name__ == "__main__":
    raise SystemExit(main())
