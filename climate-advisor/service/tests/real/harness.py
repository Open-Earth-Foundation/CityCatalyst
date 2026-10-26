"""Harness for the CC-1021 real-LLM multi-city tests.

What it does: drives the real Climate Advisor app in-process (ASGI) against a
real local CityCatalyst Core, as the seed user, and records the payloads that
actually reach Core, the tool calls, the final answer, time and OpenRouter cost.

Inputs (env): RUN_REAL_LLM=1, CC_BASE_URL (default http://localhost:3000),
CC_SERVICE_API_KEY or CC_API_KEY, OPENROUTER_API_KEY, CC1021_FIXTURE_PATH
(default tests/real/out/seed-fixture.json), REAL_LLM_RUNS (default 3),
REAL_LLM_COST_CAP_USD (default 2). MLflow tracing is off unless
REAL_LLM_MLFLOW=1 (then REAL_LLM_MLFLOW_EXPERIMENT, default cc1060-local-review,
and REAL_LLM_MLFLOW_ENVIRONMENT, default local-david; credentials come from the
environment or climate-advisor/.env and are never printed). Each trace is tagged
with scenario_id and scenario_run, and the trace IDs go to records.jsonl.

Outputs: tests/real/out/records.jsonl and tests/real/out/report.md. The runner
never writes to the vault; a separate review step copies sanitized results.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
import unicodedata
from contextlib import contextmanager
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterator, Optional

import httpx

logger = logging.getLogger(__name__)

OUT_DIR = Path(__file__).parent / "out"
FIXTURE_PATH = Path(os.getenv("CC1021_FIXTURE_PATH") or OUT_DIR / "seed-fixture.json")
UUID_PATTERN = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE
)
OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/key"


def _load_env_files() -> None:
    """Load climate-advisor/.env without overriding variables already set."""
    try:
        from dotenv import load_dotenv
    except ImportError:  # pragma: no cover - python-dotenv ships with the service
        return
    load_dotenv(Path(__file__).resolve().parents[3] / ".env", override=False)


_load_env_files()
# Local test traces must not reach hosted tracing services.
os.environ["LANGSMITH_TRACING"] = "false"
os.environ["LANGCHAIN_TRACING_V2"] = "false"


def tracing_requested() -> bool:
    """Return True when REAL_LLM_MLFLOW=1 asks for MLflow traces of the runs."""
    return os.getenv("REAL_LLM_MLFLOW") == "1"


if tracing_requested():
    # Opt-in: keep the MLflow settings from the environment/.env, but send the
    # traces to a dedicated experiment and tag the environment as local evidence.
    os.environ["MLFLOW_ENABLED"] = "true"
    os.environ["MLFLOW_EXPERIMENT_NAME"] = (
        os.getenv("REAL_LLM_MLFLOW_EXPERIMENT") or "cc1060-local-review"
    )
    os.environ["MLFLOW_ENVIRONMENT"] = os.getenv("REAL_LLM_MLFLOW_ENVIRONMENT") or "local-david"
else:
    os.environ["MLFLOW_ENABLED"] = "false"

# Scenario id and run number stamped on every trace while tracing is on, and
# the trace IDs seen since the last pop_trace_ids().
_TRACE_CONTEXT: dict[str, str] = {}
_TRACE_IDS: list[str] = []
_TRACE_TAGGING_INSTALLED = False


def set_trace_scenario(scenario_id: str, run_number: int) -> None:
    """Name the scenario run whose traces the next requests create."""
    _TRACE_CONTEXT.update(scenario_id=scenario_id, scenario_run=str(run_number))


def pop_trace_ids() -> list[str]:
    """Return and clear the trace IDs captured since the last call."""
    ids = list(dict.fromkeys(_TRACE_IDS))
    _TRACE_IDS.clear()
    return ids


def flush_traces() -> None:
    """Wait for queued trace uploads so they are stored before the test process exits."""
    if not tracing_requested():
        return
    import mlflow

    flush = getattr(mlflow, "flush_trace_async_logging", None)
    if callable(flush):
        flush()


def install_trace_tagging() -> None:
    """Wrap mlflow.update_current_trace so each trace carries the scenario tags.

    Test-harness only: the application code is untouched. The wrapper adds the
    scenario id and run number as trace tags and remembers the trace ID.
    """
    global _TRACE_TAGGING_INSTALLED
    if not tracing_requested() or _TRACE_TAGGING_INSTALLED:
        return
    import mlflow

    original = mlflow.update_current_trace

    def tagged(*args: Any, **kwargs: Any) -> Any:
        if _TRACE_CONTEXT:
            kwargs["tags"] = {**(kwargs.get("tags") or {}), **_TRACE_CONTEXT}
        span = mlflow.get_current_active_span()
        if span is not None:
            _TRACE_IDS.append(span.trace_id)
        return original(*args, **kwargs)

    mlflow.update_current_trace = tagged
    _TRACE_TAGGING_INSTALLED = True


def core_url() -> str:
    """Return the local Core base URL."""
    return (os.getenv("CC_BASE_URL") or "http://localhost:3000").rstrip("/")


def runs_per_scenario() -> int:
    """Return how many times each scenario repeats (default 3)."""
    return int(os.getenv("REAL_LLM_RUNS") or "3")


@dataclass
class CoreCall:
    """One request that reached Core through the Climate Advisor client."""

    op: str
    payload: dict[str, Any]
    started: float
    ended: float = 0.0
    response: Any = None

    @property
    def inventory_id(self) -> Optional[str]:
        """Return the final inventory ID sent to Core, when present."""
        return self.payload.get("inventoryId") or (self.payload.get("input") or {}).get(
            "inventory_id"
        )

    @property
    def capability(self) -> Optional[str]:
        """Return the capability ID of a read, when present."""
        return self.payload.get("capabilityId")

    @property
    def language(self) -> Optional[str]:
        """Return the language of a read input, when present."""
        return (self.payload.get("input") or {}).get("language")


@dataclass
class Turn:
    """One user message and the assistant turn it produced."""

    prompt: str
    text: str = ""
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    core_calls: list[CoreCall] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    done_ok: bool = False


@dataclass
class Run:
    """Everything captured for one execution of a scenario."""

    turns: list[Turn] = field(default_factory=list)
    seconds: float = 0.0
    cost_usd: float = 0.0

    @property
    def text(self) -> str:
        """Return the final answer of the last turn."""
        return self.turns[-1].text if self.turns else ""

    @property
    def core_calls(self) -> list[CoreCall]:
        """Return all Core calls across turns, in order."""
        return [call for turn in self.turns for call in turn.core_calls]

    @property
    def tool_calls(self) -> list[dict[str, Any]]:
        """Return all model tool calls across turns, in order."""
        return [call for turn in self.turns for call in turn.tool_calls]

    def tool_names(self) -> list[str]:
        """Return tool call names in order."""
        return [call["name"] for call in self.tool_calls]

    def parallel(self) -> bool:
        """Return True when two Core calls overlapped in time."""
        calls = sorted(self.core_calls, key=lambda call: call.started)
        return any(
            later.started < earlier.ended
            for earlier, later in zip(calls, calls[1:])
        )


class Fixture:
    """Seed-written IDs and known values."""

    def __init__(self, data: dict[str, Any]) -> None:
        self.data = data
        self.user_id: str = data["user"]["userId"]
        self.chat_inventory: str = data["chatInventory"]["inventoryId"]
        self.dataset: str = data["dataset"]
        self._labels: dict[str, str] = {}
        for key, city in data["cities"].items():
            for year, inventory_id in city["inventories"].items():
                self._labels[inventory_id.lower()] = f"inv-{key}-{year}"

    def inventory(self, city: str, year: int) -> str:
        """Return the inventory ID of a city-year."""
        return self.data["cities"][city]["inventories"][str(year)]

    def name(self, city: str) -> str:
        """Return the fictional city name."""
        return self.data["cities"][city]["name"]

    def markers(self, key: str, language: str = "en") -> list[str]:
        """Return acceptable rank-1 substrings for a ranking key."""
        return [m.lower() for m in self.data["rank1"][key][language]]

    def abbreviate(self, inventory_id: Optional[str]) -> str:
        """Return inv-A1-2022 style labels without exposing raw IDs."""
        if not inventory_id:
            return "none"
        return self._labels.get(inventory_id.lower(), "inv-unknown")


def load_fixture() -> Fixture:
    """Load the seed fixture or fail with a clear instruction."""
    if not FIXTURE_PATH.exists():
        raise RuntimeError(
            f"Seed fixture not found at {FIXTURE_PATH}. Run `npm run seed-cc1021-multicity` in app/."
        )
    return Fixture(json.loads(FIXTURE_PATH.read_text(encoding="utf-8")))


def _normalize(text: str) -> str:
    """Lowercase, drop accents and hyphens, and collapse whitespace for matching."""
    decomposed = unicodedata.normalize("NFKD", text.lower())
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", re.sub(r"[-‐-―]", " ", stripped))


def answer_has(text: str, markers: list[str]) -> bool:
    """Return True when any marker's words all appear in the answer.

    Matching ignores accents, case, hyphens and word order, so "rooftop solar
    programme" matches the marker "solar rooftop programme".
    """
    words = set(re.findall(r"\w+", _normalize(text)))
    for marker in markers:
        marker_words = [w for w in re.findall(r"\w+", _normalize(marker)) if len(w) > 1]
        if marker_words and all(w in words for w in marker_words):
            return True
    return False


class _NothingFound:
    """Regex matcher for "nothing found" answers that tolerates curly apostrophes."""

    def __init__(self, pattern: str) -> None:
        self._regex = re.compile(pattern, re.IGNORECASE)

    def search(self, text: str) -> Optional[re.Match[str]]:
        """Search after normalizing typographic apostrophes."""
        return self._regex.search(text.replace("’", "'").replace("‘", "'"))


NO_RANKING = _NothingFound(
    r"no ranking|not find|couldn't find|could not find|didn't find|did not find|"
    r"no ranked|isn't any|is not any|nothing found|not available|nenhum ranking|"
    r"n[aã]o encontr|no results|unable to find|don't have a ranking|no .{0,30}ranking|"
    r"no accessible inventor(y|ies)|not accessible|can't find|cannot find|couldn't retrieve|could not retrieve"
)


def issue_token(user_id: str) -> str:
    """Request a user token from the Core endpoint used by production code."""
    key = os.getenv("CC_SERVICE_API_KEY") or os.getenv("CC_API_KEY")
    if not key:
        raise RuntimeError("Set CC_SERVICE_API_KEY (or CC_API_KEY) for the runner.")
    response = httpx.post(
        f"{core_url()}/api/v1/internal/ca/user-token/",
        json={"user_id": user_id},
        headers={"X-CA-Service-Key": key},
        timeout=60,
    )
    response.raise_for_status()
    return response.json()["access_token"]


def openrouter_usage() -> Optional[float]:
    """Return the account's cumulative OpenRouter usage in USD, or None if unavailable."""
    key = os.getenv("OPENROUTER_API_KEY")
    if not key:
        return None
    try:
        response = httpx.get(
            OPENROUTER_KEY_URL, headers={"Authorization": f"Bearer {key}"}, timeout=20
        )
        response.raise_for_status()
        return float(response.json()["data"]["usage"])
    except Exception:  # pragma: no cover - network dependent
        logger.warning("OpenRouter usage lookup failed")
        return None


