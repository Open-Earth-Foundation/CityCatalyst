"""Verify gap listing, stable handles, and the read-only gap lookup tool."""

import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from agents.tool import ToolContext
from app.services.cnb.ui_context import build_gap_list
from app.tools.concept_note_gap_tools import build_concept_note_gap_tools

START = datetime(2026, 9, 25, tzinfo=UTC)


def gap(minute, question, *, severity="critical", state="open"):
    return SimpleNamespace(
        gap_id=uuid4(),
        created_at=START + timedelta(minutes=minute),
        question=question,
        why_asking=f"Needed for {question}",
        severity=severity,
        state=state,
    )


def chapter(position, title, gaps, *, status="needs_review"):
    return SimpleNamespace(position=position, title=title, status=status, gaps=gaps)


def eucf_like_chapters():
    # Gaps are created out of document order to prove handles follow creation.
    return [
        chapter(2, "Political commitments", [gap(3, "Mitigation target")]),
        chapter(
            1,
            "Applicant",
            [
                gap(1, "Tax identification number"),
                gap(2, "Contact persons", severity="noncritical"),
                gap(4, "Population", state="resolved"),
            ],
        ),
        chapter(3, "Old chapter", [gap(0, "Removed question")], status="deleted"),
    ]


def test_lists_open_gaps_in_document_order_with_creation_handles():
    result = build_gap_list(eucf_like_chapters())
    assert result["open_total"] == 3
    assert [(row["gap"], row["chapter"], row["question"]) for row in result["gaps"]] == [
        ("G2", "Applicant", "Tax identification number"),
        ("G3", "Applicant", "Contact persons"),
        ("G4", "Political commitments", "Mitigation target"),
    ]
    first = result["gaps"][0]
    assert first == {
        "gap": "G2",
        "chapter_position": 1,
        "chapter": "Applicant",
        "question": "Tax identification number",
        "why_asking": "Needed for Tax identification number",
        "severity": "critical",
        "state": "open",
    }


def test_filters_keep_the_same_handles():
    chapters = eucf_like_chapters()
    critical = build_gap_list(chapters, severity="critical")
    assert [row["gap"] for row in critical["gaps"]] == ["G2", "G4"]
    political = build_gap_list(chapters, chapter_position=2)
    assert [row["gap"] for row in political["gaps"]] == ["G4"]
    with_closed = build_gap_list(chapters, chapter_position=1, include_closed=True)
    assert [(row["gap"], row["state"]) for row in with_closed["gaps"]] == [
        ("G2", "open"),
        ("G3", "open"),
        ("G5", "resolved"),
    ]
    # Totals describe the whole note, not the filtered slice.
    assert political["open_total"] == 3


def make_tool():
    return build_concept_note_gap_tools(
        session_factory=MagicMock(), run_id=uuid4(), user_id="owner"
    )[0]


async def invoke(tool, arguments):
    context = ToolContext(
        context=None,
        tool_call_id="gaps-1",
        tool_name=tool.name,
        tool_arguments=json.dumps(arguments),
    )
    return json.loads(await tool.on_invoke_tool(context, json.dumps(arguments)))


async def test_tool_reauthorizes_and_passes_filters():
    listing = {"gaps": [{"gap": "G1"}], "open_total": 1}
    with (
        patch(
            "app.tools.concept_note_gap_tools.load_agent_context",
            new=AsyncMock(return_value={}),
        ) as authorize,
        patch(
            "app.tools.concept_note_gap_tools.load_gap_list",
            new=AsyncMock(return_value=listing),
        ) as load,
    ):
        tool = make_tool()
        assert tool.name == "concept_note_gaps"
        result = await invoke(
            tool,
            {"chapter_position": 2, "severity": "critical", "include_closed": False},
        )
    assert result == {"success": True, **listing}
    authorize.assert_awaited_once()
    assert load.await_args.kwargs == {
        "chapter_position": 2,
        "severity": "critical",
        "include_closed": False,
    }


@pytest.mark.parametrize("failure", ["unauthorized", "storage"])
async def test_tool_reports_failures_instead_of_an_empty_list(failure):
    authorize = AsyncMock(return_value=None if failure == "unauthorized" else {})
    load = AsyncMock(side_effect=OSError("workspace down"))
    with (
        patch("app.tools.concept_note_gap_tools.load_agent_context", new=authorize),
        patch("app.tools.concept_note_gap_tools.load_gap_list", new=load),
    ):
        result = await invoke(make_tool(), {})
    assert result["success"] is False
    assert "gaps" not in result
    if failure == "unauthorized":
        load.assert_not_awaited()
