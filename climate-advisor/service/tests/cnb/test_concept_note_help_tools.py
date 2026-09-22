"""Verify lazy help reads, fresh state, and authorization boundaries."""

import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from agents.tool import ToolContext
from app.tools.concept_note_help_tools import build_concept_note_help_tools


def make_tool():
    return build_concept_note_help_tools(
        session_factory=MagicMock(), run_id=uuid4(), user_id="owner"
    )[0]


async def invoke(tool):
    context = ToolContext(
        context=None, tool_call_id="help-1", tool_name=tool.name, tool_arguments={}
    )
    return json.loads(await tool.on_invoke_tool(context, "{}"))


async def test_help_is_lazy_and_refreshes_state_on_each_call():
    with (
        patch(
            "app.tools.concept_note_help_tools.load_agent_context",
            new=AsyncMock(return_value={}),
        ) as authorize,
        patch(
            "app.tools.concept_note_help_tools.load_ui_state",
            new=AsyncMock(
                side_effect=[{"draft": {"exists": False}}, {"draft": {"exists": True}}]
            ),
        ) as state,
    ):
        tool = make_tool()
        authorize.assert_not_awaited()
        state.assert_not_awaited()
        assert tool.params_json_schema["properties"] == {}
        before = await invoke(tool)
        after = await invoke(tool)
    assert before["ui_state"]["draft"]["exists"] is False
    assert after["ui_state"]["draft"]["exists"] is True
    assert "Draft preview" in after["guide"]
    assert authorize.await_count == 2


@pytest.mark.parametrize("unavailable", [False, True])
async def test_help_never_reads_workspace_after_access_failure(unavailable):
    authorize = (
        AsyncMock(return_value=None)
        if unavailable
        else AsyncMock(side_effect=PermissionError("Not owned"))
    )
    with (
        patch("app.tools.concept_note_help_tools.load_agent_context", new=authorize),
        patch(
            "app.tools.concept_note_help_tools.load_ui_state", new=AsyncMock()
        ) as state,
    ):
        assert (await invoke(make_tool()))["success"] is False
    state.assert_not_awaited()


async def test_unavailable_workspace_keeps_guide_without_inventing_state():
    with (
        patch(
            "app.tools.concept_note_help_tools.load_agent_context",
            new=AsyncMock(return_value={}),
        ),
        patch(
            "app.tools.concept_note_help_tools.load_ui_state",
            new=AsyncMock(return_value=None),
        ),
    ):
        result = await invoke(make_tool())
    assert result["success"] is True
    assert result["ui_state"] is None
    assert "Upload file" in result["guide"]