class CostGuard:
    """Track spend across the pytest session and stop the round above the cap."""

    def __init__(self) -> None:
        self.cap = float(os.getenv("REAL_LLM_COST_CAP_USD") or "2")
        self.start = openrouter_usage()
        self.spent = 0.0

    def check(self) -> None:
        """Abort the whole round when the cap is exceeded."""
        import pytest

        if self.spent > self.cap:
            pytest.exit(
                f"Cost cap exceeded: ${self.spent:.2f} > ${self.cap:.2f}", returncode=3
            )


@contextmanager
def record_core_calls(sink: list[CoreCall]) -> Iterator[None]:
    """Wrap the Core client methods so every real request payload is recorded."""
    from app.services.citycatalyst_client import CityCatalystClient

    targets = {
        "discover": "discover_native_inputs",
        "read": "read_native_input",
        "list": "load_inventory_list_accessible",
    }
    originals = {op: getattr(CityCatalystClient, name) for op, name in targets.items()}

    def make_wrapper(op: str, original: Callable[..., Any]) -> Callable[..., Any]:
        async def wrapper(self: Any, *args: Any, **kwargs: Any) -> Any:
            call = CoreCall(
                op=op,
                payload=dict(kwargs.get("request_payload") or {}),
                started=time.perf_counter(),
            )
            sink.append(call)
            try:
                response = await original(self, *args, **kwargs)
                call.response = response
                return response
            finally:
                call.ended = time.perf_counter()

        return wrapper

    try:
        for op, name in targets.items():
            setattr(CityCatalystClient, name, make_wrapper(op, originals[op]))
        yield
    finally:
        for op, name in targets.items():
            setattr(CityCatalystClient, name, originals[op])


