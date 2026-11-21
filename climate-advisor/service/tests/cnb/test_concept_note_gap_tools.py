"""Verify gap listing with the draft's numbers and the read-only gap lookup tool."""

import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from agents.tool import ToolContext
from app.services.cnb.ui_context import (
    UnknownChapterNumberError,
    build_gap_list,
    ui_gap_numbers,
)
from app.tools.concept_note_gap_tools import build_concept_note_gap_tools

START = datetime(2026, 9, 25, tzinfo=UTC)


def gap(
    minute,
    question,
    *,
    severity="critical",
    state="open",
    resolution=None,
    suggestions=(),
    answered_so_far=None,
):
    return SimpleNamespace(
        gap_id=uuid4(),
        created_at=START + timedelta(minutes=minute),
        question=question,
        why_asking=f"Needed for {question}",
        severity=severity,
        state=state,
        resolution=resolution,
        suggestions=list(suggestions),
        answered_so_far=answered_so_far,
    )


def chapter(position, title, gaps, *, status="needs_review", body=None):
    """Chapter snapshot; by default the body holds one marker per open gap."""
    if body is None:
        body = "\n\n".join(
            f"[Information needed: {item.question}]"
            for item in gaps
            if item.state in {"open", "processing"}
        )
    return SimpleNamespace(
        position=position, title=title, status=status, gaps=gaps, body_markdown=body
    )


def numbered(rows):
    return [(row["chapter_number"], row["gap_number"], row["question"]) for row in rows]


def test_open_gap_lists_the_answers_saved_so_far():
    saved = "1. Lead partner?\nLincoln Park Neighborhood Council"
    rows = build_gap_list(
        [chapter(0, "Delivery", [gap(1, "Lead partner", answered_so_far=saved)])]
    )["gaps"]
    # The chat can see what a teammate already saved in the gap form.
    assert rows[0]["answered_so_far"] == saved


def test_open_gap_lists_source_suggestions_with_their_sources():
    found = {"value": "PLN 1.92 billion", "source_refs": ["Investment_Plan"]}
    chapters = [
        chapter(
            1,
            "Financing",
            [
                gap(1, "Total cost", suggestions=[found]),
                gap(2, "Old cost", state="dismissed", suggestions=[found]),
            ],
        )
    ]
    rows = build_gap_list(chapters, include_closed=True)["gaps"]
    assert rows[0]["suggestions"] == [found]
    # Suggestions guide open work only; closed gaps don't repeat stale values.
    assert "suggestions" not in rows[1]


def eucf_like_chapters():
    """Positions after a structure save: active 0..2, the deleted one parked high."""
    return [
        chapter(1, "Political commitments", [gap(3, "Mitigation target")]),
        chapter(
            0,
            "Applicant",
            [
                gap(1, "Tax identification number"),
                gap(2, "Contact persons", severity="noncritical"),
                gap(
                    4,
                    "Population",
                    state="resolved",
                    # Source revalidation filled this gap from an uploaded file.
                    resolution=SimpleNamespace(
                        action="evidence_update", source_refs=["plan.pdf"]
                    ),
                ),
            ],
        ),
        chapter(2, "Budget", []),
        chapter(9, "Old chapter", [gap(0, "Removed question")], status="deleted"),
    ]


def test_lists_open_gaps_with_the_chapter_and_gap_numbers_the_draft_shows():
    result = build_gap_list(eucf_like_chapters())
    assert result["open_total"] == 3
    assert numbered(result["gaps"]) == [
        (1, 1, "Tax identification number"),
        (1, 2, "Contact persons"),
        (2, 1, "Mitigation target"),
    ]
    assert result["gaps"][0] == {
        "chapter_number": 1,
        "chapter": "Applicant",
        "gap_number": 1,
        "question": "Tax identification number",
        "why_asking": "Needed for Tax identification number",
        "severity": "critical",
        "label": "Required",
        "state": "open",
    }
    # The popover's words, not the stored severity names.
    assert [row["label"] for row in result["gaps"]] == [
        "Required",
        "Optional",
        "Required",
    ]
    # Internal creation-order handles are gone, so the agent cannot show them.
    assert "gap" not in result["gaps"][0]


def test_filters_by_chapter_number_severity_and_closed_state():
    chapters = eucf_like_chapters()
    political = build_gap_list(chapters, chapter_number=2)
    assert numbered(political["gaps"]) == [(2, 1, "Mitigation target")]
    # Totals describe the whole note, not the filtered slice.
    assert political["open_total"] == 3
    # A chapter that exists but is clear returns an empty, successful list.
    assert build_gap_list(chapters, chapter_number=3)["gaps"] == []
    optional = build_gap_list(chapters, severity="noncritical")
    assert numbered(optional["gaps"]) == [(1, 2, "Contact persons")]
    with_closed = build_gap_list(chapters, chapter_number=1, include_closed=True)
    assert [(row["gap_number"], row["state"]) for row in with_closed["gaps"]] == [
        (1, "open"),
        (2, "open"),
        (None, "resolved"),
    ]
    assert with_closed["gaps"][2]["filled_from"] == ["plan.pdf"]
    assert "filled_from" not in with_closed["gaps"][0]


