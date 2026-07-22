"""Tests for deterministic CNB canonical-funder matching."""

from uuid import UUID

import pytest

from app.models.cnb_research import CanonicalFunder, FundingRecordDraft
from app.services.cnb_funder_identity_match import propose_funder_identity_candidates

FUNDER_ID = UUID("7eb0df43-db16-4eb7-88f9-92b5884b617f")


def _project(reported_name: str | None) -> FundingRecordDraft:
    return FundingRecordDraft(
        funding_record_ref="project-001",
        funder_ref="funder-001",
        is_opportunity=False,
        name="Funded project",
        reported_funder_name=reported_name,
    )


@pytest.mark.parametrize(
    ("reported_name", "canonical_name", "expected_reason"),
    [
        (
            "Minnesota Pollution Control Agency",
            "Minnesota Pollution Control Agency",
            "Exact reported name match",
        ),
        (
            "Minnesota Pollution Control Agency (MPCA)",
            "Minnesota Pollution Control Agency",
            "Normalized name match",
        ),
        ("Unknown Community Backer", "Minnesota Pollution Control Agency", None),
        ("---", "Minnesota Pollution Control Agency", None),
    ],
)
def test_identity_scan_returns_only_supported_candidates(
    reported_name: str,
    canonical_name: str,
    expected_reason: str | None,
) -> None:
    [project] = propose_funder_identity_candidates(
        funding_records=[_project(reported_name)],
        canonical_funders=[CanonicalFunder(funder_id=FUNDER_ID, name=canonical_name)],
    )

    assert [item.match_reason for item in project.candidate_funders] == (
        [expected_reason] if expected_reason else []
    )
    assert project.selected_funder_id is None


def test_identity_scan_uses_the_dossier_name_only_as_a_candidate_hint() -> None:
    [project] = propose_funder_identity_candidates(
        funding_records=[_project(None)],
        canonical_funders=[CanonicalFunder(funder_id=FUNDER_ID, name="ELENA")],
        dossier_funder_name="ELENA",
    )

    assert project.reported_funder_name is None
    assert project.candidate_funders[0].match_reason == (
        "Exact dossier-funder name match"
    )