def _parse_sse(body: str) -> list[tuple[str, Any]]:
    """Split an SSE body into (event, data) pairs."""
    events: list[tuple[str, Any]] = []
    for frame in body.split("\n\n"):
        fields: dict[str, str] = {}
        for line in frame.splitlines():
            if ":" in line:
                key, value = line.split(":", 1)
                fields[key.strip()] = value.strip()
        if "event" in fields and "data" in fields:
            try:
                events.append((fields["event"], json.loads(fields["data"])))
            except ValueError:
                events.append((fields["event"], fields["data"]))
    return events


async def run_conversation(
    fixture: Fixture, prompts: list[str], guard: CostGuard
) -> Run:
    """Run a (possibly multi-turn) conversation as the seed user and capture it."""
    from app.main import app

    install_trace_tagging()
    token = issue_token(fixture.user_id)
    headers = {"Authorization": f"Bearer {token}"}
    run = Run()
    usage_before = openrouter_usage()
    started = time.perf_counter()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://climate-advisor", timeout=600
    ) as client:
        created = await client.post(
            "/v1/threads",
            json={"user_id": fixture.user_id, "inventory_id": fixture.chat_inventory},
            headers=headers,
        )
        created.raise_for_status()
        thread_id = created.json()["thread_id"]

        for prompt in prompts:
            turn = Turn(prompt=prompt)
            run.turns.append(turn)
            with record_core_calls(turn.core_calls):
                response = await client.post(
                    "/v1/messages",
                    json={
                        "thread_id": thread_id,
                        "user_id": fixture.user_id,
                        "content": prompt,
                        "inventory_id": fixture.chat_inventory,
                        "context": {},
                    },
                    headers=headers,
                )
            events = _parse_sse(response.text)
            for name, data in events:
                if name == "message" and isinstance(data, dict):
                    turn.text += data.get("content", "")
                elif name == "tool_result" and isinstance(data, dict):
                    if data.get("status") == "executing":
                        turn.tool_calls.append(
                            {"name": data.get("name"), "arguments": data.get("arguments")}
                        )
                elif name == "error":
                    turn.errors.append(str(data))
                elif name == "done" and isinstance(data, dict):
                    turn.done_ok = bool(data.get("ok"))
    run.seconds = time.perf_counter() - started
    # OpenRouter usage lags the requests by a few seconds.
    await asyncio.sleep(6)
    usage_after = openrouter_usage()
    if usage_before is not None and usage_after is not None:
        run.cost_usd = max(usage_after - usage_before, 0.0)
        guard.spent += run.cost_usd
    return run


