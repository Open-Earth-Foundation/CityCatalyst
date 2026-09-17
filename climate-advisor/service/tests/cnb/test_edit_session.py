"""Exercise agent selections against exact snapshots and protected draft content."""

import json
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from app.models.cnb.concept_note_edits import DraftReplacement, EditProposalRequest
from app.persistence.concept_notes.edits import replace_anchors
from app.persistence.concept_notes.workspace import WorkspaceChapterSnapshot
from app.services.cnb.edit_session import DraftEditSession


def chapter(body: str, position: int = 0) -> WorkspaceChapterSnapshot:
    return WorkspaceChapterSnapshot(
        chapter_id=uuid4(),
        chapter_ref=None,
        title="Summary",
        position=position,
        status="needs_review",
        required=True,
        user_locked=False,
        body_markdown=body,
        revision_number=1,
    )


def session(
    chapters: list[WorkspaceChapterSnapshot],
    instruction: str = "Replace Kraków with Cracow.",
) -> DraftEditSession:
    return DraftEditSession(
        EditProposalRequest(instruction=instruction, idempotency_key=uuid4()),
        chapters,
        {},
        [],
    )


def replacement(search_id: str, text: str = "Cracow", **kwargs) -> DraftReplacement:
    return DraftReplacement(
        search_id=search_id,
        replacement=text,
        kind="wording",
        group_id="rename",
        **kwargs,
    )


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


def test_context_identifies_one_passage_but_review_highlights_only_changed_word():
    current = chapter("Kraków is warm. Kraków is cold.")
    edits = session([current])
    found = edits.search_draft("Kraków is cold.")
    assert edits.propose_edits([replacement(found["search_id"], "Cracow is cold.")])[
        "ok"
    ]
    change = edits.plan.changes[0]
    assert (change.start, change.before, change.after) == (16, "Kraków", "Cracow")


def test_replace_all_preserves_markers_headings_and_locked_chapters_with_counts():
    current = chapter("# Kraków\nKraków. [Information needed: Kraków budget] Kraków.")
    locked = replace(chapter("Kraków", 1), user_locked=True)
    edits = session([current, locked])
    found = edits.search_draft("Kraków")
    result = edits.propose_edits([replacement(found["search_id"], replace_all=True)])
    assert result["ok"] and result["changes"] == 2
    assert {n["code"]: n["count"] for n in result["notices"]} == {
        "protected_markers": 1,
        "template_headings": 1,
        "locked_chapters": 1,
    }
    assert (
        replace_anchors(current.body_markdown, edits.plan.changes)
        == "# Kraków\nCracow. [Information needed: Kraków budget] Cracow."
    )


def test_invalid_correction_clears_previous_candidate_and_overlaps_fail_early():
    edits = session([chapter("Kraków")])
    found = edits.search_draft("Kraków")
    one = replacement(found["search_id"])
    assert edits.propose_edits([one])["ok"]
    assert not edits.propose_edits([one, one])["ok"]
    assert edits.plan is None


def test_partial_marker_edit_is_rejected_but_complete_gap_fill_is_supported():
    current = chapter("Budget: [Information needed: confirmed budget]")
    current.gaps.append(SimpleNamespace(question="confirmed budget", state="open"))
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


@pytest.mark.parametrize(
    "before,after,expected",
    [
        ("Budget: 10 schools.", "Budget: 14 schools.", ("10", "14")),
        ("A B", "A new B", (" ", " new ")),
        ("Keep. Remove.", "Keep.", (" Remove.", "")),
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


def test_public_krakow_fixture_has_38_valid_replacements_and_55_protected_matches():
    fixture = json.loads(
        (Path(__file__).parents[3] / "fixtures/cnb/krakow/krakow-demo.json").read_text(
            encoding="utf8"
        )
    )
    revisions = fixture["cnb"]["concept_note_chapter_revisions"]
    chapters = []
    for item in fixture["cnb"]["concept_note_chapters"]:
        revision = max(
            (r for r in revisions if r["chapter_id"] == item["chapter_id"]),
            key=lambda r: r["revision_number"],
        )
        chapters.append(
            replace(
                chapter(revision["body_markdown"], item["position"]),
                chapter_id=UUID(item["chapter_id"]),
            )
        )
    edits = session(chapters)
    found = edits.search_draft("Kraków")
    assert found["total"] == 93
    result = edits.propose_edits([replacement(found["search_id"], replace_all=True)])
    assert result == {
        "ok": True,
        "changes": 38,
        "chapters": 12,
        "notices": [{"code": "protected_markers", "count": 55}],
    }
    for current in chapters:
        changes = [
            change
            for change in edits.plan.changes
            if change.chapter_id == current.chapter_id
        ]
        for change in changes:
            assert (
                current.body_markdown[change.start : change.start + len(change.before)]
                == change.before
            )
        updated = replace_anchors(current.body_markdown, changes)
        assert updated.count("Cracow") - current.body_markdown.count("Cracow") == len(
            changes
        )
