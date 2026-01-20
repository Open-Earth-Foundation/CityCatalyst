"""
Run Climate Advisor E2E prompt flow without pytest and save results to disk.

Usage (from climate-advisor, with venv activated):
  python service/tests/run_ca_e2e.py

Optional flags:
  --prompts     Path to the JSON prompt file (default: service/tests/fixtures/ca_e2e_prompts.json)
  --output      Path to the output JSON (default: service/tests/output/ca_e2e_responses.json)
  --retries     Retries per prompt for transient provider errors (default: 2)
  --retry-delay Delay between retries in seconds (default: 1.5)
  --include-events Include raw SSE events in the output JSON (default: false)

Required environment:
  CA_DATABASE_URL, OPENROUTER_API_KEY, OPENAI_API_KEY, CC_BASE_URL, CA_E2E_CC_TOKEN

Getting a user_id and JWT token for CA_E2E_CC_TOKEN:
  1) Find the user_id (pick one option):
     - From CC DB (local Docker Postgres):
       psql -h localhost -U citycatalyst -d citycatalyst \
         -c "SELECT user_id, email, name FROM \"User\" ORDER BY created DESC LIMIT 20;"
       OR using docker exec:
       docker exec citycatalyst-postgres psql -U citycatalyst -d citycatalyst \
         -c "SELECT user_id, email, name FROM \"User\" ORDER BY created DESC LIMIT 20;"
     - From the app helper script (requires node):
       npx tsx app/scripts/print-user-id.ts --email <email>
  2) Mint a non-expired JWT token and save it to climate-advisor/.env:
       python scripts/mint_ca_e2e_token.py --user-id <user_id>
     This requires CC_BASE_URL and CC_API_KEY in climate-advisor/.env.
  3) Confirm CA_E2E_CC_TOKEN is set before running this script.
  4) (Optional) Run automatic verification on the output:
       python service/tests/review_ca_e2e.py --input service/tests/output/ca_e2e_responses.json
     This writes service/tests/output/responses_eval.json by default.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[2]
for extra_path in (PROJECT_ROOT, PROJECT_ROOT / "service"):
    path_str = str(extra_path)
    if path_str not in sys.path:
        sys.path.insert(0, path_str)

try:
    from pgvector import sqlalchemy as _pgvector_sqlalchemy  # noqa: F401
except ModuleNotFoundError:
    print("pgvector is required for CA E2E runs.", file=sys.stderr)
    sys.exit(1)

from app.main import get_app
from app.utils.token_manager import is_token_expired, redact_token

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "ca_e2e_prompts.json"
DEFAULT_OUTPUT_PATH = Path(__file__).parent / "output" / "ca_e2e_responses.json"

ENV_PATTERN = re.compile(r"\$\{([A-Z0-9_]+)\}")
VAR_PATTERN = re.compile(r"\{\{([a-zA-Z0-9_]+)\}\}")


def _load_prompt_data(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError("Prompt JSON must be an object at the top level.")
    return payload


def _resolve_string(value: str, variables: Dict[str, Any]) -> str:
    def env_replace(match: re.Match[str]) -> str:
        key = match.group(1)
        env_value = os.getenv(key)
        if not env_value:
            raise RuntimeError(f"Missing environment variable for placeholder: {key}")
        return env_value

    def var_replace(match: re.Match[str]) -> str:
        key = match.group(1)
        if key not in variables or variables[key] in {None, ""}:
            raise RuntimeError(f"Missing runtime variable for placeholder: {key}")
        return str(variables[key])

    resolved = ENV_PATTERN.sub(env_replace, value)
    return VAR_PATTERN.sub(var_replace, resolved)


def _render_payload(value: Any, variables: Dict[str, Any]) -> Any:
    if isinstance(value, dict):
        return {key: _render_payload(val, variables) for key, val in value.items()}
    if isinstance(value, list):
        return [_render_payload(item, variables) for item in value]
    if isinstance(value, str):
        return _resolve_string(value, variables)
    return value


def _parse_sse_events(raw_text: str) -> List[Dict[str, Any]]:
    events: List[Dict[str, Any]] = []
    event_type: Optional[str] = None
    event_id: Optional[str] = None
    data_lines: List[str] = []

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
            continue
    flush_event()
    return events


def _collect_assistant_text(events: List[Dict[str, Any]]) -> str:
    parts: List[str] = []
    for event in events:
        if event.get("event") != "message":
            continue
        data = event.get("data")
        if isinstance(data, dict):
            content = data.get("content")
            if content:
                parts.append(content)
    return "".join(parts)


def _get_done_payload(events: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    for event in events:
        if event.get("event") == "done" and isinstance(event.get("data"), dict):
            return event["data"]
    return None


def _collect_error_messages(events: List[Dict[str, Any]]) -> List[str]:
    messages: List[str] = []
    for event in events:
        if event.get("event") != "error":
            continue
        data = event.get("data")
        if isinstance(data, dict):
            message = data.get("message") or data.get("error") or json.dumps(data)
        else:
            message = str(data)
        if message:
            messages.append(message)
    return messages


def _is_retryable_error(messages: List[str]) -> bool:
    retry_markers = (
        "Internal server error",
        "server error",
        "temporarily unavailable",
        "rate limit",
        "timeout",
        "overloaded",
    )
    for message in messages:
        lower = message.lower()
        for marker in retry_markers:
            if marker.lower() in lower:
                return True
    return False


def _find_tool_invocation(tools_used: List[Dict[str, Any]], name: str) -> Optional[Dict[str, Any]]:
    for tool in tools_used:
        if tool.get("name") == name:
            return tool
    return None


def _extract_inventory_meta(tools_used: List[Dict[str, Any]]) -> Dict[str, str]:
    for tool_name in ("city_inventory_search", "get_user_inventories"):
        tool = _find_tool_invocation(tools_used, tool_name)
        if not tool:
            continue

        payload = tool.get("result_json")
        if not isinstance(payload, dict):
            continue

        data = payload.get("data")
        if isinstance(data, dict):
            inventory_list = data.get("data")
        else:
            inventory_list = data

        if not isinstance(inventory_list, list):
            continue

        for inventory in inventory_list:
            if not isinstance(inventory, dict):
                continue
            inventory_id = inventory.get("inventoryId") or inventory.get("id")
            city_name = None
            city = inventory.get("city")
            if isinstance(city, dict):
                city_name = city.get("name")
            meta: Dict[str, str] = {}
            if inventory_id:
                meta["inventory_id"] = inventory_id
            if city_name:
                meta["city_name"] = city_name
            if meta:
                return meta
    return {}


def _redact_payload(value: Any) -> Any:
    if isinstance(value, dict):
        redacted: Dict[str, Any] = {}
        for key, val in value.items():
            if key in {"cc_access_token", "access_token"} and isinstance(val, str):
                redacted[key] = redact_token(val)
            else:
                redacted[key] = _redact_payload(val)
        return redacted
    if isinstance(value, list):
        return [_redact_payload(item) for item in value]
    return value


def _env_override(name: str) -> Optional[str]:
    value = os.getenv(name)
    if not value:
        return None
    if value.startswith("REPLACE_") or value.startswith("REPLACE_WITH_"):
        return None
    return value


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run CA E2E prompts and save responses.",
    )
    parser.add_argument(
        "--prompts",
        default=os.getenv("CA_E2E_PROMPTS_PATH", str(FIXTURE_PATH)),
        help="Path to prompt JSON file.",
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT_PATH),
        help="Output JSON path.",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=int(os.getenv("CA_E2E_RETRIES", "2")),
        help="Retries per prompt for transient errors.",
    )
    parser.add_argument(
        "--retry-delay",
        type=float,
        default=float(os.getenv("CA_E2E_RETRY_DELAY", "1.5")),
        help="Delay between retries (seconds).",
    )
    parser.add_argument(
        "--include-events",
        action="store_true",
        help="Include raw SSE events in the output JSON.",
    )
    args = parser.parse_args()

    required_env = [
        "CA_DATABASE_URL",
        "OPENROUTER_API_KEY",
        "OPENAI_API_KEY",
        "CC_BASE_URL",
        "CA_E2E_CC_TOKEN",
    ]
    missing = [name for name in required_env if not os.getenv(name)]
    if missing:
        print(f"Missing required environment variables: {', '.join(missing)}", file=sys.stderr)
        return 1

    token = os.getenv("CA_E2E_CC_TOKEN", "")
    if not token or is_token_expired(token):
        print("CA_E2E_CC_TOKEN is missing or expired.", file=sys.stderr)
        return 1

    prompts_path = Path(args.prompts)
    if not prompts_path.exists():
        print(f"Prompt file not found: {prompts_path}", file=sys.stderr)
        return 1

    prompt_data = _load_prompt_data(prompts_path)
    defaults = prompt_data.get("defaults", {})
    if not isinstance(defaults, dict):
        print("Prompt JSON defaults must be an object.", file=sys.stderr)
        return 1

    cases = prompt_data.get("cases", [])
    if not isinstance(cases, list) or not cases:
        print("Prompt JSON must include a non-empty cases list.", file=sys.stderr)
        return 1

    app = get_app()
    client = TestClient(app)

    responses: List[Dict[str, Any]] = []
    thread_id: Optional[str] = None
    variables: Dict[str, Any] = {}

    env_city = _env_override("CA_E2E_CITY_NAME")
    if env_city:
        variables["city_name"] = env_city
    env_inventory = _env_override("CA_E2E_INVENTORY_ID")
    if env_inventory:
        variables["inventory_id"] = env_inventory

    try:
        for case in cases:
            if not isinstance(case, dict):
                continue

            name = case.get("name") or "unnamed"
            content = case.get("content")
            if not isinstance(content, str) or not content.strip():
                continue

            required_vars = case.get("requires", [])
            if isinstance(required_vars, list):
                missing_vars = [var for var in required_vars if not variables.get(var)]
                if missing_vars:
                    responses.append(
                        {
                            "name": name,
                            "response": "",
                            "errors": [f"Missing required variables: {', '.join(missing_vars)}"],
                            "attempts": 0,
                        }
                    )
                    continue

            payload: Dict[str, Any] = {
                "user_id": defaults.get("user_id") or "e2e-user",
                "content": content,
            }

            context: Dict[str, Any] = {}
            if isinstance(defaults.get("context"), dict):
                context.update(defaults["context"])
            if isinstance(case.get("context"), dict):
                context.update(case["context"])
            if context:
                payload["context"] = context

            options: Dict[str, Any] = {}
            if isinstance(defaults.get("options"), dict):
                options.update(defaults["options"])
            if isinstance(case.get("options"), dict):
                options.update(case["options"])
            if options:
                payload["options"] = options

            if isinstance(case.get("payload"), dict):
                payload.update(case["payload"])

            reuse_thread = bool(case.get("reuse_thread"))
            if reuse_thread and thread_id:
                payload["thread_id"] = thread_id

            try:
                rendered_payload = _render_payload(payload, variables)
            except RuntimeError as exc:
                responses.append(
                    {
                        "name": name,
                        "response": "",
                        "errors": [str(exc)],
                        "attempts": 0,
                    }
                )
                continue

            events: List[Dict[str, Any]] = []
            done_payload: Optional[Dict[str, Any]] = None
            assistant_text = ""
            error_messages: List[str] = []
            attempts = 0

            while attempts < max(1, args.retries):
                attempts += 1
                response = client.post("/v1/messages", json=rendered_payload)
                events = _parse_sse_events(response.text)
                done_payload = _get_done_payload(events)
                assistant_text = _collect_assistant_text(events)
                error_messages = _collect_error_messages(events)

                if assistant_text and done_payload:
                    break

                if attempts < args.retries and _is_retryable_error(error_messages):
                    time.sleep(args.retry_delay)
                    continue
                break

            tools_used = []
            if done_payload:
                tools_used = done_payload.get("tools_used") or []
                if not isinstance(tools_used, list):
                    tools_used = []
                if done_payload.get("thread_id"):
                    if reuse_thread:
                        thread_id = done_payload["thread_id"]
                    else:
                        thread_id = None

            extracted = _extract_inventory_meta(tools_used)
            for key, value in extracted.items():
                variables.setdefault(key, value)

            response_entry: Dict[str, Any] = {
                "name": name,
                "thread_id": done_payload.get("thread_id") if done_payload else None,
                "request": _redact_payload(rendered_payload),
                "response": assistant_text,
                "tools_used": _redact_payload(tools_used),
                "errors": error_messages,
                "attempts": attempts,
                "done": _redact_payload(done_payload) if done_payload else None,
            }
            if args.include_events:
                response_entry["events"] = _redact_payload(events)

            responses.append(response_entry)
    finally:
        client.close()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(responses, indent=2), encoding="utf-8")
    print(f"Saved responses to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
