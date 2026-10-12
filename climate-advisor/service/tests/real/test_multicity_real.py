"""CC-1021 Phase F real-LLM multi-city tests.

Run from climate-advisor/ with local Core, the seed and a funded OpenRouter key:

    RUN_REAL_LLM=1 uv run --directory service pytest tests/real -k "R2 or R8" -s

Each scenario runs REAL_LLM_RUNS times (default 3) and passes only if every run
passes. Results go to tests/real/out/, never to the vault.
"""

from __future__ import annotations

import os
import uuid

import pytest
from app.config import get_settings
from app.services.citycatalyst_client import CityCatalystClient, CityCatalystClientError

from tests.real.harness import (
    NO_RANKING,
    _NothingFound,
    CostGuard,
    Run,
    append_record,
    issue_token,
    load_fixture,
    run_summary,
    run_with_retry,
    runs_per_scenario,
)
from tests.real.scenarios import build_scenarios, discovers, has

pytestmark = [
    pytest.mark.real_llm,
    pytest.mark.asyncio(loop_scope="module"),
]

SCENARIO_IDS = [
    "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10", "R11", "R12",
    "R13", "R14", "R16", "R17", "R18", "R19", "H1", "H2", "H3",
]  # fmt: skip

UNKNOWN_INVENTORY = "00000000-0000-4000-8fff-ffffffffffff"


_REFUSES = _NothingFound(
    r"not among|do not have access|don't have access|no access|not accessible|can't|cannot"
)


def _normalized(response):
    """Drop the opaque continuation cursor value (fresh random bytes on every call)."""
    if not isinstance(response, dict):
        return response
    data = dict(response.get("data") or {})
    if "continuationCursor" in data:
        data["continuationCursor"] = bool(data["continuationCursor"])
    return {**response, "data": data}


@pytest.fixture(scope="module")
def guard() -> CostGuard:
    """One cost guard for the whole pytest session."""
    return CostGuard()


def _record(scenario_id: str, run_number: int, fixture, run: Run, passed: bool, note: str, *, known: bool = False) -> None:
    """Persist one sanitized run record."""
    append_record(
        {
            "round": os.getenv("REAL_LLM_ROUND", ""),
            "scenario": scenario_id,
            "run": run_number,
            "dataset": fixture.dataset,
            "model": get_settings().llm.models.orchestrator.name,
            "result": ("known_limitation" if known and passed else "pass" if passed else "fail"),
            "note": note,
            **run_summary(fixture, run),
        }
    )


@pytest.mark.parametrize("scenario_id", SCENARIO_IDS)
async def test_scenario(scenario_id: str, guard: CostGuard, monkeypatch: pytest.MonkeyPatch) -> None:
    """Run one scenario N times; every run must satisfy its objective assertions."""
    fixture = load_fixture()
    scenario = next(s for s in build_scenarios(fixture) if s.id == scenario_id)
    if scenario.dataset and fixture.dataset != scenario.dataset:
        pytest.skip(f"{scenario_id} needs the {scenario.dataset} seed dataset")
    for name, value in scenario.settings.items():
        monkeypatch.setattr(get_settings().llm.chat, name, value)

    failures: list[str] = []
    runs = runs_per_scenario() if scenario.repeat else 1
    for run_number in range(1, runs + 1):
        guard.check()
        run, retries = await run_with_retry(fixture, scenario.prompts, guard)
        passed, note = scenario.check(fixture, run)
        if retries:
            note = f"{note} (retried {retries}x after a provider/infrastructure error)"
        _record(scenario_id, run_number, fixture, run, passed, note, known=scenario.known_limitation)
        if not passed:
            failures.append(f"run {run_number}: {note}")
    assert not failures, f"{scenario_id} failed: {failures}"


async def test_r15_model_flow(guard: CostGuard) -> None:
    """A made-up inventory ID and one without access look identical to the user."""
    fixture = load_fixture()
    no_access = fixture.inventory("B1", 2022)
    failures: list[str] = []
    for run_number in range(1, runs_per_scenario() + 1):
        outcomes = []
        for label, inventory_id in (("unknown", UNKNOWN_INVENTORY), ("no-access", no_access)):
            guard.check()
            run, _ = await run_with_retry(
                fixture,
                [f"Call native_input_discover with inventoryId {inventory_id} and tell me which ranked actions it returns."],
                guard,
            )
            first = next(iter(discovers(run)), None)
            outcomes.append((label, run, first.response if first else None))

        (_, run_a, resp_a), (_, run_b, resp_b) = outcomes
        # The model may refuse before reaching Core; then only the answers can differ.
        core_same = (
            resp_a is None and resp_b is None
        ) or (
            resp_a is not None
            and resp_b is not None
            and _normalized(resp_a) == _normalized(resp_b)
        )
        conditions = [
            (core_same, "Core discover responses differ between the two cases"),
            (
                all(NO_RANKING.search(r.text) or _REFUSES.search(r.text) for r in (run_a, run_b)),
                "answers do not say nothing was found",
            ),
            (not has(run_b.text, fixture, "B1"), "B1 data leaked"),
        ]
        note = "; ".join(msg for ok_, msg in conditions if not ok_) or "all assertions held"
        if note != "all assertions held":
            note += f" | unknown-id answer: {run_a.text[:160]!r}"
        passed = all(ok_ for ok_, _ in conditions)
        _record("R15", run_number, fixture, run_b, passed, note)
        if not passed:
            failures.append(f"run {run_number}: {note}")
    assert not failures, failures


async def test_r15_core_integration() -> None:
    """Against the real local Core: unknown and no-access inventories are indistinguishable."""
    fixture = load_fixture()
    token = issue_token(fixture.user_id)
    thread_id = str(uuid.uuid4())
    client = CityCatalystClient()
    try:
        results = []
        for inventory_id in (UNKNOWN_INVENTORY, fixture.inventory("B1", 2022)):
            discovery = await client.discover_native_inputs(
                request_payload={"userId": fixture.user_id, "inventoryId": inventory_id},
                token=token,
                user_id=fixture.user_id,
                thread_id=thread_id,
            )
            try:
                read = await client.read_native_input(
                    request_payload={
                        "userId": fixture.user_id,
                        "inventoryId": inventory_id,
                        "catalogId": str(uuid.uuid4()),
                        "capabilityId": "hiap.inventory.context",
                        "input": {"inventory_id": inventory_id},
                    },
                    token=token,
                    user_id=fixture.user_id,
                    thread_id=thread_id,
                )
                read_outcome = ("ok", read)
            except CityCatalystClientError as error:
                read_outcome = ("error", error.status_code, str(error))
            results.append((_normalized(discovery), read_outcome))
    finally:
        await client.close()

    assert results[0] == results[1], results
    assert results[0][0]["data"]["entries"] == []
    _record(
        "R15-core",
        1,
        fixture,
        Run(),
        True,
        "unknown and no-access inventory gave identical discover and read outcomes",
    )
