"""Exercise agent selections against exact snapshots and protected draft content."""

from dataclasses import replace
from uuid import uuid4

import pytest

from app.config.settings import CnbEditPromptBudgetConfig
from app.models.cnb.concept_note_edits import DraftReplacement, EditProposalRequest
from app.persistence.concept_notes.edits import replace_anchors
from app.persistence.concept_notes.workspace_snapshots import WorkspaceChapterSnapshot
from app.services.cnb.edit_session import DraftEditSession
from tests.cnb.gap_edit_helpers import (
    chapter_snapshot as chapter,
    gap_snapshot as gap,
)


def session(
    chapters: list[WorkspaceChapterSnapshot],
    instruction: str = "Replace Kraków with Cracow.",
    max_searches: int = CnbEditPromptBudgetConfig().max_searches,
) -> DraftEditSession:
    return DraftEditSession(
        EditProposalRequest(instruction=instruction, idempotency_key=uuid4()),
        chapters,
        {},
        [],
        max_searches=max_searches,
    )


def replacement(search_id: str, text: str = "Cracow", **kwargs) -> DraftReplacement:
    return DraftReplacement(
        search_id=search_id,
        replacement=text,
        kind="wording",
        group_id="rename",
        **kwargs,
    )


def replacement_for(search_id: str, text: str, **kwargs) -> DraftReplacement:
    """A factual replacement for one gap-marker search, with exact provenance."""
    values = {"kind": "factual", "group_id": "gap", **kwargs}
    return DraftReplacement(search_id=search_id, replacement=text, **values)


def propose_one(edits: DraftEditSession, search: str, text: str, **kwargs) -> dict:
    """Search the draft for ``search`` and propose one factual replacement for it."""
    found = edits.search_draft(search)
    return edits.propose_edits([replacement_for(found["search_id"], text, **kwargs)])


def test_ambiguous_replacement_can_be_repaired_using_an_exact_match_id():
    current = chapter("🌍 Kraków and Kraków.")
    edits = session([current])
    found = edits.search_draft("Kraków")
    rejected = edits.propose_edits([replacement(found["search_id"])])
    assert rejected["code"] == "ambiguous_match"
    assert edits.plan is None
    accepted = edits.propose_edits(
        [replacement(found["search_id"], match_ids=[found["matches"][1]["match_id"]])]
    )
    assert accepted["ok"]
    assert edits.plan.changes[0].start == 13
    assert (
        replace_anchors(current.body_markdown, edits.plan.changes)
        == "🌍 Kraków and Cracow."
    )
    assert current.body_markdown == "🌍 Kraków and Kraków."


@pytest.mark.parametrize("max_searches", [2, 100])
def test_configured_search_budget_allows_exactly_the_limit(max_searches: int) -> None:
    edits = session([chapter("Kraków")], max_searches=max_searches)
    assert edits.search_draft("")["code"] == "invalid_search"
    for _ in range(max_searches):
        assert edits.search_draft("Kraków")["ok"]
    assert edits.search_draft("Kraków")["code"] == "context_limit"


def test_replace_all_preserves_markers_headings_and_locked_chapters_with_counts():
    current = chapter("# Kraków\nKraków. [Information needed: Kraków budget] Kraków.")
    other = chapter("Kraków and Kraków.", 1)
    locked = replace(chapter("Kraków", 2), user_locked=True)
    edits = session([current, other, locked])
    found = edits.search_draft("Kraków")
    result = edits.propose_edits([replacement(found["search_id"], replace_all=True)])
    assert result["ok"] and result["changes"] == 4 and result["chapters"] == 2
    assert {n["code"]: n["count"] for n in result["notices"]} == {
        "protected_markers": 1,
        "template_headings": 1,
        "locked_chapters": 1,
    }
    for target, expected in [
        (current, "# Kraków\nCracow. [Information needed: Kraków budget] Cracow."),
        (other, "Cracow and Cracow."),
    ]:
        changes = [c for c in edits.plan.changes if c.chapter_id == target.chapter_id]
        assert replace_anchors(target.body_markdown, changes) == expected
    assert current.body_markdown == (
        "# Kraków\nKraków. [Information needed: Kraków budget] Kraków."
    )
    assert other.body_markdown == "Kraków and Kraków."
    assert locked.body_markdown == "Kraków"


