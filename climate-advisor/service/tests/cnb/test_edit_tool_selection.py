"""Opt-in live OpenRouter checks of CNB routing; tool bodies are never executed."""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from agents.tool import ToolContext
from app.models.cnb.concept_note_edits import EditProposalRequest, EditScope
from app.services.agent_service import AgentService
from app.tools.concept_note_edit_tools import build_concept_note_edit_tools

from app.config import get_settings


@pytest.mark.manual_llm
@pytest.mark.asyncio
@pytest.mark.parametrize(
    "instruction,edit_available,history,expected_tool",
    [
        (
            "Change the budget in my concept note from EUR 10 million to EUR 12 million.",
            True,
            [],
            "concept_note_edit_propose",
        ),
        (
            "Yes, make that change.",
            True,
            [
                {"role": "user", "content": "Can you shorten the opening paragraph?"},
                {
                    "role": "assistant",
                    "content": "I can propose a shorter opening while preserving its meaning.",
                },
            ],
            "concept_note_edit_propose",
        ),
        ("What is the budget currently written in my concept note?", True, [], None),
        (
            "Change the budget in my concept note from EUR 10 million to EUR 12 million.",
            False,
            [],
            None,
        ),
    ],
)
async def test_live_cnb_selects_proposal_tool_only_for_available_edit_requests(
    monkeypatch, instruction, edit_available, history, expected_tool
):
    settings = get_settings().model_copy(deep=True)
    if not settings.openrouter_api_key:
        pytest.skip("OPENROUTER_API_KEY is required for the opt-in live routing check")
    settings.langsmith_tracing_enabled = False
    monkeypatch.setattr("app.services.agent_service.get_settings", lambda: settings)
    context = {
        "workflow_step": "editing_document",
        "selected_sources": [],
        "document_context": {
            "title": "School renovation",
            "body_markdown": "The project budget is EUR 10 million.",
        },
    }
    monkeypatch.setattr(
        "app.services.agent_service.load_agent_context", AsyncMock(return_value=context)
    )
    service = AgentService(
        cc_access_token="synthetic-token",
        cc_user_id="synthetic-owner",
        concept_note_run_id=uuid4(),
        session_factory=AsyncMock(),
        concept_note_edit_request=EditProposalRequest(
            instruction=instruction, idempotency_key=uuid4()
        )
        if edit_available
        else None,
    )
    try:
        # Use the runtime prompt and tool schemas, but inspect selection without writes.
        agent = await service.create_agent()
        response = await service.client.chat.completions.create(
            model=service.cnb_chat_model,
            messages=[
                {"role": "system", "content": service.active_instructions},
                {
                    "role": "user",
                    "content": "CONCEPT_NOTE_CONTEXT_BUNDLE_JSON\n"
                    + json.dumps(context),
                },
                *history,
                {"role": "user", "content": instruction},
            ],
            tools=[
                {
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.params_json_schema,
                    },
                }
                for tool in agent.tools
            ],
            tool_choice="auto",
        )
        message = response.choices[0].message
        calls = message.tool_calls or []
        assert [call.function.name for call in calls] == (
            [expected_tool] if expected_tool else []
        )
        if expected_tool:
            assert json.loads(calls[0].function.arguments) == {}
        else:
            assert message.content
    finally:
        await service.close()


