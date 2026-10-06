from __future__ import annotations

import pytest

pytest.importorskip("pgvector.sqlalchemy")
import asyncio
import os
from concurrent.futures import Future
from typing import Any
from unittest.mock import patch
from uuid import UUID, uuid4

from app.services.stationary_energy.stationary_energy_agent_review import (
    StationaryEnergyAgentReviewService,
)
from app.services.stationary_energy.stationary_energy_review_models import (
    StationaryEnergyAgentReviewChoiceInput,
)
from tests.stationary_energy.draft_case import StationaryEnergyDraftCase
from tests.stationary_energy.fixtures import _active_jwt, _auth_headers, _mock_cc_client


class StationaryEnergyReviewTests(StationaryEnergyDraftCase):
    def test_review_and_save_reject_generating_draft(self) -> None:
        mock_client = _mock_cc_client()

        def hold_background_task(coro: Any) -> Future[Any]:
            """Leave the draft in generating state for route guard assertions."""
            coro.close()
            future: Future[Any] = Future()
            future.set_result(None)
            return future

        with (
            patch.dict(
                os.environ,
                {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"},
            ),
            patch(
                "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
                return_value=mock_client,
            ),
            patch(
                "app.services.stationary_energy.stationary_energy_draft_service._schedule_background_task",
                side_effect=hold_background_task,
            ),
        ):
            start_response = self.client.post(
                "/v1/stationary-energy-drafts/start",
                json={
                    "user_id": "user-1",
                    "city_id": "city-1",
                    "inventory_id": "inventory-1",
                    "context": {"access_token": _active_jwt()},
                },
                headers=_auth_headers(),
            )
            self.assertEqual(start_response.status_code, 201, start_response.text)
            draft_run_id = start_response.json()["draft_run_id"]

            review_response = self.client.post(
                f"/v1/stationary-energy-drafts/{draft_run_id}/review",
                json={
                    "user_id": "user-1",
                    "decisions": [
                        {"proposal_id": str(uuid4()), "action": "accept"},
                    ],
                },
                headers=_auth_headers(),
            )
            save_response = self.client.post(
                f"/v1/stationary-energy-drafts/{draft_run_id}/save",
                json={"user_id": "user-1"},
                headers=_auth_headers(),
            )

        self.assertEqual(review_response.status_code, 409, review_response.text)
        self.assertIn("still in progress", review_response.text)
        self.assertEqual(save_response.status_code, 409, save_response.text)
        self.assertIn("still in progress", save_response.text)

    def test_review_requires_override_source_to_match_stored_candidate(self) -> None:
        draft_run_id, proposal_id, _candidate_id = self._start_draft()
        decisions = self._complete_review_decisions(
            draft_run_id,
            overrides={
                proposal_id: {
                    "proposal_id": proposal_id,
                    "action": "override_source",
                    "selected_source_id": str(uuid4()),
                }
            },
        )

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}):
            response = self.client.post(
                f"/v1/stationary-energy-drafts/{draft_run_id}/review",
                json={
                    "user_id": "user-1",
                    "decisions": decisions,
                },
                headers=_auth_headers(),
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("stored candidate", response.text)

    def test_review_rejects_override_source_for_a_different_target_scope(self) -> None:
        draft_run_id, _proposal_id, _candidate_id = self._start_draft()
        status_data = self._get_status(draft_run_id)
        residential_proposal = next(
            proposal
            for proposal in status_data["proposals"]
            if proposal["target_ref"].get("subsector_id") == "I.1"
        )
        commercial_candidate = next(
            candidate
            for candidate in status_data["source_candidates"]
            if candidate["datasource_id"] == "ds-commercial"
        )
        decisions = self._complete_review_decisions(
            draft_run_id,
            overrides={
                residential_proposal["proposal_id"]: {
                    "proposal_id": residential_proposal["proposal_id"],
                    "action": "override_source",
                    "selected_source_id": commercial_candidate["candidate_id"],
                }
            },
        )

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}):
            response = self.client.post(
                f"/v1/stationary-energy-drafts/{draft_run_id}/review",
                json={"user_id": "user-1", "decisions": decisions},
                headers=_auth_headers(),
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("target scope", response.text)

    def test_review_rejects_empty_decision_list(self) -> None:
        draft_run_id, _proposal_id, _candidate_id = self._start_draft()

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}):
            response = self.client.post(
                f"/v1/stationary-energy-drafts/{draft_run_id}/review",
                json={"user_id": "user-1", "decisions": []},
                headers=_auth_headers(),
            )

        self.assertEqual(response.status_code, 422)

    def test_review_requires_decision_for_every_proposal(self) -> None:
        draft_run_id, proposal_id, _candidate_id = self._start_draft()

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}):
            response = self.client.post(
                f"/v1/stationary-energy-drafts/{draft_run_id}/review",
                json={
                    "user_id": "user-1",
                    "decisions": [{"proposal_id": proposal_id, "action": "accept"}],
                },
                headers=_auth_headers(),
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("cover every proposal", response.text)

    def test_review_rejects_duplicate_proposal_decisions(self) -> None:
        draft_run_id, _proposal_id, _candidate_id = self._start_draft()
        decisions = self._complete_review_decisions(draft_run_id)
        decisions.append(dict(decisions[0]))

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}):
            response = self.client.post(
                f"/v1/stationary-energy-drafts/{draft_run_id}/review",
                json={"user_id": "user-1", "decisions": decisions},
                headers=_auth_headers(),
            )

        self.assertEqual(response.status_code, 422)
        self.assertIn("at most one entry per proposal_id", response.text)

    def test_review_requires_manual_unit_for_override_manual(self) -> None:
        draft_run_id, proposal_id, _candidate_id = self._start_draft()
        decisions = self._complete_review_decisions(
            draft_run_id,
            overrides={
                proposal_id: {
                    "proposal_id": proposal_id,
                    "action": "override_manual",
                    "manual_value": 12.5,
                }
            },
        )

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}):
            response = self.client.post(
                f"/v1/stationary-energy-drafts/{draft_run_id}/review",
                json={"user_id": "user-1", "decisions": decisions},
                headers=_auth_headers(),
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("manual_unit", response.text)

    def test_review_persists_decisions_for_owner(self) -> None:
        draft_run_id, proposal_id, candidate_id = self._start_draft()
        initial_status = self._get_status(draft_run_id)
        expected_selected_source_id = next(
            proposal["recommended_datasource_id"]
            for proposal in initial_status["proposals"]
            if proposal["proposal_id"] == proposal_id
        )
        decisions = self._complete_review_decisions(
            draft_run_id,
            overrides={
                proposal_id: {
                    "proposal_id": proposal_id,
                    "action": "override_source",
                    "selected_source_id": candidate_id,
                    "note": "Use this stored source snapshot.",
                }
            },
        )

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}):
            review_response = self.client.post(
                f"/v1/stationary-energy-drafts/{draft_run_id}/review",
                json={
                    "user_id": "user-1",
                    "decisions": decisions,
                },
                headers=_auth_headers(),
            )
            status_response = self.client.get(
                f"/v1/stationary-energy-drafts/{draft_run_id}",
                params={"user_id": "user-1"},
                headers=_auth_headers(),
            )

        self.assertEqual(review_response.status_code, 200, review_response.text)
        review_data = review_response.json()
        self.assertEqual(review_data["status"], "reviewed")
        self.assertEqual(
            review_data["decisions"][0]["selected_candidate_id"], candidate_id
        )
        self.assertEqual(
            review_data["decisions"][0]["selected_source_id"],
            expected_selected_source_id,
        )
        self.assertEqual(review_data["decisions"][0]["decision_version"], 1)
        self.assertEqual(
            review_data["decisions"][0]["commit_status"], "pending_cc_commit"
        )

        self.assertEqual(status_response.status_code, 200, status_response.text)
        status_data = status_response.json()
        self.assertEqual(len(status_data["review_decisions"]), len(decisions))
        self.assertEqual(status_data["review_decisions"][0]["user_id"], "user-1")

    def test_review_marks_staged_agent_choices_saved(self) -> None:
        draft_run_id, proposal_id, candidate_id = self._start_draft()

        async def stage_choice() -> None:
            async with self.session_factory() as session:
                service = StationaryEnergyAgentReviewService(session)
                await service.accept_one(
                    draft_run_id=UUID(draft_run_id),
                    user_id="user-1",
                    choice=StationaryEnergyAgentReviewChoiceInput(
                        proposal_id=UUID(proposal_id),
                        candidate_id=UUID(candidate_id),
                        rationale="Use the agent-selected source.",
                    ),
                )
                await session.commit()

        asyncio.run(stage_choice())
        self.assertEqual(
            len(self._get_status(draft_run_id)["staged_review_selections"]),
            1,
        )
        decisions = self._complete_review_decisions(draft_run_id)

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}):
            review_response = self.client.post(
                f"/v1/stationary-energy-drafts/{draft_run_id}/review",
                json={"user_id": "user-1", "decisions": decisions},
                headers=_auth_headers(),
            )

        self.assertEqual(review_response.status_code, 200, review_response.text)
        status_data = self._get_status(draft_run_id)
        self.assertEqual(status_data["staged_review_selections"], [])
        self.assertEqual(len(status_data["review_decisions"]), len(decisions))

    def test_review_accept_persists_recommended_source_and_candidate(self) -> None:
        draft_run_id, _proposal_id, _candidate_id = self._start_draft()
        status_before_review = self._get_status(draft_run_id)
        accepted_proposal = next(
            proposal
            for proposal in status_before_review["proposals"]
            if proposal.get("recommended_candidate_id")
        )
        decisions = self._complete_review_decisions(draft_run_id)

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}):
            review_response = self.client.post(
                f"/v1/stationary-energy-drafts/{draft_run_id}/review",
                json={"user_id": "user-1", "decisions": decisions},
                headers=_auth_headers(),
            )
            status_after_review = self.client.get(
                f"/v1/stationary-energy-drafts/{draft_run_id}",
                params={"user_id": "user-1"},
                headers=_auth_headers(),
            )

        self.assertEqual(review_response.status_code, 200, review_response.text)
        self.assertEqual(status_after_review.status_code, 200, status_after_review.text)

        review_decision = next(
            decision
            for decision in review_response.json()["decisions"]
            if decision["proposal_id"] == accepted_proposal["proposal_id"]
        )
        persisted_decision = next(
            decision
            for decision in status_after_review.json()["review_decisions"]
            if decision["proposal_id"] == accepted_proposal["proposal_id"]
            and decision["decision_version"] == review_decision["decision_version"]
        )

        self.assertEqual(review_decision["action"], "accept")
        self.assertEqual(
            review_decision["selected_source_id"],
            accepted_proposal["recommended_datasource_id"],
        )
        self.assertEqual(
            review_decision["selected_candidate_id"],
            accepted_proposal["recommended_candidate_id"],
        )
        self.assertEqual(
            persisted_decision["selected_source_id"],
            accepted_proposal["recommended_datasource_id"],
        )
        self.assertEqual(
            persisted_decision["selected_candidate_id"],
            accepted_proposal["recommended_candidate_id"],
        )

    def test_review_persists_version_history_when_decisions_change(self) -> None:
        draft_run_id, proposal_id, candidate_id = self._start_draft()
        first_decisions = self._complete_review_decisions(draft_run_id)

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}):
            first_review = self.client.post(
                f"/v1/stationary-energy-drafts/{draft_run_id}/review",
                json={"user_id": "user-1", "decisions": first_decisions},
                headers=_auth_headers(),
            )

        self.assertEqual(first_review.status_code, 200, first_review.text)

        second_decisions = self._complete_review_decisions(
            draft_run_id,
            overrides={
                proposal_id: {
                    "proposal_id": proposal_id,
                    "action": "override_source",
                    "selected_source_id": candidate_id,
                    "note": "Updated after a second review pass.",
                }
            },
        )

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}):
            second_review = self.client.post(
                f"/v1/stationary-energy-drafts/{draft_run_id}/review",
                json={"user_id": "user-1", "decisions": second_decisions},
                headers=_auth_headers(),
            )
            status_data = self._get_status(draft_run_id)

        self.assertEqual(second_review.status_code, 200, second_review.text)
        second_review_data = second_review.json()
        self.assertTrue(
            all(
                decision["decision_version"] == 2
                for decision in second_review_data["decisions"]
            )
        )

        version_history: dict[str, list[int]] = {}
        for decision in status_data["review_decisions"]:
            version_history.setdefault(decision["proposal_id"], []).append(
                decision["decision_version"]
            )

        self.assertTrue(version_history)
        self.assertTrue(
            all(versions == [1, 2] for versions in version_history.values())
        )
