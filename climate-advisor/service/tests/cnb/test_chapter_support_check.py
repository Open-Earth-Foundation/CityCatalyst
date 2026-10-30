"""Support check after drafting: safe application of revisions; no live model calls."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from app.models.cnb.concept_note_draft import (
    ChapterSupportReview,
    ChapterSupportRevision,
    ConceptNoteChapterDraftOutput,
    ConceptNoteDraftGapOutput,
)
from app.services.cnb import chapter_support_check as module
from app.services.cnb.chapter_drafting import draft_chapter

from app.config import Settings
from app.config.settings import _load_llm_config

MARKER_QUESTION = "Confirm the start date of the Riverside drainage project."
BODY = (
    "## Results\n\n"
    "All outputs will be reported annually.\n\n"
    "The plan covers 12 corridors.\n\n"
    f"[Information needed: {MARKER_QUESTION}]"
)
NEW_QUESTION = "Confirm whether the annual report will track the cooling centres."


def gap(question: str, key: str) -> ConceptNoteDraftGapOutput:
    return ConceptNoteDraftGapOutput(
        field_key=key, question=question, why_asking="Needed for the monitoring table.", severity="noncritical"
    )


def draft() -> ConceptNoteChapterDraftOutput:
    return ConceptNoteChapterDraftOutput(body_markdown=BODY, missing_information=[gap(MARKER_QUESTION, "start_date")])


def revision(before: str, after: str) -> ChapterSupportRevision:
    return ChapterSupportRevision(before=before, after=after, reason="Not stated by the inputs.")


def test_unsupported_claim_becomes_a_one_question_gap():
    review = ChapterSupportReview(
        revisions=[
            revision(
                "All outputs will be reported annually.",
                f"The annual report covers canopy cover. [Information needed: {NEW_QUESTION}]",
            )
        ],
        gaps=[gap(NEW_QUESTION, "cooling_centre_reporting")],
    )
    corrected, records = module.apply_support_review(draft(), review)
    assert "All outputs will be reported annually." not in corrected.body_markdown
    assert f"[Information needed: {NEW_QUESTION}]" in corrected.body_markdown
    assert [g.field_key for g in corrected.missing_information] == ["start_date", "cooling_centre_reporting"]
    assert records[0]["applied"] and records[0]["skipped"] is None
    assert "The plan covers 12 corridors." in corrected.body_markdown  # supported text untouched


@pytest.mark.parametrize(
    ("before", "after", "gaps", "problem"),
    [
        ("Invented passage.", "x", [], "passage not found exactly once"),
        ("\n\n", "x", [], "passage not found exactly once"),
        (f"[Information needed: {MARKER_QUESTION}]", "Starts in 2026.", [], "touches an existing marker"),
        ("## Results", "## Outcomes", [], "touches a heading"),
        ("The plan covers 12 corridors.", f"[Information needed: {NEW_QUESTION}]", [], "new marker without a structured gap"),
        (
            "The plan covers 12 corridors.",
            f"[Information needed: {NEW_QUESTION}]",
            [gap(NEW_QUESTION, "start_date")],
            "gap key already used",
        ),
    ],
)
def test_unsafe_revisions_are_skipped_and_recorded(before, after, gaps, problem):
    review = ChapterSupportReview(revisions=[revision(before, after)], gaps=gaps)
    corrected, records = module.apply_support_review(draft(), review)
    assert corrected == draft()
    assert records[0]["applied"] is False and records[0]["skipped"] == problem


async def test_failed_check_keeps_the_draft(monkeypatch):
    async def unavailable(*args: Any, **kwargs: Any) -> ChapterSupportReview:
        raise module.ChapterSupportCheckError("provider down")

    monkeypatch.setattr(module, "review_chapter_support", unavailable)
    corrected, records = await module.check_chapter_support([], draft(), settings=Settings(llm=_load_llm_config()))
    assert corrected == draft() and records == []


async def test_draft_chapter_checks_the_draft_with_the_drafters_messages():
    seen: list[tuple[str, Any]] = []
    review = ChapterSupportReview(
        revisions=[revision("All outputs will be reported annually.", "Canopy cover is reported annually.")]
    )

    class FakeRunner:
        @staticmethod
        async def run(agent: Any, messages: Any) -> Any:
            seen.append((agent.name, messages))
            if agent.name == "Concept Note chapter drafter":
                return SimpleNamespace(final_output=draft())
            return SimpleNamespace(final_output=review)

    settings = Settings(llm=_load_llm_config(), openrouter_api_key="test-key")
    payload = {"chapter": {"chapter_ref": "results"}, "source_documents": []}
    corrected, records = await draft_chapter(payload, settings=settings, runner=FakeRunner)

    assert [name for name, _ in seen] == ["Concept Note chapter drafter", "Concept Note chapter support checker"]
    drafter_messages, checker_messages = seen[0][1], seen[1][1]
    assert checker_messages[: len(drafter_messages)] == drafter_messages
    assert checker_messages[-1]["content"].startswith(module.DRAFT_MESSAGE_HEADER)
    assert "Canopy cover is reported annually." in corrected.body_markdown
    assert records[0]["applied"]
