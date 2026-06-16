from __future__ import annotations

import copy
import json
import os
from contextlib import asynccontextmanager
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from tempfile import mkstemp
from typing import Any, AsyncIterator
from uuid import UUID, uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

pytest.importorskip("pgvector.sqlalchemy")

from agents import Runner

from app.db import Base
import app.models.db.message  # noqa: F401
import app.models.db.thread  # noqa: F401
from app.models.db.stationary_energy_draft import (
    StationaryEnergyDraftProposal,
    StationaryEnergyDraftRun,
    StationaryEnergyDraftSourceCandidate,
    StationaryEnergyReviewDecision,
    StationaryEnergyStagedReviewSelection,
)
from app.models.requests import MessageCreateRequest
from app.services.agent_service import AgentService
from app.services.stationary_energy.stationary_energy_agent_review import (
    StationaryEnergyAgentReviewChoiceInput,
    StationaryEnergyAgentReviewService,
)
from app.services.stationary_energy.stationary_energy_draft_repository import (
    StationaryEnergyDraftRepository,
)
from app.utils.streaming_handler import StreamingHandler


FIXTURE_PATH = (
    Path(__file__).parent
    / "fixtures"
    / "stationary_energy_review_empty_draft_context.json"
)
OUTPUT_DIR = (
    Path(__file__).parent / "output" / "stationary_energy_review_live_llm"
)
TEST_USER_ID = "manual-llm-user"


@dataclass
class ManualReviewHarness:
    session_factory: async_sessionmaker[AsyncSession]
    engine: Any
    database_path: Path
    fixture_payload: dict[str, Any]
    draft_run_id: UUID
    focused_proposal_id: str
    focused_candidate_id: str
    focused_selected_source_id: str
    epe_proposal_ids: list[str]
    non_epe_proposal_ids: list[str]
    proposal_labels: dict[str, str]


@dataclass
class LiveTurnResult:
    final_output: str
    tool_calls: list[dict[str, Any]]
    tool_outputs: list[dict[str, Any]]
    history: list[dict[str, str]]


def _require_live_llm_env() -> None:
    if not os.getenv("OPENROUTER_API_KEY"):
        pytest.skip(
            "OPENROUTER_API_KEY is required for manual Stationary Energy live-LLM tests."
        )


def _decimal_or_none(value: Any) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value))


def _context_summary_from_fixture(payload: dict[str, Any]) -> dict[str, Any]:
    llm_generation = payload.get("llm_generation") or {}
    return {
        "city": payload.get("city"),
        "inventory": payload.get("inventory"),
        "taxonomy_count": payload.get("context_counts", {}).get("taxonomy_count"),
        "current_values_count": payload.get("context_counts", {}).get(
            "current_values_count"
        ),
        "source_candidates_count": payload.get("context_counts", {}).get(
            "source_candidates_count"
        ),
        "guidance_context": payload.get("guidance_context"),
        "llm_trace": {
            "model": llm_generation.get("model"),
            "temperature": llm_generation.get("temperature"),
            "usage": llm_generation.get("usage"),
            "parsed_output": {
                "proposals": [
                    {
                        "proposal_id": proposal["proposal_id"],
                        "status": proposal.get("status"),
                    }
                    for proposal in payload.get("proposals", [])
                ]
            },
        },
    }


