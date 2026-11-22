from __future__ import annotations

import pytest

pytest.importorskip("pgvector.sqlalchemy")
import asyncio
from uuid import UUID

from app.models.db.stationary_energy_draft import (
    StationaryEnergyDraftProposal,
    StationaryEnergyDraftSourceCandidate,
)
from app.services.stationary_energy.stationary_energy_review_models import (
    StationaryEnergyAgentReviewChoiceInput,
)
from tests.stationary_energy.draft_case import StationaryEnergyDraftCase


class StationaryEnergyAgentSourcesTests(StationaryEnergyDraftCase):
    def _stage_and_preview_change(
        self, draft_run_id: str, proposal_id: str, candidate_id: str
    ) -> dict:
        self._review(
            "accept_one",
            draft_run_id,
            choice=StationaryEnergyAgentReviewChoiceInput(
                proposal_id=UUID(proposal_id),
                candidate_id=UUID(candidate_id),
            ),
        )
        return self._review(
            "preview_staged_source_changes",
            draft_run_id,
            proposal_ids=[UUID(proposal_id)],
        )

    def test_agent_review_preview_staged_source_change_uses_empty_without_alternative(
        self,
    ) -> None:
        draft_run_id, proposal_id, candidate_id = self._start_draft()

        result = self._stage_and_preview_change(draft_run_id, proposal_id, candidate_id)

        self.assertTrue(result["success"])
        self.assertEqual(
            result["ui_event"],
            "stationary_energy_review_change_confirmation_requested",
        )
        self.assertEqual(
            result["message_key"],
            "tool-message-staged-change-confirm-success",
        )
        self.assertEqual(result["message_params"], {"selected": 1})
        self.assertEqual(result["pending_choices"][0]["action"], "leave_draft")
        self.assertEqual(result["pending_choices"][0]["source_label"], "Leave empty")
        self.assertEqual(
            len(self._get_status(draft_run_id)["staged_review_selections"]), 1
        )

    def test_agent_review_preview_staged_source_change_uses_alternative_datasource(
        self,
    ) -> None:
        draft_run_id, proposal_id, candidate_id = self._start_draft()

        async def add_alternative() -> str:
            async with self.session_factory() as session:
                proposal = await session.get(
                    StationaryEnergyDraftProposal,
                    UUID(proposal_id),
                )
                self.assertIsNotNone(proposal)
                alternative = StationaryEnergyDraftSourceCandidate(
                    draft_run_id=UUID(draft_run_id),
                    datasource_id="ds-preview-alt",
                    name="Preview alternative source",
                    publisher_name="Alternative Publisher",
                    geography_match="city",
                    source_scope=proposal.target_ref,
                    source_data={"details_datasource_id": "ds-preview-alt-details"},
                    normalized_rows=[
                        {
                            "emissions_value_100yr": "1250000",
                            "emissions_unit": "kgCO2e",
                        }
                    ],
                    applicability_status="applicable",
                    applicability_issues=[],
                )
                session.add(alternative)
                await session.flush()
                proposal.alternative_candidate_ids = [str(alternative.candidate_id)]
                await session.commit()
                return str(alternative.candidate_id)

        alternative_candidate_id = asyncio.run(add_alternative())

        result = self._stage_and_preview_change(draft_run_id, proposal_id, candidate_id)

        self.assertTrue(result["success"])
        choice = result["pending_choices"][0]
        self.assertEqual(choice["action"], "override_source")
        self.assertEqual(choice["selected_candidate_id"], alternative_candidate_id)
        self.assertEqual(choice["selected_source_id"], "ds-preview-alt-details")

    def test_agent_review_options_include_source_evidence_for_chat_checks(
        self,
    ) -> None:
        draft_run_id, _proposal_id, _candidate_id = self._start_draft()

        result = self._review("list_review_options", draft_run_id)

        option = next(
            option
            for blocker in result["blocked_choices"]
            for option in blocker["available_options"]
            if option["datasource_id"] == "ds-applicable"
        )
        self.assertEqual(
            option["evidence"],
            {
                "dataset_year": 2024,
                "geography_match": "city",
                "activity_value": 100,
                "activity_unit": "MWh",
                "emissions_value": "1000000",
                "emissions_unit": "kgCO2e",
            },
        )

    def test_agent_review_preview_staged_sources_rollback_does_not_mutate(self) -> None:
        draft_run_id, _proposal_id, _candidate_id = self._start_draft()
        self._review(
            "accept_all_recommended",
            draft_run_id,
            rationale="User accepted all recommended sources.",
        )

        result = self._review("preview_staged_sources_rollback", draft_run_id)

        self.assertTrue(result["success"])
        self.assertEqual(
            result["ui_event"],
            "stationary_energy_review_rollback_confirmation_requested",
        )
        self.assertEqual(
            result["message_key"],
            "tool-message-staged-rollback-confirm-success",
        )
        self.assertEqual(result["message_params"], {"selected": 2, "pending": 2})
        self.assertEqual(
            [choice["action"] for choice in result["pending_choices"]],
            ["rollback_staged", "rollback_staged"],
        )
        self.assertEqual(
            len(self._get_status(draft_run_id)["staged_review_selections"]), 2
        )

    def test_agent_review_rollback_staged_sources_removes_active_selection(
        self,
    ) -> None:
        draft_run_id, proposal_id, candidate_id = self._start_draft()
        self._review(
            "accept_one",
            draft_run_id,
            choice=StationaryEnergyAgentReviewChoiceInput(
                proposal_id=UUID(proposal_id),
                candidate_id=UUID(candidate_id),
            ),
        )

        result = self._review(
            "rollback_staged_sources",
            draft_run_id,
            proposal_ids=[UUID(proposal_id)],
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["selected_choices"][0]["action"], "rollback_staged")
        self.assertEqual(result["message_key"], "tool-message-staged-rollback-success")
        self.assertEqual(result["message_params"], {"selected": 1, "pending": 2})
        self.assertEqual(self._get_status(draft_run_id)["staged_review_selections"], [])

    def test_agent_review_accept_all_includes_notation_backed_gap_with_recommended_source(
        self,
    ) -> None:
        draft_run_id = asyncio.run(self._create_notation_review_draft_snapshot())

        result = self._review(
            "accept_all_recommended",
            draft_run_id,
            rationale="User asked the agent to pick best.",
        )

        self.assertTrue(result["success"])
        self.assertEqual(
            [choice["action"] for choice in result["selected_choices"]], ["accept"]
        )
        self.assertEqual(result["message_key"], "tool-message-stage-success")
        self.assertEqual(result["message_params"], {"selected": 1, "pending": 0})
        staged = self._get_status(str(draft_run_id))["staged_review_selections"]
        self.assertEqual([s["action"] for s in staged], ["accept"])
