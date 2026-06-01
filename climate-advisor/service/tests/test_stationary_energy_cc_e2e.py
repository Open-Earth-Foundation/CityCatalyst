from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[2]
for extra_path in (PROJECT_ROOT, PROJECT_ROOT / "service"):
    path_str = str(extra_path)
    if path_str not in sys.path:
        sys.path.insert(0, path_str)

pytest.importorskip("pgvector.sqlalchemy")

from app.main import get_app
from app.utils.token_manager import is_token_expired


OUTPUT_PATH = Path(__file__).parent / "output" / "stationary_energy_cc_e2e.json"


def _required_env() -> dict[str, str]:
    required = [
        "CA_DATABASE_URL",
        "CC_BASE_URL",
        "CC_API_KEY",
        "OPENROUTER_API_KEY",
        "OPENAI_API_KEY",
        "CA_E2E_CC_TOKEN",
        "CA_E2E_USER_ID",
        "CA_E2E_CITY_ID",
        "CA_E2E_INVENTORY_ID",
    ]
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        pytest.skip(
            "Missing required env for manual Stationary Energy E2E: "
            + ", ".join(sorted(missing))
        )

    token = os.environ["CA_E2E_CC_TOKEN"]
    if is_token_expired(token):
        pytest.skip("CA_E2E_CC_TOKEN is expired; refresh it before running manual_llm E2E.")

    return {
        key: os.environ[key]
        for key in required
    } | {
        "CA_E2E_LOCALE": os.getenv("CA_E2E_LOCALE", "en"),
    }


def _parse_sse_events(raw_text: str) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    event_type: str | None = None
    event_id: str | None = None
    data_lines: list[str] = []

    def flush_event() -> None:
        nonlocal event_type, event_id, data_lines
        if event_type is None and not data_lines:
            return
        data_text = "\n".join(data_lines)
        try:
            data: Any = json.loads(data_text) if data_text else {}
        except json.JSONDecodeError:
            data = data_text
        events.append({"event": event_type or "message", "id": event_id, "data": data})
        event_type = None
        event_id = None
        data_lines = []

    for line in raw_text.splitlines():
        if line == "":
            flush_event()
            continue
        if line.startswith("event:"):
            event_type = line[len("event:") :].strip()
            continue
        if line.startswith("id:"):
            event_id = line[len("id:") :].strip()
            continue
        if line.startswith("data:"):
            data_lines.append(line[len("data:") :].lstrip())
    flush_event()
    return events


def _collect_assistant_text(events: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for event in events:
        if event.get("event") != "message":
            continue
        data = event.get("data")
        if isinstance(data, dict) and data.get("content"):
            parts.append(str(data["content"]))
    return "".join(parts)


def _done_payload(events: list[dict[str, Any]]) -> dict[str, Any] | None:
    for event in events:
        if event.get("event") == "done" and isinstance(event.get("data"), dict):
            return event["data"]
    return None


def _cc_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _write_artifact(payload: dict[str, Any]) -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False, default=str),
        encoding="utf-8",
    )


