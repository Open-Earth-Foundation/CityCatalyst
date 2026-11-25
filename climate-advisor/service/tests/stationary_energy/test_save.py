from __future__ import annotations

import pytest

pytest.importorskip("pgvector.sqlalchemy")
import os
from unittest.mock import patch

from tests.stationary_energy.draft_case import StationaryEnergyDraftCase
from tests.stationary_energy.fixtures import _active_jwt, _auth_headers, _mock_cc_client


class StationaryEnergySaveTests(StationaryEnergyDraftCase):
    def test_save_commits_latest_pending_review_decisions(self) -> None:
        mock_client = _mock_cc_client()

        with (
            patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}),
            patch(
                "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
                return_value=mock_client,
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
            self._wait_for_draft_status(draft_run_id, "ready")

            decisions = self._complete_review_decisions(draft_run_id)
            review_response = self.client.post(
                f"/v1/stationary-energy-drafts/{draft_run_id}/review",
                json={"user_id": "user-1", "decisions": decisions},
                headers=_auth_headers(),
            )
            self.assertEqual(review_response.status_code, 200, review_response.text)
            self.assertTrue(
                all(
                    decision["selected_source_id"]
                    for decision in review_response.json()["decisions"]
                    if decision["action"] == "accept"
                )
            )

            save_response = self.client.post(
                f"/v1/stationary-energy-drafts/{draft_run_id}/save",
                json={"user_id": "user-1"},
                headers=_auth_headers(),
            )
            status_response = self.client.get(
                f"/v1/stationary-energy-drafts/{draft_run_id}",
                params={"user_id": "user-1"},
                headers=_auth_headers(),
            )

        self.assertEqual(save_response.status_code, 200, save_response.text)
        save_data = save_response.json()
        self.assertEqual(save_data["status"], "saved")
        self.assertTrue(
            all(
                decision["commit_status"] == "committed"
                for decision in save_data["decisions"]
                if decision["action"] == "accept"
            )
        )
        self.assertEqual(status_response.status_code, 200, status_response.text)
        self.assertEqual(status_response.json()["workflow_step"], "review")
        self.assertEqual(status_response.json()["status"], "saved")
        workflow_steps = [
            call.kwargs["workflow_step"]
            for call in mock_client.get_stationary_energy_allowed_capabilities.await_args_list
        ]
        self.assertEqual(
            workflow_steps,
            ["draft", "draft", "review", "review", "review", "review"],
        )
        mock_client.commit_stationary_energy_accepted.assert_awaited_once()
        commit_rows = mock_client.commit_stationary_energy_accepted.await_args.kwargs[
            "request_payload"
        ]["rows"]
        self.assertTrue(commit_rows)
        self.assertTrue(all(row["selected_source_id"] for row in commit_rows))

    def test_save_commits_manual_review_decisions(self) -> None:
        mock_client = _mock_cc_client()

        with (
            patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}),
            patch(
                "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
                return_value=mock_client,
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
            self._wait_for_draft_status(draft_run_id, "ready")
            status_before_review = self._get_status(draft_run_id)
            manual_proposal = status_before_review["proposals"][0]
            other_proposal = status_before_review["proposals"][1]

            decisions = self._complete_review_decisions(
                draft_run_id,
                overrides={
                    manual_proposal["proposal_id"]: {
                        "proposal_id": manual_proposal["proposal_id"],
                        "action": "override_manual",
                        "manual_value": 12.5,
                        "manual_unit": "tCO2e",
                        "note": "Manual reviewer correction.",
                    },
                    other_proposal["proposal_id"]: {
                        "proposal_id": other_proposal["proposal_id"],
                        "action": "leave_draft",
                    },
                },
            )
            review_response = self.client.post(
                f"/v1/stationary-energy-drafts/{draft_run_id}/review",
                json={"user_id": "user-1", "decisions": decisions},
                headers=_auth_headers(),
            )
            self.assertEqual(review_response.status_code, 200, review_response.text)
            review_decision = next(
                decision
                for decision in review_response.json()["decisions"]
                if decision["proposal_id"] == manual_proposal["proposal_id"]
            )
            self.assertEqual(review_decision["commit_status"], "pending_cc_commit")

            save_response = self.client.post(
                f"/v1/stationary-energy-drafts/{draft_run_id}/save",
                json={"user_id": "user-1"},
                headers=_auth_headers(),
            )

        self.assertEqual(save_response.status_code, 200, save_response.text)
        save_data = save_response.json()
        self.assertEqual(save_data["status"], "saved")
        saved_manual_decision = next(
            decision
            for decision in save_data["decisions"]
            if decision["proposal_id"] == manual_proposal["proposal_id"]
        )
        self.assertEqual(saved_manual_decision["commit_status"], "committed")

        mock_client.commit_stationary_energy_accepted.assert_awaited_once()
        commit_rows = mock_client.commit_stationary_energy_accepted.await_args.kwargs[
            "request_payload"
        ]["rows"]
        self.assertEqual(len(commit_rows), 1)
        self.assertEqual(commit_rows[0]["row_type"], "manual_override")
        self.assertEqual(commit_rows[0]["manual_value"], 12.5)
        self.assertEqual(commit_rows[0]["manual_unit"], "tCO2e")