@pytest.mark.parametrize("number", [0, 4, 10])
def test_unknown_chapter_number_names_the_valid_chapters(number):
    # 10 is the deleted chapter's parked position + 1; deleted chapters never count.
    with pytest.raises(UnknownChapterNumberError) as error:
        build_gap_list(eucf_like_chapters(), chapter_number=number)
    assert str(error.value) == (
        f'No chapter {number}. Chapters: 1 "Applicant", '
        '2 "Political commitments", 3 "Budget".'
    )


def test_gap_numbers_follow_marker_order_not_record_order():
    late = gap(5, "Asked first in the text")
    early = gap(1, "Asked second in the text")
    body = (
        "## Costs\n\n[Information needed: Asked first in the text]\n\n"
        "## Partners\n\n[information needed:  asked second in the text ]"
    )
    rows = build_gap_list([chapter(0, "Financing", [early, late], body=body)])["gaps"]
    assert numbered(rows) == [
        (1, 1, "Asked first in the text"),
        (1, 2, "Asked second in the text"),
    ]


def test_gap_numbers_count_markers_without_records_like_the_draft():
    """Mirror `chapterGapRows`: legacy markers take a number; unplaced gaps go last."""
    located = gap(1, "Where are the cells?")
    no_marker = gap(2, "Who maintains the cells?")
    punctuated = gap(3, "What is the budget.")
    closed = gap(4, "Old question", state="resolved")
    body = "\n\n".join(
        [
            "[Information needed: Where are the cells?]",
            # No record: the draft lists it as its own gap.
            "[Information needed: Who owns the schoolyards?]",
            # A closed gap's leftover marker gets no row of its own.
            "[Information needed: Old question]",
            # Differs from its record only by punctuation, so it pairs with it.
            "[Information needed: What is the budget]",
            "[Information needed: Where are the cells?]",
        ]
    )
    snapshot = chapter(
        2, "Components", [located, no_marker, punctuated, closed], body=body
    )
    assert ui_gap_numbers(snapshot) == {
        located.gap_id: 1,
        no_marker.gap_id: 4,
        punctuated.gap_id: 3,
    }
    rows = build_gap_list([snapshot])["gaps"]
    assert [(row["gap_number"], row["question"]) for row in rows] == [
        (1, "Where are the cells?"),
        (3, "What is the budget."),
        (4, "Who maintains the cells?"),
    ]


def test_gap_numbers_match_formatted_and_multiline_markers():
    """A formatted, wrapped marker pairs with its record, which is counted once."""
    paired = gap(1, "Who signs the annual report?")
    body = (
        "[Information needed: Legacy question with no record]\n\n"
        "[Information needed:  **Who signs the annual\nreport**?]"
    )
    snapshot = chapter(0, "Governance", [paired], body=body)
    assert ui_gap_numbers(snapshot) == {paired.gap_id: 2}
    result = build_gap_list([snapshot])
    assert numbered(result["gaps"]) == [(1, 2, "Who signs the annual report?")]
    assert result["open_total"] == 1


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


def test_tool_takes_the_ui_chapter_number():
    schema = make_tool().params_json_schema["properties"]
    assert set(schema) == {"chapter_number", "severity", "include_closed"}


async def test_tool_reauthorizes_and_passes_filters():
    listing = {"gaps": [{"chapter_number": 2, "gap_number": 1}], "open_total": 1}
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
            {"chapter_number": 2, "severity": "critical", "include_closed": False},
        )
    assert result == {"success": True, **listing}
    authorize.assert_awaited_once()
    assert load.await_args.kwargs == {
        "chapter_number": 2,
        "severity": "critical",
        "include_closed": False,
    }


async def test_tool_reports_an_unknown_chapter_number_with_the_valid_ones():
    error = UnknownChapterNumberError('No chapter 7. Chapters: 1 "Summary".')
    with (
        patch(
            "app.tools.concept_note_gap_tools.load_agent_context",
            new=AsyncMock(return_value={}),
        ),
        patch(
            "app.tools.concept_note_gap_tools.load_gap_list",
            new=AsyncMock(side_effect=error),
        ),
    ):
        result = await invoke(make_tool(), {"chapter_number": 7})
    assert result == {"success": False, "error": 'No chapter 7. Chapters: 1 "Summary".'}


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