@pytest.mark.e2e
@pytest.mark.manual_llm
@pytest.mark.slow
def test_stationary_energy_cc_manual_llm_e2e() -> None:
    env = _required_env()
    token = env["CA_E2E_CC_TOKEN"]
    user_id = env["CA_E2E_USER_ID"]
    city_id = env["CA_E2E_CITY_ID"]
    inventory_id = env["CA_E2E_INVENTORY_ID"]
    locale = env["CA_E2E_LOCALE"]

    app = get_app()
    artifact: dict[str, Any] = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "city_id": city_id,
        "inventory_id": inventory_id,
        "locale": locale,
    }

    with TestClient(app) as client, httpx.Client(
        base_url=env["CC_BASE_URL"].rstrip("/"),
        headers=_cc_headers(token),
        timeout=120.0,
        follow_redirects=True,
    ) as cc_client:
        version_history_before = cc_client.get(
            f"/api/v1/inventory/{inventory_id}/version-history",
            params={"module": "ghgi"},
        )
        version_history_before.raise_for_status()
        version_count_before = len(version_history_before.json().get("data") or [])
        artifact["version_history_before"] = version_count_before

        thread_response = client.post(
            "/v1/threads",
            json={
                "user_id": user_id,
                "inventory_id": inventory_id,
                "context": {"access_token": token},
            },
        )
        assert thread_response.status_code == 201, thread_response.text
        thread_id = thread_response.json()["thread_id"]
        artifact["thread_id"] = thread_id

        start_response = client.post(
            "/v1/stationary-energy-drafts/start",
            json={
                "user_id": user_id,
                "city_id": city_id,
                "inventory_id": inventory_id,
                "thread_id": thread_id,
                "locale": locale,
                "context": {"access_token": token},
            },
        )
        assert start_response.status_code == 201, start_response.text
        start_data = start_response.json()
        artifact["start_response"] = start_data

        assert start_data["status"] == "ready"
        assert start_data["proposals"], "Live draft returned no proposals"
        assert start_data.get("llm_trace"), "Live draft did not return llm_trace"
        assert start_data["llm_trace"].get("model")
        assert start_data["llm_trace"]["model"] != "mock-llm"

        accepted_proposals = [
            proposal
            for proposal in start_data["proposals"]
            if proposal.get("recommended_candidate_id")
        ]
        if not accepted_proposals:
            pytest.skip(
                "Live draft produced no source-backed proposals; choose a different "
                "CA_E2E_INVENTORY_ID for save coverage."
            )

        message_response = client.post(
            "/v1/messages",
            json={
                "user_id": user_id,
                "thread_id": thread_id,
                "inventory_id": inventory_id,
                "content": (
                    "For this Stationary Energy draft, explain what the relevant scope means "
                    "and why the recommended source is a good fit."
                ),
            },
        )
        assert message_response.status_code == 200, message_response.text
        message_events = _parse_sse_events(message_response.text)
        assistant_text = _collect_assistant_text(message_events)
        done_payload = _done_payload(message_events)
        artifact["message_done"] = done_payload
        artifact["message_preview"] = assistant_text[:2000]

        assert assistant_text.strip(), "Follow-up Q&A returned empty assistant text"
        lowered = assistant_text.lower()
        assert any(
            keyword in lowered
            for keyword in ("scope", "source", "stationary energy", "subsector", "city")
        ), assistant_text

        decisions: list[dict[str, Any]] = []
        for proposal in start_data["proposals"]:
            if proposal.get("recommended_candidate_id"):
                decisions.append(
                    {
                        "proposal_id": proposal["proposal_id"],
                        "action": "accept",
                    }
                )
            else:
                decisions.append(
                    {
                        "proposal_id": proposal["proposal_id"],
                        "action": "leave_draft",
                    }
                )

        review_response = client.post(
            f"/v1/stationary-energy-drafts/{start_data['draft_run_id']}/review",
            json={"user_id": user_id, "decisions": decisions},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert review_response.status_code == 200, review_response.text
        review_data = review_response.json()
        artifact["review_response"] = review_data
        assert review_data["status"] == "reviewed"

        save_response = client.post(
            f"/v1/stationary-energy-drafts/{start_data['draft_run_id']}/save",
            json={"user_id": user_id},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert save_response.status_code == 200, save_response.text
        save_data = save_response.json()
        artifact["save_response"] = save_data
        assert save_data["status"] in {"saved", "partially_saved"}

        committed_decisions = [
            decision
            for decision in save_data["decisions"]
            if decision.get("commit_status") == "committed"
        ]
        assert committed_decisions, "Save flow did not commit any reviewed decisions"

        version_history_after = cc_client.get(
            f"/api/v1/inventory/{inventory_id}/version-history",
            params={"module": "ghgi"},
        )
        version_history_after.raise_for_status()
        version_history_after_json = version_history_after.json()
        version_count_after = len(version_history_after_json.get("data") or [])
        artifact["version_history_after"] = version_count_after
        assert version_count_after > version_count_before

        stationary_energy_results = cc_client.get(
            f"/api/v1/inventory/{inventory_id}/results/stationary-energy",
        )
        stationary_energy_results.raise_for_status()
        artifact["stationary_energy_results_preview"] = stationary_energy_results.json()
        assert stationary_energy_results.json().get("data") is not None

    artifact["finished_at"] = datetime.now(timezone.utc).isoformat()
    _write_artifact(artifact)
