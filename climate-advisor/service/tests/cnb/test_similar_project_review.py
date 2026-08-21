"""Tests for building similar-project candidates from reviewed research."""

import logging
from uuid import UUID

import pytest

from app.models.cnb.similar_projects import CnbSimilarProjectCandidate
from app.services.cnb.similar_project_review import _merge_candidate_entries


FUNDED_PROJECT_ID = UUID("16fd2706-8baf-433b-82eb-8c7fada847da")
FUNDER_ID = UUID("2ff090d6-b421-4fa6-881c-ec14e379da12")


def _candidate(
    *,
    hazards: list[str],
    project_tags: list[str],
    known_gaps: list[str],
) -> CnbSimilarProjectCandidate:
    """Build one semantically identical candidate with varied reviewed fields."""
    return CnbSimilarProjectCandidate(
        funded_project_id=FUNDED_PROJECT_ID,
        funder_id=FUNDER_ID,
        is_funded_award=True,
        name="Municipal Solar Project",
        hazards=hazards,
        project_tags=project_tags,
        known_gaps=known_gaps,
    )


def test_duplicate_candidate_merge_logs_origins_and_adds_review_caveat(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A semantic merge should be observable without discarding existing gaps."""
    first = _candidate(
        hazards=["heat"],
        project_tags=["solar"],
        known_gaps=["Award amount is unknown."],
    )
    second = _candidate(
        hazards=["drought"],
        project_tags=["municipal"],
        known_gaps=[],
    )

    with caplog.at_level(
        logging.WARNING,
        logger="app.services.cnb.similar_project_review",
    ):
        merged = _merge_candidate_entries(
            [
                (first, "run-b", "project-2"),
                (second, "run-a", "project-1"),
            ]
        )

    origin_list = "run-a:project-1, run-b:project-2"
    assert (
        f"Merged 2 semantically equivalent CNB reviewed project records "
        f"into candidate {FUNDED_PROJECT_ID}: {origin_list}"
        in caplog.text
    )
    assert merged.hazards == ["heat", "drought"]
    assert merged.project_tags == ["solar", "municipal"]
    assert merged.known_gaps == [
        "Award amount is unknown.",
        f"Merged 2 reviewed records with the same semantic identity: {origin_list}.",
    ]
