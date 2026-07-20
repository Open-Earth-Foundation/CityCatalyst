"""Tests for CNB funder research bundle conversion and material paths."""

from app.models.cnb_research import (
    FinancialAmountResearchResult,
    FundedProjectActionDraft,
    FundedProjectDraft,
    FundingLinkResearchResult,
)
from app.services.cnb_research_bundle import convert_agent_opportunity, material_paths
from tests.cnb_research_helpers import build_result


def test_material_paths_use_each_record_own_reference() -> None:
    """Evidence paths do not use a foreign project ref as a child identity."""
    base = build_result()
    opportunity = base.opportunity.model_copy(
        update={
            "funded_projects": [
                FundedProjectDraft(project_ref="project-001", title="Project")
            ],
            "funded_project_actions": [
                FundedProjectActionDraft(
                    action_ref="action-001",
                    project_ref="project-001",
                    description="Prepare the project.",
                )
            ],
            "funding_links": [
                FundingLinkResearchResult(
                    funding_link_ref="link-001",
                    project_ref="project-001",
                    action_ref="action-001",
                    program_name="Example Program",
                    status="completed",
                )
            ],
            "financial_amounts": [
                FinancialAmountResearchResult(
                    amount_ref="amount-001",
                    project_ref="project-001",
                    action_ref="action-001",
                    program_name="Example Program",
                    amount=125000,
                    currency="USD",
                    amount_kind="individual_technical_assistance",
                    status="approved",
                    description="Project-preparation assistance.",
                )
            ],
        }
    )
    result = base.model_copy(update={"opportunity": opportunity})

    paths = set(material_paths(convert_agent_opportunity(result)))

    assert "opportunity.funded_project_actions[action-001].description" in paths
    assert "opportunity.funding_links[link-001].status" in paths
    assert "opportunity.financial_amounts[amount-001].amount_kind" in paths