async def _persist_fixture_payload(
    session_factory: async_sessionmaker[AsyncSession],
    payload: dict[str, Any],
) -> None:
    draft_run_payload = payload["draft_run"]

    async with session_factory() as session:
        draft_run = StationaryEnergyDraftRun(
            draft_run_id=UUID(draft_run_payload["draft_run_id"]),
            thread_id=UUID(draft_run_payload["thread_id"]),
            user_id=TEST_USER_ID,
            city_id=draft_run_payload["city_id"],
            inventory_id=draft_run_payload["inventory_id"],
            sector_code=draft_run_payload["sector_code"],
            status=draft_run_payload["status"],
            workflow_step=draft_run_payload["workflow_step"],
            trace_id=draft_run_payload["trace_id"],
            context_summary=_context_summary_from_fixture(payload),
            permission_summary=payload.get("permission_summary"),
        )
        session.add(draft_run)
        await session.flush()

        for candidate in payload.get("source_candidates", []):
            session.add(
                StationaryEnergyDraftSourceCandidate(
                    candidate_id=UUID(candidate["candidate_id"]),
                    draft_run_id=draft_run.draft_run_id,
                    datasource_id=candidate["datasource_id"],
                    name=candidate.get("name"),
                    publisher_name=candidate.get("publisher_name"),
                    retrieval_method=candidate.get("retrieval_method"),
                    dataset_name=candidate.get("dataset_name"),
                    dataset_year=candidate.get("dataset_year"),
                    url=candidate.get("url"),
                    geography_match=candidate.get("geography_match") or "unknown",
                    source_scope=candidate.get("source_scope") or {},
                    source_data=candidate.get("source_data"),
                    normalized_rows=candidate.get("normalized_rows") or [],
                    applicability_status=candidate.get("applicability_status")
                    or "applicable",
                    applicability_issues=candidate.get("applicability_issues") or [],
                    failure_reason=candidate.get("failure_reason"),
                    quality_score=_decimal_or_none(candidate.get("quality_score")),
                    confidence_notes=candidate.get("confidence_notes"),
                )
            )
            await session.flush()

        for proposal in payload.get("proposals", []):
            session.add(
                StationaryEnergyDraftProposal(
                    proposal_id=UUID(proposal["proposal_id"]),
                    draft_run_id=draft_run.draft_run_id,
                    target_ref=proposal.get("target_ref") or {},
                    current_value=proposal.get("current_value"),
                    recommended_candidate_id=(
                        UUID(proposal["recommended_candidate_id"])
                        if proposal.get("recommended_candidate_id")
                        else None
                    ),
                    recommended_datasource_id=proposal.get("recommended_datasource_id"),
                    alternative_candidate_ids=proposal.get("alternative_candidate_ids")
                    or [],
                    proposed_value=proposal.get("proposed_value"),
                    rationale=proposal.get("rationale"),
                    status=proposal.get("status") or "needs_review",
                    confidence_score=_decimal_or_none(
                        proposal.get("confidence_score")
                    ),
                )
            )
            await session.flush()

        for decision in payload.get("review_decisions", []):
            session.add(
                StationaryEnergyReviewDecision(
                    decision_id=UUID(decision["decision_id"]),
                    draft_run_id=draft_run.draft_run_id,
                    proposal_id=UUID(decision["proposal_id"]),
                    decision_version=int(decision["decision_version"]),
                    user_id=TEST_USER_ID,
                    action=decision["action"],
                    selected_source_id=decision.get("selected_source_id"),
                    selected_candidate_id=(
                        UUID(decision["selected_candidate_id"])
                        if decision.get("selected_candidate_id")
                        else None
                    ),
                    manual_value=_decimal_or_none(decision.get("manual_value")),
                    manual_unit=decision.get("manual_unit"),
                    note=decision.get("note"),
                    commit_status=decision.get("commit_status") or "not_applicable",
                    commit_response=decision.get("commit_response"),
                )
            )
            await session.flush()

        for selection in payload.get("staged_review_selections", []):
            session.add(
                StationaryEnergyStagedReviewSelection(
                    selection_id=UUID(selection["selection_id"]),
                    draft_run_id=draft_run.draft_run_id,
                    proposal_id=UUID(selection["proposal_id"]),
                    user_id=TEST_USER_ID,
                    action=selection["action"],
                    selected_source_id=selection.get("selected_source_id"),
                    selected_candidate_id=(
                        UUID(selection["selected_candidate_id"])
                        if selection.get("selected_candidate_id")
                        else None
                    ),
                    rationale=selection.get("rationale"),
                    tool_call_id=selection.get("tool_call_id"),
                    status=selection.get("status") or "active",
                )
            )
            await session.flush()

        await session.commit()


