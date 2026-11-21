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
