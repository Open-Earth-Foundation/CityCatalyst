from __future__ import annotations

import pytest

pytest.importorskip("pgvector.sqlalchemy")
from concurrent.futures import Future
from typing import Any
from unittest.mock import patch
from uuid import UUID, uuid4

from app.services.stationary_energy.stationary_energy_review_models import (
    StationaryEnergyAgentReviewChoiceInput,
)
from tests.stationary_energy.draft_case import StationaryEnergyDraftCase
from tests.stationary_energy.fixtures import _active_jwt, _auth_headers, _mock_cc_client


class StationaryEnergyReviewTests(StationaryEnergyDraftCase):
    def _post_review(self, draft_run_id: str, decisions: list[dict[str, Any]]) -> Any:
        return self.client.post(
            f"/v1/stationary-energy-drafts/{draft_run_id}/review",
            json={"user_id": "user-1", "decisions": decisions},
            headers=_auth_headers(),
        )

    def test_review_and_save_reject_generating_draft(self) -> None:
        def hold_background_task(coro: Any) -> Future[Any]:
            """Leave the draft in generating state for route guard assertions."""
            coro.close()
            future: Future[Any] = Future()
            future.set_result(None)
            return future

        with (
            self._patch_cc(_mock_cc_client()),
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

            review_response = self._post_review(
                draft_run_id, [{"proposal_id": str(uuid4()), "action": "accept"}]
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

    def test_review_rejects_invalid_decision_sets(self) -> None:
        draft_run_id, proposal_id, _candidate_id = self._start_draft()
        status_data = self._get_status(draft_run_id)
        residential_proposal_id = next(
            proposal["proposal_id"]
            for proposal in status_data["proposals"]
            if proposal["target_ref"].get("subsector_id") == "I.1"
        )
        commercial_candidate_id = next(
            candidate["candidate_id"]
            for candidate in status_data["source_candidates"]
            if candidate["datasource_id"] == "ds-commercial"
        )

        def with_override(target: str, decision: dict[str, Any]) -> list[dict[str, Any]]:
            return self._complete_review_decisions(
                draft_run_id, overrides={target: {"proposal_id": target, **decision}}
            )

        complete = self._complete_review_decisions(draft_run_id)
        cases = {
            "unknown override source": (
                with_override(
                    proposal_id,
                    {"action": "override_source", "selected_source_id": str(uuid4())},
                ),
                400,
                "stored candidate",
            ),
            "override source from another scope": (
                with_override(
                    residential_proposal_id,
                    {
                        "action": "override_source",
                        "selected_source_id": commercial_candidate_id,
                    },
                ),
                400,
                "target scope",
            ),
            "empty decision list": ([], 422, ""),
            "missing proposal": (
                [{"proposal_id": proposal_id, "action": "accept"}],
                400,
                "cover every proposal",
            ),
            "duplicate proposal": (
                [*complete, dict(complete[0])],
                422,
                "at most one entry per proposal_id",
            ),
            "manual value without unit": (
                with_override(proposal_id, {"action": "override_manual", "manual_value": 12.5}),
                400,
                "manual_unit",
            ),
        }

        for name, (decisions, status_code, message) in cases.items():
            with self.subTest(name):
                response = self._post_review(draft_run_id, decisions)
                self.assertEqual(response.status_code, status_code, response.text)
                self.assertIn(message, response.text)

    def test_review_persists_override_and_accepted_recommended_sources(self) -> None:
        draft_run_id, proposal_id, candidate_id = self._start_draft()
        proposals = {
            proposal["proposal_id"]: proposal
            for proposal in self._get_status(draft_run_id)["proposals"]
        }
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
        accepted_id = next(d["proposal_id"] for d in decisions if d["action"] == "accept")

        review_response = self._post_review(draft_run_id, decisions)
        status_data = self._get_status(draft_run_id)

        self.assertEqual(review_response.status_code, 200, review_response.text)
        review_data = review_response.json()
        self.assertEqual(review_data["status"], "reviewed")
        returned = {d["proposal_id"]: d for d in review_data["decisions"]}
        persisted = {d["proposal_id"]: d for d in status_data["review_decisions"]}
        self.assertEqual(len(persisted), len(decisions))

        # An override names a stored candidate; the CC source is the candidate's datasource.
        override = returned[proposal_id]
        self.assertEqual(override["selected_candidate_id"], candidate_id)
        self.assertEqual(
            override["selected_source_id"],
            proposals[proposal_id]["recommended_datasource_id"],
        )
        self.assertEqual(override["decision_version"], 1)
        self.assertEqual(override["commit_status"], "pending_cc_commit")

        # An accept keeps the proposal's recommended source and candidate.
        recommended = proposals[accepted_id]
        for decision in (returned[accepted_id], persisted[accepted_id]):
            self.assertEqual(decision["action"], "accept")
            self.assertEqual(
                decision["selected_source_id"], recommended["recommended_datasource_id"]
            )
            self.assertEqual(
                decision["selected_candidate_id"], recommended["recommended_candidate_id"]
            )
        self.assertTrue(all(d["user_id"] == "user-1" for d in persisted.values()))

    def test_review_marks_staged_agent_choices_saved(self) -> None:
        draft_run_id, proposal_id, candidate_id = self._start_draft()
        self._review(
            "accept_one",
            draft_run_id,
            choice=StationaryEnergyAgentReviewChoiceInput(
                proposal_id=UUID(proposal_id),
                candidate_id=UUID(candidate_id),
                rationale="Use the agent-selected source.",
            ),
        )
        self.assertEqual(
            len(self._get_status(draft_run_id)["staged_review_selections"]),
            1,
        )
        decisions = self._complete_review_decisions(draft_run_id)

        review_response = self._post_review(draft_run_id, decisions)

        self.assertEqual(review_response.status_code, 200, review_response.text)
        status_data = self._get_status(draft_run_id)
        self.assertEqual(status_data["staged_review_selections"], [])
        self.assertEqual(len(status_data["review_decisions"]), len(decisions))

    def test_review_persists_version_history_when_decisions_change(self) -> None:
        draft_run_id, proposal_id, candidate_id = self._start_draft()
        first_review = self._post_review(
            draft_run_id, self._complete_review_decisions(draft_run_id)
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
        second_review = self._post_review(draft_run_id, second_decisions)
        status_data = self._get_status(draft_run_id)

        self.assertEqual(second_review.status_code, 200, second_review.text)
        self.assertEqual(
            {decision["decision_version"] for decision in second_review.json()["decisions"]},
            {2},
        )
        version_history: dict[str, list[int]] = {}
        for decision in status_data["review_decisions"]:
            version_history.setdefault(decision["proposal_id"], []).append(
                decision["decision_version"]
            )
        self.assertEqual(
            sorted(version_history.values()), [[1, 2]] * len(second_decisions)
        )