def _proposal_label(proposal: dict[str, Any]) -> str:
    target = proposal.get("target_ref") or {}
    parts = [
        target.get("subsector_name"),
        target.get("subcategory_name"),
        target.get("scope_name") or target.get("scope_id"),
    ]
    return " / ".join(str(part) for part in parts if part) or proposal["proposal_id"]


def _extract_harness_metadata(payload: dict[str, Any]) -> dict[str, Any]:
    candidates_by_id = {
        candidate["candidate_id"]: candidate for candidate in payload["source_candidates"]
    }
    proposal_labels = {
        proposal["proposal_id"]: _proposal_label(proposal)
        for proposal in payload["proposals"]
    }
    focused_proposal = next(
        proposal
        for proposal in payload["proposals"]
        if proposal["target_ref"].get("subcategory_id") == "I.1.2"
    )
    focused_candidate = candidates_by_id[focused_proposal["recommended_candidate_id"]]
    epe_proposal_ids: list[str] = []
    non_epe_proposal_ids: list[str] = []
    for proposal in payload["proposals"]:
        recommended_candidate = candidates_by_id[proposal["recommended_candidate_id"]]
        publisher = str(recommended_candidate.get("publisher_name") or "").lower()
        if "epe" in publisher:
            epe_proposal_ids.append(proposal["proposal_id"])
        else:
            non_epe_proposal_ids.append(proposal["proposal_id"])

    return {
        "focused_proposal_id": focused_proposal["proposal_id"],
        "focused_candidate_id": focused_candidate["candidate_id"],
        "focused_selected_source_id": focused_candidate["source_data"][
            "details_datasource_id"
        ],
        "epe_proposal_ids": epe_proposal_ids,
        "non_epe_proposal_ids": non_epe_proposal_ids,
        "proposal_labels": proposal_labels,
    }


@asynccontextmanager
async def _manual_review_harness() -> AsyncIterator[ManualReviewHarness]:
    _require_live_llm_env()

    fd, database_path_text = mkstemp(
        prefix="cc-stationary-energy-review-live-", suffix=".sqlite"
    )
    os.close(fd)
    database_path = Path(database_path_text)
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{database_path.as_posix()}",
        echo=False,
        connect_args={"check_same_thread": False},
    )
    session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
        engine,
        expire_on_commit=False,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    fixture_payload = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    await _persist_fixture_payload(session_factory, fixture_payload)
    metadata = _extract_harness_metadata(fixture_payload)

    harness = ManualReviewHarness(
        session_factory=session_factory,
        engine=engine,
        database_path=database_path,
        fixture_payload=fixture_payload,
        draft_run_id=UUID(fixture_payload["draft_run"]["draft_run_id"]),
        focused_proposal_id=metadata["focused_proposal_id"],
        focused_candidate_id=metadata["focused_candidate_id"],
        focused_selected_source_id=metadata["focused_selected_source_id"],
        epe_proposal_ids=metadata["epe_proposal_ids"],
        non_epe_proposal_ids=metadata["non_epe_proposal_ids"],
        proposal_labels=metadata["proposal_labels"],
    )

    try:
        yield harness
    finally:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()
        database_path.unlink(missing_ok=True)


def _tool_name_from_raw_item(raw_item: Any) -> str:
    if isinstance(raw_item, dict):
        return str(raw_item.get("name") or raw_item.get("tool_name") or "")
    return str(
        getattr(raw_item, "name", None)
        or getattr(raw_item, "tool_name", None)
        or ""
    )


def _tool_arguments_from_raw_item(raw_item: Any) -> Any:
    if isinstance(raw_item, dict):
        arguments = raw_item.get("arguments")
    else:
        arguments = getattr(raw_item, "arguments", None)
    if isinstance(arguments, str):
        try:
            return json.loads(arguments)
        except json.JSONDecodeError:
            return arguments
    return arguments