async def test_auto_scope_edit_request_reaches_the_service_unchanged(monkeypatch):
    """A gap-fact proposal with no gap ID is forwarded exactly as bound."""
    request = EditProposalRequest(
        instruction="The application will be submitted on 15 March 2027.",
        idempotency_key=uuid4(),
    )
    proposal = SimpleNamespace(
        proposal_id=uuid4(),
        status="proposed",
        changes=[],
        structure=None,
        notices=[],
        clarification=None,
        review_objections=[],
        error_code=None,
    )
    service = SimpleNamespace(propose=AsyncMock(return_value=proposal))
    monkeypatch.setattr(
        "app.tools.concept_note_edit_tools.get_edit_service", lambda: service
    )
    monkeypatch.setattr(
        "app.tools.concept_note_edit_tools.CityCatalystClient",
        MagicMock(return_value=SimpleNamespace(close=AsyncMock())),
    )
    run_service = SimpleNamespace(
        get_authorized_run=AsyncMock(return_value=SimpleNamespace()),
        cc_client=SimpleNamespace(close=AsyncMock()),
    )
    monkeypatch.setattr(
        "app.tools.concept_note_edit_tools.ConceptNoteRunService",
        MagicMock(return_value=run_service),
    )
    history = [{"role": "user", "content": "Earlier question"}]
    session_factory = MagicMock()
    session_factory.return_value.__aenter__ = AsyncMock(return_value=MagicMock())
    session_factory.return_value.__aexit__ = AsyncMock(return_value=False)
    tool = build_concept_note_edit_tools(
        session_factory=session_factory,
        run_id=uuid4(),
        user_id="owner",
        token_ref={"value": "token"},
        request=request,
        recent_messages=history,
    )[0]
    context = ToolContext(
        context=None, tool_call_id="edit-1", tool_name=tool.name, tool_arguments="{}"
    )
    await tool.on_invoke_tool(context, "{}")

    forwarded = service.propose.call_args
    # The bound request object is passed on as-is: auto scope, no gap ID, exact text.
    assert forwarded.args[1] is request
    assert request.scope == EditScope()
    assert request.instruction == (
        "The application will be submitted on 15 March 2027."
    )
    assert forwarded.kwargs["recent_messages"] == history


def _rendered(prompt_key: str) -> str:
    """Return the runtime prompt with wrapping collapsed for phrase assertions."""
    return " ".join(get_settings().llm.prompts.get_prompt(prompt_key).split())


def test_gap_edit_prompts_distinguish_related_partial_progress_and_full_coverage():
    planner = _rendered("cnb_chat_edit_planner")
    reviewer = _rendered("cnb_chat_edit_review")

    # Both sides share the same worked distinctions for partial and full coverage.
    for prompt in (planner, reviewer):
        assert "<partial_progress_examples>" in prompt
        assert "100% design plans and specifications" in prompt
        assert "Submit permit applications" in prompt
        assert "generic deliverable" in prompt
        assert "The city will use stormwater utility funds" in prompt
        assert "borrowing, levies, reserves and assessments" in prompt
        assert "not proof of availability or a documented match" in prompt
        assert "not proof of an appropriation" in prompt
        assert "county or city, phase and application scope" in prompt

    assert "A partial transition must be real progress." in planner
    assert (
        "repeats the question with the selected project or phase name is no partial "
        "transition" in planner
    )
    assert "Keep valid same-gap work and the exact marker" in planner

    assert "Mark a partial transition unsupported" in reviewer
    assert "repeats the question with the selected project or phase name" in reviewer
    assert "Mark a count requirement unsupported" in reviewer
    assert "Judge each change on its own resulting text." in reviewer


def test_financing_prompts_keep_unanswered_concept_and_phase_in_each_gap():
    planner = _rendered("cnb_chat_edit_planner")
    reviewer = _rendered("cnb_chat_edit_review")

    assert (
        "For each requirement of the original question, identify the evidence and verify "
        "that the resulting chapter states the answer." in planner
    )
    assert (
        "Ask directly for every uncovered requirement of that gap. A separate marker does "
        "not carry an uncovered requirement for this gap." in planner
    )
    assert (
        "A known concept or phase may identify a contribution in a remaining authorization "
        "question." in planner
    )
    assert "a site name does not select the design alternative or phase" in planner
    assert "<financing_two_round_example>" in planner
    assert "Round 2 states the alternative" in planner
    assert "Which phase is current" in planner

    assert (
        "When an original selection requirement remains unanswered and is omitted from the "
        'new marker, mark it unsupported with the objection "retain the selected concept in '
        'the remaining marker"' in reviewer
    )
    assert "do the same for the phase" in reviewer
    assert (
        '"For the selected project and current phase" provides context and leaves the values '
        "unanswered." in reviewer
    )
    assert (
        '"Confirm the selected concept and current project phase" requests both values.'
        in reviewer
    )
    assert (
        "Reject partial coverage if the new marker drops an uncovered requirement or asks "
        "for a requirement already answered in the resulting chapter." in reviewer
    )
    assert "In each explanation, name any missing original requirement" in reviewer