def test_invalid_correction_clears_previous_candidate_and_overlaps_fail_early():
    edits = session([chapter("Kraków")])
    found = edits.search_draft("Kraków")
    one = replacement(found["search_id"])
    assert edits.propose_edits([one])["ok"]
    assert not edits.propose_edits([one, one])["ok"]
    assert edits.plan is None


def test_partial_marker_edit_is_rejected_but_complete_gap_fill_is_supported():
    current = chapter("Budget: [Information needed: confirmed budget]")
    current.gaps.append(gap("confirmed budget"))
    edits = session([current], "The confirmed budget is EUR 10 million.")
    partial = edits.search_draft("confirmed budget")
    assert (
        edits.propose_edits([replacement(partial["search_id"], "approved budget")])[
            "code"
        ]
        == "protected_markers"
    )
    whole = edits.search_draft("[Information needed: confirmed budget]")
    assert edits.propose_edits(
        [
            replacement(
                whole["search_id"], "EUR 10 million", user_input_quote="EUR 10 million"
            )
        ]
    )["ok"]
    assert (
        replace_anchors(current.body_markdown, edits.plan.changes)
        == "Budget: EUR 10 million"
    )


def test_a_reformatted_or_wrapped_marker_is_filled_through_its_gap_record():
    marker = "[Information needed: **What is the\nconfirmed budget**]"
    current = chapter(f"Budget: {marker}")
    current.gaps.append(gap("What is the confirmed budget?"))
    edits = session([current], "The confirmed budget is EUR 10 million.")
    found = edits.search_draft(marker)
    assert edits.propose_edits(
        [
            replacement(
                found["search_id"], "EUR 10 million", user_input_quote="EUR 10 million"
            )
        ]
    )["ok"]
    assert (
        replace_anchors(current.body_markdown, edits.plan.changes)
        == "Budget: EUR 10 million"
    )


@pytest.mark.parametrize(
    "before,after,expected",
    [
        (
            "Kraków is warm. Kraków is cold.",
            "Kraków is warm. Cracow is cold.",
            ("Kraków", "Cracow"),
        ),
        ("Budget: 10 schools.", "Budget: 14 schools.", ("10", "14")),
        ("A B", "A new B", (" ", " new ")),
        ("Keep. Remove.", "Keep.", (" Remove.", "")),
        (
            "The opening date is 1.0.1.2029; no critical path.",
            "The opening date is 1 January 2029; no critical path.",
            ("1.0.1.2029", "1 January 2029"),
        ),
        ("Cost: 1,200 EUR.", "Cost: 1,500 EUR.", ("1,200", "1,500")),
        ("Opens 2029. Next.", "Opens 2030. Next.", ("2029", "2030")),
    ],
)
def test_context_trimming_preserves_the_requested_replacement(before, after, expected):
    current = chapter(before)
    edits = session([current])
    found = edits.search_draft(before)
    assert edits.propose_edits([replacement(found["search_id"], after)])["ok"]
    assert (edits.plan.changes[0].before, edits.plan.changes[0].after) == expected
    assert replace_anchors(before, edits.plan.changes) == after


def test_search_ids_and_match_ids_cannot_be_reused_across_other_searches():
    edits = session([chapter("Kraków and Warsaw")])
    first = edits.search_draft("Kraków")
    second = edits.search_draft("Warsaw")
    assert (
        edits.propose_edits(
            [
                replacement(
                    second["search_id"], match_ids=[first["matches"][0]["match_id"]]
                )
            ]
        )["code"]
        == "invalid_selection"
    )
    assert edits.propose_edits([replacement("invented")])["code"] == "invalid_search"


