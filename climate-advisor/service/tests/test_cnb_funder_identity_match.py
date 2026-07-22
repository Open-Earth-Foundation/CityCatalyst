"""Tests for deterministic CNB canonical-funder candidate generation."""

from app.models.cnb_research import CanonicalFunder, FundingRecordDraft
from app.services.cnb_funder_identity_match import propose_funder_identity_candidates


def test_identity_scan_proposes_exact_match_without_auto_selecting() -> None:
    """Exact name matches produce candidates but still require reviewer selection."""
    records = [
        FundingRecordDraft(
            funding_record_ref="project-001",
            funder_ref="funder-001",
            is_opportunity=False,
            name="Funded project",
            reported_funder_name="Minnesota Pollution Control Agency",
            selected_funder_id="d15d4fdb-a213-460d-b7af-c4ba0bdbd39b",
        )
    ]
    canonical_funders = [
        CanonicalFunder(
            funder_id="7eb0df43-db16-4eb7-88f9-92b5884b617f",
            name="Minnesota Pollution Control Agency",
        )
    ]

    [project] = propose_funder_identity_candidates(
        funding_records=records,
        canonical_funders=canonical_funders,
        dossier_funder_name="ELENA",
    )

    assert project.reported_funder_name == "Minnesota Pollution Control Agency"
    assert project.selected_funder_id is None
    assert [candidate.model_dump(mode="json") for candidate in project.candidate_funders] == [
        {
            "funder_id": "7eb0df43-db16-4eb7-88f9-92b5884b617f",
            "name": "Minnesota Pollution Control Agency",
            "match_reason": "Exact reported name match",
        }
    ]


def test_identity_scan_handles_non_matches_and_leaves_opportunities_empty() -> None:
    """Opportunity rows keep empty review fields and unknown funders yield no candidates."""
    records = [
        FundingRecordDraft(
            funding_record_ref="opportunity-001",
            funder_ref="funder-001",
            is_opportunity=True,
            name="Opportunity",
        ),
        FundingRecordDraft(
            funding_record_ref="project-001",
            funder_ref="funder-001",
            is_opportunity=False,
            name="Funded project",
            reported_funder_name="Unknown Community Backer",
        ),
    ]
    canonical_funders = [
        CanonicalFunder(
            funder_id="7eb0df43-db16-4eb7-88f9-92b5884b617f",
            name="Minnesota Pollution Control Agency",
        )
    ]

    opportunity, project = propose_funder_identity_candidates(
        funding_records=records,
        canonical_funders=canonical_funders,
    )

    assert opportunity.candidate_funders == []
    assert opportunity.selected_funder_id is None
    assert opportunity.project_tags == []
    assert project.reported_funder_name == "Unknown Community Backer"
    assert project.candidate_funders == []
    assert project.selected_funder_id is None


def test_identity_scan_uses_deterministic_non_exact_reasons() -> None:
    """Normalized and token-overlap matches use short stable reasons and ordering."""
    records = [
        FundingRecordDraft(
            funding_record_ref="project-001",
            funder_ref="funder-001",
            is_opportunity=False,
            name="Funded project",
            reported_funder_name="Minnesota Pollution Control Agency (MPCA)",
        )
    ]
    canonical_funders = [
        CanonicalFunder(
            funder_id="7eb0df43-db16-4eb7-88f9-92b5884b617f",
            name="Minnesota Pollution Control Agency",
        ),
        CanonicalFunder(
            funder_id="d15d4fdb-a213-460d-b7af-c4ba0bdbd39b",
            name="Minnesota Pollution Response Office",
        ),
    ]

    [project] = propose_funder_identity_candidates(
        funding_records=records,
        canonical_funders=canonical_funders,
    )

    assert [candidate.match_reason for candidate in project.candidate_funders] == [
        "Normalized name match",
        "Shared name tokens",
    ]


def test_identity_scan_does_not_match_an_empty_normalized_name() -> None:
    """Punctuation-only reported names must not match every canonical funder."""
    record = FundingRecordDraft(
        funding_record_ref="project-001",
        funder_ref="funder-001",
        is_opportunity=False,
        name="Funded project",
        reported_funder_name="---",
    )
    canonical_funder = CanonicalFunder(
        funder_id="7eb0df43-db16-4eb7-88f9-92b5884b617f",
        name="Minnesota Pollution Control Agency",
    )

    [project] = propose_funder_identity_candidates(
        funding_records=[record],
        canonical_funders=[canonical_funder],
    )

    assert project.candidate_funders == []


def test_identity_scan_has_no_fallback_without_a_dossier_funder_name() -> None:
    """Missing reported and dossier names must not propose a canonical funder."""
    record = FundingRecordDraft(
        funding_record_ref="project-001",
        funder_ref="funder-001",
        is_opportunity=False,
        name="Funded project",
        reported_funder_name=None,
    )
    canonical_funder = CanonicalFunder(
        funder_id="7eb0df43-db16-4eb7-88f9-92b5884b617f",
        name="ELENA",
    )

    [project] = propose_funder_identity_candidates(
        funding_records=[record],
        canonical_funders=[canonical_funder],
    )

    assert project.reported_funder_name is None
    assert project.candidate_funders == []


def test_identity_scan_uses_exact_dossier_funder_fallback() -> None:
    """The known dossier funder can propose a candidate without inventing a fact."""
    record = FundingRecordDraft(
        funding_record_ref="project-001",
        funder_ref="funder-001",
        is_opportunity=False,
        name="Funded project",
        reported_funder_name=None,
    )
    canonical_funder = CanonicalFunder(
        funder_id="7eb0df43-db16-4eb7-88f9-92b5884b617f",
        name="ELENA",
    )

    [project] = propose_funder_identity_candidates(
        funding_records=[record],
        canonical_funders=[canonical_funder],
        dossier_funder_name="ELENA",
    )

    assert project.reported_funder_name is None
    assert [candidate.model_dump(mode="json") for candidate in project.candidate_funders] == [
        {
            "funder_id": "7eb0df43-db16-4eb7-88f9-92b5884b617f",
            "name": "ELENA",
            "match_reason": "Exact dossier-funder name match",
        }
    ]