def is_infra_failure(run: Run) -> bool:
    """Return True for a run that ended in the generic stream error (provider limits, network)."""
    return any(turn.errors for turn in run.turns) and not run.text.strip()


async def run_with_retry(
    fixture: Fixture, prompts: list[str], guard: CostGuard, attempts: int = 3
) -> tuple[Run, int]:
    """Run a conversation, retrying after a pause when the provider failed (not the model)."""
    retries = 0
    while True:
        run = await run_conversation(fixture, prompts, guard)
        if not is_infra_failure(run) or retries >= attempts - 1:
            return run, retries
        retries += 1
        logger.warning("Infrastructure failure, retrying after a pause (%d)", retries)
        await asyncio.sleep(65)


def _entry_count(call: CoreCall) -> Optional[int]:
    """Return how many entries a discover response held, or None for other calls."""
    if call.op != "discover" or not isinstance(call.response, dict):
        return None
    return len((call.response.get("data") or {}).get("entries") or [])


def _cursor_returned(call: CoreCall) -> Optional[bool]:
    """Return whether a discover response carried a continuation cursor."""
    if call.op != "discover" or not isinstance(call.response, dict):
        return None
    return bool((call.response.get("data") or {}).get("continuationCursor"))


def run_summary(fixture: Fixture, run: Run) -> dict[str, Any]:
    """Return the sanitized per-run record (inventories abbreviated, no tokens)."""
    return {
        "calls": [
            {
                "op": call.op,
                "inventory": fixture.abbreviate(call.inventory_id),
                "capability": call.capability,
                "language": call.language,
                "cursor": bool(call.payload.get("cursor")),
                "entries": _entry_count(call),
                "cursor_returned": _cursor_returned(call),
            }
            for call in run.core_calls
        ],
        "tool_names": run.tool_names(),
        "parallel": run.parallel(),
        "core_calls": len(run.core_calls),
        "seconds": round(run.seconds, 1),
        "cost_usd": round(run.cost_usd, 4),
        "answer": run.text[:1500],
        "errors": [error for turn in run.turns for error in turn.errors],
    }


def append_record(record: dict[str, Any]) -> None:
    """Append one run record to records.jsonl and refresh report.md."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with (OUT_DIR / "records.jsonl").open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    write_report()


def write_report() -> None:
    """Regenerate the Markdown report from records.jsonl."""
    path = OUT_DIR / "records.jsonl"
    if not path.exists():
        return
    records = [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    lines = [
        "# CC-1021 Phase F real-test records",
        "",
        "| Round | Scenario | Run | Env | Dataset | Model | Result | Calls | Parallel | Seconds | Cost USD | Note |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for record in records:
        lines.append(
            "| {round} | {scenario} | {run} | Local | {dataset} | {model} | {result} | {core_calls} | {parallel} | {seconds} | {cost_usd} | {note} |".format(
                **{"round": "", **record, "note": str(record.get("note", "")).replace("|", "/")}
            )
        )
    (OUT_DIR / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