@pytest.mark.parametrize(
    ("body", "search", "replacement", "extra_gaps", "code"),
    [
        (
            "Finance: [Information needed: Confirm the instrument and amount.]",
            "[Information needed: Confirm the instrument and amount.]",
            "The city will use stormwater utility funds. [Information needed: What amount will the city contribute?]",
            [],
            None,
        ),
        (
            "Finance: [Information needed: Confirm the instrument and amount.]",
            "[Information needed: Confirm the instrument and amount.]",
            "[Information needed: What amount will the city contribute?]",
            [],
            "protected_markers",
        ),
        (
            "Finance: [Information needed: Confirm the instrument and amount.]",
            "[Information needed: Confirm the instrument and amount.]",
            "Stormwater funds. [Information needed: What amount?] [Information needed: Who signs?]",
            [],
            "protected_markers",
        ),
        (
            "Finance: [Information needed: Confirm the instrument and amount.] Other [Information needed: Who signs?]",
            "[Information needed: Confirm the instrument and amount.] Other",
            "Stormwater funds. [Information needed: What amount?] Other",
            [],
            "protected_markers",
        ),
        (
            "Finance: [Information needed: Confirm the instrument and amount.]",
            "[Information needed: Confirm the instrument and amount.]",
            "Stormwater funds. [Information needed: Who signs?]",
            ["Who signs?"],
            "protected_markers",
        ),
        (
            "Finance: [Information needed: Confirm the instrument and amount.]",
            "[Information needed: Confirm the instrument and amount.]",
            "Stormwater funds. Information needed: What amount?]",
            [],
            "protected_markers",
        ),
        (
            "Finance: [Information needed: Confirm the instrument and amount.]",
            "[Information needed: Confirm the instrument and amount.]",
            "Stormwater funds. [Information needed: What amount?]",
            "untracked",
            "protected_markers",
        ),
    ],
)
def test_partial_gap_change_requires_one_exact_new_marker_and_factual_prose(
    body, search, replacement, extra_gaps, code
) -> None:
    """A narrowing keeps exactly one new marker and only the changed marker's anchor."""
    current = chapter(body)
    if extra_gaps != "untracked":
        current.gaps.append(gap("Confirm the instrument and amount."))
        for question in extra_gaps:
            current.gaps.append(gap(question))
    edits = session([current], "The city will use stormwater utility funds.")
    result = propose_one(
        edits,
        search,
        replacement,
        user_input_quote="The city will use stormwater utility funds",
    )
    if code is None:
        assert result["ok"], result
        [change] = edits.plan.changes
        assert change.start == body.index(search)
        assert replace_anchors(body, edits.plan.changes) == body.replace(
            search, replacement
        )
    else:
        # A marker edit that is not an exact, bound transition stays protected.
        assert not result["ok"]
        assert result["code"] == code


def test_a_plain_edit_may_not_introduce_a_broken_or_new_marker() -> None:
    """Outside a gap transition, no replacement may add a marker or a broken prefix."""
    current = chapter("Finance: the budget is open.")
    edits = session([current], "The budget is open.")
    broken = propose_one(
        edits, "Finance:", "Finance: [Information needed: budget", kind="wording"
    )
    assert not broken["ok"] and broken["code"] == "marker_changed"
    assert edits.plan is None


def test_locked_target_marker_is_never_a_gap_transition() -> None:
    current = replace(
        chapter("Finance: [Information needed: Confirm the amount.]"),
        user_locked=True,
    )
    current.gaps.append(gap("Confirm the amount."))
    edits = session([current], "The amount is EUR 2 million.")
    result = propose_one(
        edits,
        "[Information needed: Confirm the amount.]",
        "EUR 2 million",
        user_input_quote="EUR 2 million",
    )
    assert result["code"] == "locked_chapters"


