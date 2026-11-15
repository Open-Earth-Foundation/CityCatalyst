"""Authorization and model-facing boundaries of the shared document tools."""

import json
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from agents.tool_context import ToolContext
from fastapi import HTTPException

from app.models.document_workspace.contracts import DocumentPointQuestion
from app.tools.document_workspace_tools import build_document_workspace_tools


@pytest.fixture
def tools(monkeypatch):
    run_id = uuid4()
    authorize = AsyncMock(return_value=SimpleNamespace(run_id=run_id))
    close = AsyncMock()
    factory_calls = []

    @asynccontextmanager
    async def session_factory():
        yield object()

    def run_service(session, *, cc_client):
        return SimpleNamespace(get_authorized_run=authorize)

    workspace = SimpleNamespace(
        setup=SimpleNamespace(name="Climate action plan"),
        points=[],
        needs=[],
        overview=SimpleNamespace(
            required_total=1,
            required_covered=0,
            optional_total=0,
            optional_covered=0,
            waiting_count=0,
        ),
        export_eligibility=SimpleNamespace(final=False, blockers=["Target missing"]),
    )
    shared = SimpleNamespace(
        load=AsyncMock(return_value=workspace),
        question=AsyncMock(
            return_value=DocumentPointQuestion(
                pattern="short_form",
                why_asking="The plan needs an approved target.",
                questions=[
                    {"question": "What target did the council adopt?", "options": []}
                ],
            )
        ),
        command=AsyncMock(),
    )

    def get_service():
        factory_calls.append(True)
        return shared

    monkeypatch.setattr(
        "app.tools.document_workspace_tools.ConceptNoteRunService", run_service
    )
    monkeypatch.setattr(
        "app.tools.document_workspace_tools.CityCatalystClient",
        lambda **kw: SimpleNamespace(close=close),
    )
    monkeypatch.setattr(
        "app.tools.document_workspace_tools.get_document_workspace_service", get_service
    )
    token_ref = {"value": "test-token"}
    registered = build_document_workspace_tools(
        session_factory=session_factory,
        run_id=run_id,
        user_id="owner",
        token_ref=token_ref,
    )
    return SimpleNamespace(
        registered={tool.name: tool for tool in registered},
        authorize=authorize,
        shared=shared,
        close=close,
        run_id=run_id,
        token_ref=token_ref,
        workspace=workspace,
        factory_calls=factory_calls,
    )


async def invoke(tool, args=None):
    arguments = json.dumps(args or {})
    context = ToolContext(
        context=None,
        tool_name=tool.name,
        tool_call_id="workspace-call",
        tool_arguments=arguments,
    )
    return json.loads(await tool.on_invoke_tool(context, arguments))


async def test_points_are_available_before_drafting_and_reauthorize_every_read(tools):
    first = await invoke(tools.registered["document_workspace_points"])
    second = await invoke(tools.registered["document_workspace_points"])
    assert first == second
    assert first["data"]["coverage"]["required_covered"] == 0
    assert first["data"]["final_export_ready"] is False
    assert tools.authorize.await_count == 2
    tools.authorize.assert_awaited_with(
        run_id=tools.run_id,
        requested_user_id="owner",
        authorization="Bearer test-token",
    )
    assert tools.close.await_count == 2
    tools.shared.command.assert_not_awaited()


async def test_revoked_access_does_not_return_cached_document_state(tools):
    await invoke(tools.registered["document_workspace_points"])
    tools.authorize.side_effect = HTTPException(404, "private document")
    result = await invoke(tools.registered["document_workspace_points"])
    assert result["success"] is False
    assert result["error_code"] == "document_workspace_access_denied"
    assert tools.shared.load.await_count == 1
    assert "private document" not in json.dumps(result)


async def test_missing_credential_never_opens_document_storage(tools):
    tools.token_ref["value"] = None
    result = await invoke(tools.registered["document_workspace_points"])
    assert result["error_code"] == "missing_token"
    assert not tools.factory_calls
    tools.authorize.assert_not_awaited()


async def test_point_guidance_uses_shared_service_and_never_saves_a_decision(tools):
    tools.workspace.points = [SimpleNamespace(key="targets.reduction")]
    result = await invoke(
        tools.registered["document_workspace_question"],
        {"point_key": "targets.reduction"},
    )
    assert result["action"] == "document_workspace.open_point"
    assert result["data"]["point_key"] == "targets.reduction"
    assert result["data"]["question"]["pattern"] == "short_form"
    tools.shared.question.assert_awaited_once_with(
        tools.authorize.return_value, "targets.reduction", language="en"
    )
    tools.shared.command.assert_not_awaited()
    assert str(tools.run_id) not in json.dumps(result)


async def test_unknown_point_cannot_open_another_resource(tools):
    result = await invoke(
        tools.registered["document_workspace_question"], {"point_key": "other.resource"}
    )
    assert result["error_code"] == "point_not_found"
    tools.shared.question.assert_not_awaited()


async def test_factory_failure_is_recoverable_without_exception_details(
    tools, monkeypatch
):
    def unavailable():
        raise RuntimeError("private database configuration")

    monkeypatch.setattr(
        "app.tools.document_workspace_tools.get_document_workspace_service", unavailable
    )
    result = await invoke(tools.registered["document_workspace_points"])
    assert result["success"] is False
    assert "private database" not in json.dumps(result)