def test_financing_example_uses_fresh_fixture_facts_and_distinguishes_scope_from_demand():
    planner = _rendered("cnb_chat_edit_planner")
    reviewer = _rendered("cnb_chat_edit_review")

    # The Round 2 example uses the fresh fixture facts, not the older pond-retrofit wording.
    assert (
        "states the alternative (Wilson Pond Concept A), the phase (final design, permitting "
        "and construction), the amount (USD 2,500,000), and the timing (January 2027)"
        in planner
    )
    assert (
        "The user states that the stormwater utility will fund the contribution and that no "
        "borrowing, levy, reserve draw, assessment, or additional utility financing "
        "arrangement will be used." in planner
    )
    assert (
        "keep the contribution's proposed 2027 budget status and lack of adoption or "
        "authorization, and remove this marker." in planner
    )
    assert "the pond retrofit" not in planner
    assert "all five mechanisms" not in planner

    # A known concept and phase identify a referent, not a request.
    assert "For the selected project and current phase" in reviewer
    assert (
        "Confirm authorization of the contribution for Wilson Pond Concept A's final design phase"
        in reviewer
    )
    assert "uses the supported concept and phase as context" in reviewer
    assert (
        "asks for a requirement already answered in the resulting chapter" in reviewer
    )


def test_financing_prompts_distinguish_funding_source_and_mechanism_exclusions():
    planner = _rendered("cnb_chat_edit_planner")
    reviewer = _rendered("cnb_chat_edit_review")

    for prompt in (planner, reviewer):
        assert "A source alone rules out none of them" in prompt
        assert (
            "a mechanism answer is not evidence of formal adoption, a documented match or "
            "financial capability" in prompt
        )

    assert (
        "Reject a fill that treats a funding source, a proposed budget or a mechanism "
        "answer as formal adoption" in reviewer
    )
    assert (
        "Keep an unknown additional arrangement in the remaining marker only when the "
        "original question demands it." in planner
    )
    assert (
        'Do not write "adopted", "matched" or "committed" from these answers.' in planner
    )
    assert (
        'must keep "Which phase is current" and the selected alternative in its remaining '
        "marker, or be omitted." in planner
    )


def test_estimate_prompts_require_removing_stale_same_amount_marker_demand():
    planner = _rendered("cnb_chat_edit_planner")
    reviewer = _rendered("cnb_chat_edit_review")

    assert (
        "replace that anchored passage, including any stale qualifier such as "
        '"estimated", "about" or "roughly", with the confirmed amount' in planner
    )
    assert "give each its own replacement in the same candidate" in planner
    assert (
        "Remove or reconcile redundant old estimate prose in that chapter as a separate "
        "replacement" in planner
    )
    assert (
        "A marker-only rewrite that leaves the caveat unconfirmed is incomplete."
        in planner
    )
    assert (
        "[Information needed: What is the source of the local contribution?]" in planner
    )
    assert "Keep the rest unchanged." in planner

    assert (
        "When a same-subject confirmed amount replaces an adjacent estimate and a visible "
        "marker still explicitly asks to confirm that amount" in reviewer
    )
    assert "keep any independently uncovered field" in reviewer
    assert (
        "Judge a separate funding authorization or availability question on its own "
        "evidence." in reviewer
    )


def test_saved_answer_edit_prompts_repair_with_same_gap_quote():
    planner = _rendered("cnb_chat_edit_planner")
    chat = _rendered("cnb_chat")

    assert (
        "The changed gap's saved answers (`answered_so_far`) are user input for that "
        "gap only" in planner
    )
    assert "never for another chapter's or gap's change" in planner
    assert (
        "propose that same-gap change first, using the verbatim saved passage"
        in planner
    )
    assert (
        "returns invalid_user_input for a replacement that is not the user's requested "
        "change" in planner
    )
    assert (
        "remove only that replacement and any other replacement that relies on the same "
        "quote" in planner
    )
    assert (
        "Return clarification only when nothing grounded remains after that smaller "
        "attempt." in planner
    )
    assert (
        "Do not include an optional edit in another chapter whose quote is not available "
        "to its own gap." in planner
    )
    assert (
        "Do not ask the user to paste answers they already saved for a gap when the "
        "system can use them on that gap" in chat
    )