def _maybe_parse_json(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


async def _active_staged_selections(
    harness: ManualReviewHarness,
) -> list[StationaryEnergyStagedReviewSelection]:
    async with harness.session_factory() as session:
        repository = StationaryEnergyDraftRepository(session)
        return await repository.get_staged_review_selections(
            draft_run_id=harness.draft_run_id,
            user_id=TEST_USER_ID,
        )


async def _stage_recommended_choices(
    harness: ManualReviewHarness,
    proposal_ids: list[str],
) -> None:
    async with harness.session_factory() as session:
        service = StationaryEnergyAgentReviewService(session)
        await service.accept_multiple(
            draft_run_id=harness.draft_run_id,
            user_id=TEST_USER_ID,
            choices=[
                StationaryEnergyAgentReviewChoiceInput(
                    proposal_id=UUID(proposal_id),
                    action="accept",
                )
                for proposal_id in proposal_ids
            ],
        )
        await session.commit()


def _build_request_context(
    harness: ManualReviewHarness,
    *,
    extra_context: dict[str, Any] | None = None,
    include_pending_review_cards: bool = True,
) -> dict[str, Any]:
    context: dict[str, Any] = {
        "stationary_energy_draft_run_id": str(harness.draft_run_id),
        "draft_run_id": str(harness.draft_run_id),
        "city_id": harness.fixture_payload["draft_run"]["city_id"],
        "inventory_id": harness.fixture_payload["draft_run"]["inventory_id"],
        "stationary_energy_interaction_mode": "free_text",
    }
    if include_pending_review_cards:
        context["stationary_energy_pending_decision_reviews"] = [
            {
                "proposal_id": proposal["proposal_id"],
                "label": harness.proposal_labels[proposal["proposal_id"]],
            }
            for proposal in harness.fixture_payload["proposals"]
        ]
    if extra_context:
        context.update(copy.deepcopy(extra_context))
    return context


async def _run_live_turn(
    harness: ManualReviewHarness,
    *,
    user_message: str,
    extra_context: dict[str, Any] | None = None,
    options: dict[str, Any] | None = None,
) -> LiveTurnResult:
    thread_id = uuid4()
    payload = MessageCreateRequest(
        user_id=TEST_USER_ID,
        content=user_message,
        context=_build_request_context(
            harness,
            extra_context=extra_context,
        ),
        options=options
        or {
            "stationary_energy_draft_run_id": str(harness.draft_run_id),
            "stationary_energy_pending_decision_review_count": len(
                harness.fixture_payload["proposals"]
            ),
            "stationary_energy_ui_surfaces": [
                "chat_text",
                "decision_review_card",
            ],
        },
    )
    handler = StreamingHandler(
        thread_id=thread_id,
        user_id=TEST_USER_ID,
        session_factory=harness.session_factory,
    )
    history = await handler._load_conversation_history(None, payload)

    agent_service = AgentService(
        cc_user_id=TEST_USER_ID,
        session_factory=harness.session_factory,
        stationary_energy_draft_run_id=str(harness.draft_run_id),
    )
    try:
        selected_model = agent_service.preferred_model_for_context(
            stationary_energy_draft_run_id=str(harness.draft_run_id)
        )
        handler.agent_model = selected_model
        handler.stationary_energy_draft_run_id = str(harness.draft_run_id)
        agent = await agent_service.create_agent(model=selected_model)
        result = await Runner.run(
            agent,
            history,
            max_turns=5,
            run_config=handler._run_config(payload),
        )
    finally:
        await agent_service.close()

    tool_calls: list[dict[str, Any]] = []
    tool_outputs: list[dict[str, Any]] = []
    for item in result.new_items:
        if getattr(item, "type", "") == "tool_call_item":
            tool_calls.append(
                {
                    "name": _tool_name_from_raw_item(item.raw_item),
                    "arguments": _tool_arguments_from_raw_item(item.raw_item),
                }
            )
        elif getattr(item, "type", "") == "tool_call_output_item":
            parsed_output = _maybe_parse_json(item.output)
            output_name = _tool_name_from_raw_item(item.raw_item)
            if not output_name and isinstance(parsed_output, dict):
                output_name = str(parsed_output.get("action") or "")
            tool_outputs.append(
                {
                    "name": output_name,
                    "output": parsed_output,
                }
            )

    final_output = result.final_output if isinstance(result.final_output, str) else ""
    return LiveTurnResult(
        final_output=final_output,
        tool_calls=tool_calls,
        tool_outputs=tool_outputs,
        history=history,
    )


def _assert_expected_tool_call(
    turn: LiveTurnResult,
    expected_tool_name: str,
) -> dict[str, Any]:
    tool_names = [tool_call["name"] for tool_call in turn.tool_calls]
    assert expected_tool_name in tool_names, {
        "expected_tool": expected_tool_name,
        "tool_calls": turn.tool_calls,
        "tool_outputs": turn.tool_outputs,
        "final_output": turn.final_output,
    }
    assert tool_names[-1] == expected_tool_name, {
        "expected_last_tool": expected_tool_name,
        "tool_calls": turn.tool_calls,
    }
    unexpected = [
        tool_name
        for tool_name in tool_names
        if tool_name
        and tool_name
        not in {
            expected_tool_name,
            "stationary_energy_list_review_options",
        }
    ]
    assert not unexpected, {
        "unexpected_tool_calls": unexpected,
        "all_tool_calls": turn.tool_calls,
    }
    matching_output = next(
        (
            output["output"]
            for output in reversed(turn.tool_outputs)
            if output["name"] == expected_tool_name
            or (
                isinstance(output["output"], dict)
                and output["output"].get("action") == expected_tool_name
            )
        ),
        None,
    )
    assert isinstance(matching_output, dict), {
        "expected_output_for": expected_tool_name,
        "tool_outputs": turn.tool_outputs,
    }
    return matching_output


def _write_artifact(name: str, payload: dict[str, Any]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / f"{name}.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False, default=str),
        encoding="utf-8",
    )


@pytest.mark.manual_llm
@pytest.mark.integration
@pytest.mark.slow
@pytest.mark.asyncio
async def test_live_llm_stages_single_focused_epe_source() -> None:
    async with _manual_review_harness() as harness:
        turn = await _run_live_turn(
            harness,
            user_message="i am okey with that one",
            extra_context={
                "stationary_energy_focused_proposal_id": harness.focused_proposal_id,
                "stationary_energy_focused_decision_state": {
                    "action": "accept",
                    "selected_option": {
                        "id": harness.focused_candidate_id,
                        "action": "accept",
                        "label": "EPE residential grid electricity 2023",
                        "short_label": "EPE residential 2023",
                        "selected_source_id": harness.focused_selected_source_id,
                        "recommended": True,
                    },
                },
            },
        )
        tool_output = _assert_expected_tool_call(
            turn,
            "stationary_energy_accept_one",
        )
        selections = await _active_staged_selections(harness)

        _write_artifact(
            "single_focused_epe_source",
            {
                "tool_calls": turn.tool_calls,
                "tool_outputs": turn.tool_outputs,
                "final_output": turn.final_output,
                "active_selections": [
                    {
                        "proposal_id": str(selection.proposal_id),
                        "selected_source_id": selection.selected_source_id,
                        "selected_candidate_id": str(selection.selected_candidate_id),
                        "action": selection.action,
                    }
                    for selection in selections
                ],
            },
        )

        assert tool_output["success"] is True
        assert len(selections) == 1
        selection = selections[0]
        assert str(selection.proposal_id) == harness.focused_proposal_id
        assert selection.selected_source_id == harness.focused_selected_source_id
        assert str(selection.selected_candidate_id) == harness.focused_candidate_id


@pytest.mark.manual_llm
@pytest.mark.integration
@pytest.mark.slow
@pytest.mark.asyncio
async def test_live_llm_previews_then_stages_all_epe_rows() -> None:
    async with _manual_review_harness() as harness:
        preview_turn = await _run_live_turn(
            harness,
            user_message="okey for all that have EPE as datasource just stage with this one",
        )
        preview_output = _assert_expected_tool_call(
            preview_turn,
            "stationary_energy_request_bulk_review_confirmation",
        )
        confirmed_choices = preview_output.get("pending_choices") or []
        apply_turn = await _run_live_turn(
            harness,
            user_message="yes",
            extra_context={
                "stationary_energy_confirmed_bulk_review_choices": confirmed_choices,
            },
        )
        apply_output = _assert_expected_tool_call(
            apply_turn,
            "stationary_energy_accept_multiple",
        )
        selections = await _active_staged_selections(harness)

        _write_artifact(
            "bulk_epe_rows",
            {
                "preview": {
                    "tool_calls": preview_turn.tool_calls,
                    "tool_outputs": preview_turn.tool_outputs,
                    "final_output": preview_turn.final_output,
                },
                "apply": {
                    "tool_calls": apply_turn.tool_calls,
                    "tool_outputs": apply_turn.tool_outputs,
                    "final_output": apply_turn.final_output,
                },
                "active_selections": [
                    {
                        "proposal_id": str(selection.proposal_id),
                        "selected_source_id": selection.selected_source_id,
                        "selected_candidate_id": str(selection.selected_candidate_id),
                        "action": selection.action,
                    }
                    for selection in selections
                ],
            },
        )

        assert preview_output["success"] is True
        assert {
            choice["proposal_id"] for choice in confirmed_choices if choice.get("proposal_id")
        } == set(harness.epe_proposal_ids)
        assert apply_output["success"] is True
        assert {str(selection.proposal_id) for selection in selections} == set(
            harness.epe_proposal_ids
        )


@pytest.mark.manual_llm
@pytest.mark.integration
@pytest.mark.slow
@pytest.mark.asyncio
async def test_live_llm_previews_remaining_best_choices_then_requests_inventory_save() -> None:
    async with _manual_review_harness() as harness:
        await _stage_recommended_choices(harness, harness.epe_proposal_ids)

        preview_turn = await _run_live_turn(
            harness,
            user_message="okey good now the rest just choose the best",
        )
        preview_output = _assert_expected_tool_call(
            preview_turn,
            "stationary_energy_request_all_recommended_confirmation",
        )
        confirmed_choices = preview_output.get("pending_choices") or []

        apply_turn = await _run_live_turn(
            harness,
            user_message="yes",
            extra_context={
                "stationary_energy_confirmed_bulk_review_choices": confirmed_choices,
            },
        )
        apply_output = _assert_expected_tool_call(
            apply_turn,
            "stationary_energy_accept_multiple",
        )

        save_turn = await _run_live_turn(
            harness,
            user_message="i am happy with that please save all to inventory",
        )
        save_output = _assert_expected_tool_call(
            save_turn,
            "stationary_energy_request_inventory_save_confirmation",
        )
        selections = await _active_staged_selections(harness)

        _write_artifact(
            "remaining_best_and_inventory_save",
            {
                "preview": {
                    "tool_calls": preview_turn.tool_calls,
                    "tool_outputs": preview_turn.tool_outputs,
                    "final_output": preview_turn.final_output,
                },
                "apply": {
                    "tool_calls": apply_turn.tool_calls,
                    "tool_outputs": apply_turn.tool_outputs,
                    "final_output": apply_turn.final_output,
                },
                "save": {
                    "tool_calls": save_turn.tool_calls,
                    "tool_outputs": save_turn.tool_outputs,
                    "final_output": save_turn.final_output,
                },
                "active_selections": [
                    {
                        "proposal_id": str(selection.proposal_id),
                        "selected_source_id": selection.selected_source_id,
                        "selected_candidate_id": str(selection.selected_candidate_id),
                        "action": selection.action,
                    }
                    for selection in selections
                ],
            },
        )

        assert preview_output["success"] is True
        assert {
            choice["proposal_id"] for choice in confirmed_choices if choice.get("proposal_id")
        } == set(harness.non_epe_proposal_ids)
        assert apply_output["success"] is True
        assert {str(selection.proposal_id) for selection in selections} == set(
            harness.epe_proposal_ids + harness.non_epe_proposal_ids
        )
        assert save_output["success"] is True
        assert (
            save_output["ui_event"]
            == "stationary_energy_inventory_save_confirmation_requested"
        )
