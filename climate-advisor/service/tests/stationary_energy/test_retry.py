from __future__ import annotations

import pytest

pytest.importorskip("pgvector.sqlalchemy")
import os
from unittest.mock import AsyncMock, patch

from app.services.citycatalyst_client import CityCatalystClientError
from tests.stationary_energy.draft_case import StationaryEnergyDraftCase
from tests.stationary_energy.fixtures import _active_jwt, _auth_headers, _mock_cc_client


class StationaryEnergyRetryTests(StationaryEnergyDraftCase):
    def test_start_returns_502_when_context_loading_fails(self) -> None:
        mock_client = _mock_cc_client()
        mock_client.load_stationary_energy_context = AsyncMock(
            side_effect=CityCatalystClientError("context failed", status_code=502)
        )

        with (
            patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}),
            patch(
                "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
                return_value=mock_client,
            ),
        ):
            response = self.client.post(
                "/v1/stationary-energy-drafts/start",
                json={
                    "user_id": "user-1",
                    "city_id": "city-1",
                    "inventory_id": "inventory-1",
                    "context": {"access_token": _active_jwt()},
                },
                headers=_auth_headers(),
            )

        self.assertEqual(response.status_code, 502)
        self.assertIn("context failed", response.text)
        mock_client.load_stationary_energy_context.assert_awaited_once()

    def test_retry_failed_draft_regenerates_snapshot(self) -> None:
        mock_client = _mock_cc_client()
        mock_client.load_stationary_energy_context = AsyncMock(
            side_effect=CityCatalystClientError("context failed", status_code=502)
        )

        with (
            patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}),
            patch(
                "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
                return_value=mock_client,
            ),
        ):
            failed_response = self.client.post(
                "/v1/stationary-energy-drafts/start",
                json={
                    "user_id": "user-1",
                    "city_id": "city-1",
                    "inventory_id": "inventory-1",
                    "context": {"access_token": _active_jwt()},
                },
                headers=_auth_headers(),
            )

        self.assertEqual(failed_response.status_code, 502)
        draft_run_id = self._latest_draft_run_id("user-1")
        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}):
            failed_status = self.client.get(
                f"/v1/stationary-energy-drafts/{draft_run_id}",
                params={"user_id": "user-1"},
                headers=_auth_headers(),
            )
        self.assertEqual(failed_status.status_code, 200, failed_status.text)
        self.assertEqual(failed_status.json()["status"], "failed")
        self.assertEqual(
            failed_status.json()["error_summary"]["failed_step"],
            "loading_context",
        )

        retry_client = _mock_cc_client()
        with (
            patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}),
            patch(
                "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
                return_value=retry_client,
            ),
        ):
            retry_response = self.client.post(
                f"/v1/stationary-energy-drafts/{draft_run_id}/retry",
                json={"user_id": "user-1"},
                headers=_auth_headers(),
            )

        self.assertEqual(retry_response.status_code, 200, retry_response.text)
        retry_data = retry_response.json()
        self.assertEqual(retry_data["status"], "generating")
        self.assertEqual(retry_data["proposals"], [])
        self._wait_for_draft_status(draft_run_id, "ready")
        retry_status = self._get_status(draft_run_id)
        self.assertEqual(retry_status["status"], "ready")
        self.assertIsNone(retry_status["error_summary"])
        self.assertEqual(len(retry_status["proposals"]), 2)

    def test_retry_failure_keeps_previous_snapshot_atomic(self) -> None:
        draft_run_id, _proposal_id, _candidate_id = self._start_draft()
        initial_status = self._get_status(draft_run_id)

        retry_client = _mock_cc_client()
        retry_client.load_stationary_energy_context = AsyncMock(
            side_effect=CityCatalystClientError("retry context failed", status_code=502)
        )

        with (
            patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}),
            patch(
                "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
                return_value=retry_client,
            ),
        ):
            retry_response = self.client.post(
                f"/v1/stationary-energy-drafts/{draft_run_id}/retry",
                json={"user_id": "user-1"},
                headers=_auth_headers(),
            )
            failed_status = self.client.get(
                f"/v1/stationary-energy-drafts/{draft_run_id}",
                params={"user_id": "user-1"},
                headers=_auth_headers(),
            )

        self.assertEqual(retry_response.status_code, 502, retry_response.text)
        self.assertEqual(failed_status.status_code, 200, failed_status.text)
        failed_status_data = failed_status.json()
        self.assertEqual(failed_status_data["status"], "failed")
        self.assertEqual(
            failed_status_data["error_summary"]["failed_step"],
            "loading_context",
        )
        self.assertEqual(
            [
                candidate["candidate_id"]
                for candidate in failed_status_data["source_candidates"]
            ],
            [
                candidate["candidate_id"]
                for candidate in initial_status["source_candidates"]
            ],
        )
        self.assertEqual(
            [
                candidate["datasource_id"]
                for candidate in failed_status_data["source_candidates"]
            ],
            [
                candidate["datasource_id"]
                for candidate in initial_status["source_candidates"]
            ],
        )
        self.assertEqual(
            [proposal["proposal_id"] for proposal in failed_status_data["proposals"]],
            [proposal["proposal_id"] for proposal in initial_status["proposals"]],
        )
