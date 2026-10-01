from __future__ import annotations

import pytest

pytest.importorskip("pgvector.sqlalchemy")
import os
from unittest.mock import AsyncMock, patch

from tests.stationary_energy.draft_case import StationaryEnergyDraftCase
from tests.stationary_energy.fixtures import (
    _active_jwt,
    _auth_headers,
    _context_payload,
    _mock_cc_client,
)


class StationaryEnergyLifecycleTests(StationaryEnergyDraftCase):
    def test_routes_return_404_when_feature_flag_is_off(self) -> None:
        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": ""}):
            response = self.client.post(
                "/v1/stationary-energy-drafts/start",
                json={
                    "user_id": "user-1",
                    "city_id": "city-1",
                    "inventory_id": "inventory-1",
                },
                headers=_auth_headers(),
            )

        self.assertEqual(response.status_code, 404)

    def test_start_persists_source_candidates_and_status_returns_snapshot(self) -> None:
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
            start_data = start_response.json()
            draft_run_id = start_data["draft_run_id"]
            self.assertEqual(start_data["status"], "generating")
            self.assertEqual(start_data["proposals"], [])
            self._wait_for_draft_status(draft_run_id, "ready")

            status_response = self.client.get(
                f"/v1/stationary-energy-drafts/{draft_run_id}",
                params={"user_id": "user-1"},
                headers=_auth_headers(),
            )

        self.assertEqual(status_response.status_code, 200, status_response.text)
        status_data = status_response.json()
        self.assertEqual(status_data["status"], "ready")
        self.assertEqual(len(status_data["source_candidates"]), 4)
        self.assertEqual(
            sorted(
                candidate["applicability_status"]
                for candidate in status_data["source_candidates"]
            ),
            ["applicable", "applicable", "failed", "removed"],
        )
        self.assertTrue(
            all(
                "source_data" not in candidate
                for candidate in status_data["source_candidates"]
            )
        )
        self.assertEqual(len(status_data["proposals"]), 2)
        self.assertNotIn("llm_trace", status_data)
        self.assertNotIn("llm_trace", start_data)
        self.assertEqual(status_data["staleness"]["is_stale"], False)
        self.assertEqual(
            status_data["staleness"]["stored_source_ids"],
            ["ds-applicable", "ds-commercial"],
        )
        self.assertEqual(
            status_data["staleness"]["current_source_ids"],
            ["ds-applicable", "ds-commercial"],
        )
        datasource_by_subsector = {
            proposal["target_ref"]["subsector_id"]: proposal[
                "recommended_datasource_id"
            ]
            for proposal in status_data["proposals"]
        }
        self.assertEqual(datasource_by_subsector["I.1"], "ds-applicable")
        self.assertEqual(datasource_by_subsector["I.2"], "ds-commercial")
        current_value_by_subsector = {
            proposal["target_ref"]["subsector_id"]: proposal["current_value"]
            for proposal in status_data["proposals"]
        }
        self.assertEqual(
            current_value_by_subsector["I.1"]["inventory_value_id"], "value-1"
        )
        self.assertIsNone(current_value_by_subsector["I.2"])
        self.assertEqual(
            mock_client.get_stationary_energy_allowed_capabilities.await_count,
            2,
        )
        self.assertEqual(
            [
                call.kwargs["workflow_step"]
                for call in mock_client.get_stationary_energy_allowed_capabilities.await_args_list
            ],
            ["draft", "draft"],
        )
        self.assertEqual(mock_client.load_stationary_energy_context.await_count, 2)
        context_summary = self._draft_context_summary(draft_run_id)
        self.assertEqual(context_summary["source_candidates_count"], 4)
        self.assertEqual(context_summary["applicable_source_candidates_count"], 2)
        self.assertIn("guidance_context", context_summary)
        self.assertNotIn("llm_trace", context_summary)
        self.assertEqual(
            context_summary["guidance_context"]["sector_overview"],
            _context_payload()["guidance_context"]["sector_overview"],
        )

    def test_start_creates_a_new_draft_run_each_time(self) -> None:
        first_draft_run_id, _proposal_id, _candidate_id = self._start_draft()
        second_draft_run_id, _proposal_id_2, _candidate_id_2 = self._start_draft()

        self.assertNotEqual(first_draft_run_id, second_draft_run_id)

    def test_resume_returns_latest_active_draft_for_scope(self) -> None:
        first_draft_run_id, _proposal_id, _candidate_id = self._start_draft()
        second_draft_run_id, _proposal_id_2, _candidate_id_2 = self._start_draft()

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}):
            response = self.client.get(
                "/v1/stationary-energy-drafts/resume",
                params={
                    "user_id": "user-1",
                    "city_id": "city-1",
                    "inventory_id": "inventory-1",
                    "sector_code": "stationary_energy",
                },
                headers=_auth_headers(),
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["draft_run_id"], second_draft_run_id)
        self.assertNotEqual(response.json()["draft_run_id"], first_draft_run_id)

    def test_list_returns_active_drafts_for_scope(self) -> None:
        oldest_draft_run_id, _proposal_id, _candidate_id = self._start_draft()
        reviewed_draft_run_id, _proposal_id_2, _candidate_id_2 = self._start_draft()
        saved_draft_run_id, _proposal_id_3, _candidate_id_3 = self._start_draft()

        reviewed_decisions = self._complete_review_decisions(reviewed_draft_run_id)
        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}):
            review_response = self.client.post(
                f"/v1/stationary-energy-drafts/{reviewed_draft_run_id}/review",
                json={"user_id": "user-1", "decisions": reviewed_decisions},
                headers=_auth_headers(),
            )

        self.assertEqual(review_response.status_code, 200, review_response.text)
        self._set_draft_run_status(saved_draft_run_id, "saved")

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}):
            response = self.client.get(
                "/v1/stationary-energy-drafts",
                params={
                    "user_id": "user-1",
                    "city_id": "city-1",
                    "inventory_id": "inventory-1",
                    "sector_code": "stationary_energy",
                },
                headers=_auth_headers(),
            )

        self.assertEqual(response.status_code, 200, response.text)
        drafts = response.json()["drafts"]
        self.assertEqual(
            [draft["draft_run_id"] for draft in drafts],
            [reviewed_draft_run_id, oldest_draft_run_id],
        )
        self.assertEqual(drafts[0]["status"], "reviewed")
        self.assertGreater(drafts[0]["resolved_review_count"], 0)
        self.assertTrue(
            all(draft["draft_run_id"] != saved_draft_run_id for draft in drafts)
        )

    def test_resume_ignores_saved_draft_runs(self) -> None:
        active_draft_run_id, _proposal_id, _candidate_id = self._start_draft()
        saved_draft_run_id, _proposal_id_2, _candidate_id_2 = self._start_draft()
        self._set_draft_run_status(saved_draft_run_id, "saved")

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}):
            response = self.client.get(
                "/v1/stationary-energy-drafts/resume",
                params={
                    "user_id": "user-1",
                    "city_id": "city-1",
                    "inventory_id": "inventory-1",
                },
                headers=_auth_headers(),
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["draft_run_id"], active_draft_run_id)

    def test_resume_marks_draft_stale_when_connected_sources_change(self) -> None:
        mock_client = _mock_cc_client()
        stale_context = _context_payload()
        stale_context["source_candidates"] = [
            {
                "datasource_id": "ds-applicable",
                "name": "Applicable source",
                "publisher_name": "Open Data Publisher",
                "dataset_name": "Building energy",
                "dataset_year": 2024,
                "url": "https://example.test/source",
                "geography_match": "city",
                "source_scope": {
                    "sector_id": "I",
                    "sector_name": "Stationary Energy",
                    "subsector_id": "I.1",
                    "subsector_name": "Residential buildings",
                    "scope_id": "1",
                    "scope_name": "Scope 1",
                },
                "source_data": {"raw": "kept"},
                "normalized_rows": [
                    {
                        "value": 100,
                        "unit": "MWh",
                        "emissions_value_100yr": "1000000",
                        "emissions_unit": "kgCO2e",
                    }
                ],
                "applicability_status": "applicable",
                "applicability_issues": [],
                "quality_score": "0.91",
            },
            {
                "datasource_id": "ds-replacement",
                "name": "Replacement source",
                "publisher_name": "Open Data Publisher",
                "dataset_name": "Commercial buildings",
                "dataset_year": 2024,
                "url": "https://example.test/replacement",
                "geography_match": "city",
                "source_scope": {
                    "sector_id": "I",
                    "sector_name": "Stationary Energy",
                    "subsector_id": "I.2",
                    "subsector_name": "Commercial buildings",
                    "scope_id": "1",
                    "scope_name": "Scope 1",
                },
                "source_data": {"raw": "new"},
                "normalized_rows": [
                    {
                        "value": 220,
                        "unit": "MWh",
                        "emissions_value_100yr": "2200000",
                        "emissions_unit": "kgCO2e",
                    }
                ],
                "applicability_status": "applicable",
                "applicability_issues": [],
                "quality_score": "0.88",
            },
        ]
        mock_client.load_stationary_energy_context = AsyncMock(
            side_effect=[_context_payload(), stale_context]
        )

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

            resume_response = self.client.get(
                "/v1/stationary-energy-drafts/resume",
                params={
                    "user_id": "user-1",
                    "city_id": "city-1",
                    "inventory_id": "inventory-1",
                },
                headers=_auth_headers(),
            )

        self.assertEqual(resume_response.status_code, 200, resume_response.text)
        self.assertEqual(
            resume_response.json()["staleness"],
            {
                "is_stale": True,
                "reason": "connected_sources_changed",
                "stored_source_ids": ["ds-applicable", "ds-commercial"],
                "current_source_ids": ["ds-applicable", "ds-replacement"],
            },
        )
