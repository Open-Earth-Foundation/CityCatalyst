"""Verify lazy help reads, fresh state, and authorization boundaries."""

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from agents.tool import ToolContext
from app.tools.concept_note_help_tools import build_concept_note_help_tools
from app.tools.concept_note_ui_labels import (
    UI_LABEL_KEYS,
    UI_LABELS,
    normalize_ui_locale,
)

FRONTEND_LOCALES = Path(__file__).resolve().parents[4] / "app/src/i18n/locales"


def make_tool(ui_locale=None):
    return build_concept_note_help_tools(
        session_factory=MagicMock(),
        run_id=uuid4(),
        user_id="owner",
        ui_locale=ui_locale,
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


async def invoke_ready(ui_locale):
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
        return await invoke(make_tool(ui_locale))


async def test_portuguese_ui_gets_portuguese_navigation_labels():
    """Answers must name the controls Portuguese users actually see."""
    result = await invoke_ready("pt")
    guide = result["guide"]
    assert result["ui_locale"] == "pt"
    assert '"Visualização do rascunho"' in guide
    assert '"Os seus arquivos" → "Carregar arquivo"' in guide
    assert '"Exportar PDF"' in guide
    assert '"Draft preview"' not in guide
    assert '"Upload file"' not in guide


@pytest.mark.parametrize("ui_locale", ["en", None, "xx", "en-GB"])
async def test_english_and_unsupported_locales_keep_english_labels(ui_locale):
    result = await invoke_ready(ui_locale)
    assert result["ui_locale"] == "en"
    assert '"Draft preview"' in result["guide"]
    assert '"Your files" → "Upload file"' in result["guide"]
    assert '"Export PDF" / "Export DOCX"' in result["guide"]


def test_locale_tags_normalize_to_supported_languages():
    assert normalize_ui_locale("pt-BR") == "pt"
    assert normalize_ui_locale(" PT_br ") == "pt"
    assert normalize_ui_locale(42) == "en"


@pytest.mark.parametrize("ui_locale", sorted(UI_LABELS))
def test_labels_match_frontend_translations(ui_locale):
    """Guard against drift between the guide and the rendered CNB controls."""
    path = FRONTEND_LOCALES / ui_locale / "concept-notes.json"
    if not path.exists():
        pytest.skip("Frontend locales are not available in this checkout")
    translations = json.loads(path.read_text(encoding="utf-8"))
    expected = {
        name: (
            translations[key].replace("{{format}}", value)
            if value
            else translations[key]
        )
        for name, (key, value) in UI_LABEL_KEYS.items()
    }
    assert UI_LABELS[ui_locale] == expected


async def test_help_lists_uploaded_files_with_the_newest_flagged():
    context = {
        "selected_sources": [
            {
                "source_index": 1,
                "filename": "brief.pdf",
                "uploaded_at": "2026-09-25T03:27:42+00:00",
                "newest": False,
                "summary": "Not repeated in help.",
            },
            {
                "source_index": 2,
                "filename": "plan.pdf",
                "uploaded_at": "2026-09-25T04:00:07+00:00",
                "newest": True,
                "summary": "Not repeated in help.",
            },
        ]
    }
    with (
        patch(
            "app.tools.concept_note_help_tools.load_agent_context",
            new=AsyncMock(return_value=context),
        ),
        patch(
            "app.tools.concept_note_help_tools.load_ui_state",
            new=AsyncMock(return_value={"draft": {"exists": True}}),
        ),
    ):
        result = await invoke(make_tool())
    assert result["uploaded_files"] == [
        {
            "source_index": 1,
            "filename": "brief.pdf",
            "uploaded_at": "2026-09-25T03:27:42+00:00",
            "newest": False,
        },
        {
            "source_index": 2,
            "filename": "plan.pdf",
            "uploaded_at": "2026-09-25T04:00:07+00:00",
            "newest": True,
        },
    ]
