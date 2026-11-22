from __future__ import annotations

import pytest

pytest.importorskip("pgvector.sqlalchemy")
from uuid import UUID

from app.services.stationary_energy.stationary_energy_review_models import (
    StationaryEnergyAgentReviewChoiceInput,
)
from app.tools.stationary_energy_review_tools import (
    build_stationary_energy_review_tools,
)
from tests.stationary_energy.draft_case import StationaryEnergyDraftCase
from tests.stationary_energy.fixtures import _active_jwt, _mock_cc_client


class StationaryEnergyAgentSaveTests(StationaryEnergyDraftCase):
    def _stage_first_choice(self, draft_run_id: str, proposal_id: str, candidate_id: str) -> None:
        self._review(
            "accept_one",
            draft_run_id,
            choice=StationaryEnergyAgentReviewChoiceInput(
                proposal_id=UUID(proposal_id),
                candidate_id=UUID(candidate_id),
            ),
        )

    def test_agent_review_save_draft_blocks_when_required_choices_are_missing(
        self,
    ) -> None:
        draft_run_id, proposal_id, candidate_id = self._start_draft()
        self._stage_first_choice(draft_run_id, proposal_id, candidate_id)

        result = self._review(
            "save_review_draft",
            draft_run_id,
            authorization=f"Bearer {_active_jwt()}",
        )

        self.assertFalse(result["success"])
        self.assertEqual(result["action"], "stationary_energy_save_review_draft")
        self.assertEqual(result["pending_required_count"], 1)
        self.assertEqual(result["message_key"], "tool-message-review-save-blocked")
        self.assertEqual(result["message_params"], {"blocked": 1})
        self.assertEqual(self._get_status(draft_run_id)["review_decisions"], [])

    def test_agent_review_save_draft_tool_returns_message_key_when_token_missing(
        self,
    ) -> None:
        draft_run_id, _proposal_id, _candidate_id = self._start_draft()
        tools = build_stationary_energy_review_tools(
            session_factory=self.session_factory,
            draft_run_id=draft_run_id,
            user_id="user-1",
            token_ref={"value": None},
        )

        data = self._invoke_tool(tools, "stationary_energy_save_review_draft")

        self.assertFalse(data["success"])
        self.assertNotIn("message", data)
        self.assertEqual(data["message_key"], "tool-error-missing-token")
        self.assertEqual(data["message_params"], {})
        self.assertEqual(data["error_code"], "missing_token")

    def test_inventory_save_confirmation_tool_requests_card_for_partial_and_complete_review(
        self,
    ) -> None:
        for review in ("partial", "complete"):
            with self.subTest(review=review):
                draft_run_id, proposal_id, candidate_id = self._start_draft()
                if review == "partial":
                    self._stage_first_choice(draft_run_id, proposal_id, candidate_id)
                else:
                    self._review(
                        "accept_all_recommended",
                        draft_run_id,
                        rationale="User asked the agent to pick best.",
                    )
                tools = build_stationary_energy_review_tools(
                    session_factory=self.session_factory,
                    draft_run_id=draft_run_id,
                    user_id="user-1",
                    token_ref={"value": _active_jwt()},
                )

                data = self._invoke_tool(
                    tools, "stationary_energy_request_inventory_save_confirmation"
                )

                self.assertTrue(data["success"])
                self.assertEqual(
                    data["ui_event"],
                    "stationary_energy_inventory_save_confirmation_requested",
                )
                self.assertNotIn("message", data)
                self.assertEqual(data["message_key"], "tool-message-inventory-save-confirm")
                self.assertEqual(data["message_params"], {})

    def test_agent_review_save_draft_persists_complete_staged_choices(self) -> None:
        draft_run_id, _proposal_id, _candidate_id = self._start_draft()
        self._review(
            "accept_all_recommended",
            draft_run_id,
            rationale="User asked the agent to pick best.",
        )

        result = self._review(
            "save_review_draft",
            draft_run_id,
            cc_client=_mock_cc_client(),
            authorization=f"Bearer {_active_jwt()}",
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["pending_required_count"], 0)
        self.assertEqual(result["message_key"], "tool-message-review-save-success")
        self.assertEqual(result["message_params"], {"selected": 2})
        status = self._get_status(draft_run_id)
        self.assertEqual(status["status"], "reviewed")
        self.assertEqual(status["staged_review_selections"], [])
        self.assertEqual(len(status["review_decisions"]), 2)
