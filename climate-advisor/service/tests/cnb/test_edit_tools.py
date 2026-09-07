from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from agents import RunConfig
from agents.tool_context import ToolContext
from app.tools.concept_note_edit_tools import build_concept_note_edit_tools
from fastapi import HTTPException
from tests.cnb.edit_helpers import RUN_ID, request
from tests.cnb.edit_helpers import edit_database as edit_database


def build_tools(sessions, token="synthetic", recent_messages=None):
    return build_concept_note_edit_tools(
        session_factory=sessions,
        run_id=RUN_ID,
        user_id="owner",
        token_ref={"value": token},
        request=request(),
        recent_messages=recent_messages,
    )


def tool_context() -> ToolContext:
    return ToolContext(
        context=None,
        tool_name="concept_note_edit_propose",
        tool_call_id="call-edit",
        tool_arguments="{}",
        run_config=RunConfig(tracing_disabled=True, trace_include_sensitive_data=False),
    )


async def test_agent_capability_contains_no_apply_undo_or_restore(
    edit_database,
) -> None:
    [tool] = build_tools(edit_database)
    assert tool.name == "concept_note_edit_propose"
    assert tool.params_json_schema["properties"] == {}
    description = " ".join(tool.description.split())
    assert "NEVER applies" in description
    assert "ask the returned clarification directly in chat" in description
    assert "Never refer to a proposal or clarification card" in description


async def test_missing_token_and_unavailable_service_fail_closed(
    edit_database, monkeypatch
) -> None:
    [tool] = build_tools(edit_database, token=None)
    result = json.loads(await tool.on_invoke_tool(tool_context(), "{}"))
    assert result["error_code"] == "missing_token" and not result["success"]
    monkeypatch.setattr(
        "app.tools.concept_note_edit_tools.get_edit_service", lambda: None
    )
    [tool] = build_tools(edit_database)
    assert (
        json.loads(await tool.on_invoke_tool(tool_context(), "{}"))["error_code"]
        == "edit_unavailable"
    )


async def test_tool_reauthorizes_and_delivers_only_typed_proposal_metadata(
    edit_database, monkeypatch
) -> None:
    proposal_id = uuid4()
    propose = AsyncMock(
        return_value=SimpleNamespace(
            proposal_id=proposal_id,
            status="proposed",
            clarification=None,
            instruction="private",
        )
    )
    authorized = AsyncMock(return_value=SimpleNamespace(run_id=RUN_ID, user_id="owner"))
    close = AsyncMock()
    monkeypatch.setattr(
        "app.tools.concept_note_edit_tools.get_edit_service",
        lambda: SimpleNamespace(propose=propose),
    )
    monkeypatch.setattr(
        "app.tools.concept_note_edit_tools.ConceptNoteRunService",
        lambda session: SimpleNamespace(
            get_authorized_run=authorized, cc_client=SimpleNamespace(close=close)
        ),
    )
    monkeypatch.setattr(
        "app.tools.concept_note_edit_tools.load_edit_context",
        AsyncMock(return_value={}),
    )
    recent_messages = [{"role": "user", "content": "earlier request"}]
    [tool] = build_tools(edit_database, recent_messages=recent_messages)
    raw = await tool.on_invoke_tool(tool_context(), "{}")
    result = json.loads(raw)
    assert result["data"] == {
        "proposal_id": str(proposal_id),
        "run_id": str(RUN_ID),
        "status": "proposed",
    }
    assert "private" not in raw and "synthetic" not in raw
    assert authorized.call_args.kwargs["requested_user_id"] == "owner"
    assert propose.await_args.kwargs["recent_messages"] == recent_messages
    assert close.await_count == 1


async def test_tool_returns_clarification_for_the_chat_to_ask_directly(
    edit_database, monkeypatch
) -> None:
    proposal_id = uuid4()
    clarification = "Which chapter should be changed?"
    monkeypatch.setattr(
        "app.tools.concept_note_edit_tools.get_edit_service",
        lambda: SimpleNamespace(
            propose=AsyncMock(
                return_value=SimpleNamespace(
                    proposal_id=proposal_id,
                    status="clarification_required",
                    clarification=clarification,
                    error_code=None,
                )
            )
        ),
    )
    monkeypatch.setattr(
        "app.tools.concept_note_edit_tools.ConceptNoteRunService",
        lambda session: SimpleNamespace(
            get_authorized_run=AsyncMock(
                return_value=SimpleNamespace(run_id=RUN_ID, user_id="owner")
            ),
            cc_client=SimpleNamespace(close=AsyncMock()),
        ),
    )
    monkeypatch.setattr(
        "app.tools.concept_note_edit_tools.load_edit_context",
        AsyncMock(return_value={}),
    )

    [tool] = build_tools(edit_database)
    result = json.loads(await tool.on_invoke_tool(tool_context(), "{}"))

    assert result["success"]
    assert result["data"] == {
        "proposal_id": str(proposal_id),
        "run_id": str(RUN_ID),
        "status": "clarification_required",
        "clarification": clarification,
    }


@pytest.mark.parametrize("status", [401, 403, 404, 503])
async def test_tool_does_not_expose_foreign_run_or_backend_errors(
    edit_database, monkeypatch, status
) -> None:
    monkeypatch.setattr(
        "app.tools.concept_note_edit_tools.get_edit_service",
        lambda: SimpleNamespace(propose=AsyncMock()),
    )
    authorize = AsyncMock(side_effect=HTTPException(status, "private details"))
    monkeypatch.setattr(
        "app.tools.concept_note_edit_tools.ConceptNoteRunService",
        lambda session: SimpleNamespace(
            get_authorized_run=authorize, cc_client=SimpleNamespace(close=AsyncMock())
        ),
    )
    [tool] = build_tools(edit_database)
    raw = await tool.on_invoke_tool(tool_context(), "{}")
    result = json.loads(raw)
    assert not result["success"]
    assert result["error_code"] == (
        "expired_token"
        if status == 401
        else "edit_forbidden"
        if status in {403, 404}
        else "edit_unavailable"
    )
    assert "private details" not in raw