def test_same_gap_marker_duplicates_are_an_atomic_group() -> None:
    marker = "[Information needed: Who signs?]"
    current = chapter(f"A {marker} and B {marker}")
    current.gaps.append(gap("Who signs?"))
    edits = session([current], "The Mayor signs.")
    found = edits.search_draft(marker)
    partial = edits.propose_edits(
        [
            replacement_for(
                found["search_id"],
                "The Mayor signs.",
                match_ids=[found["matches"][0]["match_id"]],
                user_input_quote="The Mayor signs.",
            )
        ]
    )
    assert not partial["ok"] and partial["code"] == "marker_changed"
    complete = edits.propose_edits(
        [
            replacement_for(
                found["search_id"],
                "The Mayor signs.",
                replace_all=True,
                user_input_quote="The Mayor signs.",
            )
        ]
    )
    assert complete["ok"], complete
    assert replace_anchors(current.body_markdown, edits.plan.changes) == (
        "A The Mayor signs. and B The Mayor signs."
    )


def test_saved_gap_quote_rejects_cross_gap_then_accepts_valid_same_gap_retry() -> None:
    """A saved answer from another gap is refused whole, then the same-gap edit lands."""
    location = "[Information needed: Confirm the project location.]"
    phase = "[Information needed: Confirm the current phase and outcomes.]"
    saved = "The grant funds planning and design."
    body = f"Location: {location} Phase: {phase}"
    current = chapter(body)
    current.gaps.append(gap("Confirm the project location."))
    current.gaps.append(gap("Confirm the current phase and outcomes.", answered=saved))
    edits = session([current], "Update the chapter.")
    location_search = edits.search_draft(location)["search_id"]
    phase_search = edits.search_draft(phase)["search_id"]

    # The location edit quotes the phase gap's saved answer, so it is refused first.
    cross_gap = edits.propose_edits(
        [
            replacement_for(
                location_search,
                "The site is on Lake Street.",
                user_input_quote=saved,
            ),
            replacement_for(
                phase_search,
                f"{saved} [Information needed: What measurable outcomes will the phase deliver?]",
                user_input_quote=saved,
            ),
        ]
    )
    assert not cross_gap["ok"]
    assert cross_gap["code"] == "invalid_user_input"
    assert cross_gap["operation_index"] == 0
    assert edits.plan is None
    assert saved not in cross_gap["message"] + cross_gap["recovery"]
    assert "Omit this operation" in cross_gap["recovery"]

    # The retry omits the unsupported location edit and keeps only the same-gap phase edit.
    retry = edits.propose_edits(
        [
            replacement_for(
                phase_search,
                f"{saved} [Information needed: What measurable outcomes will the phase deliver?]",
                user_input_quote=saved,
            )
        ]
    )
    assert retry["ok"], retry
    [change] = edits.plan.changes
    assert change.before == phase
    result = replace_anchors(body, edits.plan.changes)
    assert location in result
    assert result.startswith(f"Location: {location} Phase: {saved}")


@pytest.mark.parametrize(("length", "accepted"), [(2000, True), (2001, False)])
def test_overlong_new_remainder_is_rejected_before_review(length, accepted) -> None:
    """A narrowed question is capped at 2,000 characters before any model review."""
    marker = "[Information needed: Confirm the instrument and amount.]"
    current = chapter(f"Finance: {marker}")
    current.gaps.append(gap("Confirm the instrument and amount."))
    edits = session([current], "The city will use stormwater utility funds.")
    result = propose_one(
        edits,
        marker,
        f"The city will use stormwater utility funds. [Information needed: {'x' * length}]",
        user_input_quote="The city will use stormwater utility funds",
    )
    if accepted:
        assert result["ok"], result
        assert edits.plan is not None
    else:
        assert not result["ok"]
        assert result["code"] == "marker_changed"
        assert "at most 2,000 characters" in result["message"]
        assert edits.plan is None


