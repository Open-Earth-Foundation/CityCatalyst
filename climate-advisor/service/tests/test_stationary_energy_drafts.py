from __future__ import annotations

import base64
import asyncio
import json
import os
import unittest
from decimal import Decimal
from types import SimpleNamespace
from typing import Any, AsyncIterator
from unittest.mock import AsyncMock, Mock, patch
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

pytest.importorskip("pgvector.sqlalchemy")

from app.db import Base
from app.db.session import get_session
from app.main import get_app
from app.models.db.stationary_energy_draft import (
    StationaryEnergyDraftProposal,
    StationaryEnergyDraftRun,
    StationaryEnergyDraftSourceCandidate,
)
from app.models.requests import MessageCreateRequest
from app.services.citycatalyst_client import CityCatalystClientError
from app.services.stationary_energy_draft_service import (
    COMMIT_ACCEPTED_CAPABILITY,
    LOAD_CONTEXT_CAPABILITY,
)
from app.services.stationary_energy_llm_service import (
    StationaryEnergyLLMProposal,
    StationaryEnergyLLMProposalResult,
    StationaryEnergyLLMServiceError,
    StationaryEnergyProposalLLMService,
)
from app.utils.streaming_handler import StreamingHandler


TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


def _unsigned_jwt(claims: dict[str, Any]) -> str:
    def encode_json(payload: dict[str, Any]) -> str:
        raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

    return f"{encode_json({'alg': 'none', 'typ': 'JWT'})}.{encode_json(claims)}.signature"


def _expired_jwt() -> str:
    return _unsigned_jwt({"sub": "user-1", "exp": 1})


def _active_jwt(user_id: str = "user-1") -> str:
    return _unsigned_jwt({"sub": user_id, "exp": 4102444800})


def _auth_headers(user_id: str = "user-1") -> dict[str, str]:
    return {"Authorization": f"Bearer {_active_jwt(user_id)}"}


def _context_payload() -> dict[str, Any]:
    return {
        "city": {
            "city_id": "city-1",
            "name": "Testopolis",
            "locode": "US TST",
            "country": "United States",
            "country_locode": "US",
            "region": "Test Region",
            "area": "123.4",
        },
        "inventory": {
            "inventory_id": "inventory-1",
            "year": 2024,
            "inventory_type": "community",
            "gwp": "AR5",
            "total_emissions": "1000.5",
        },
        "taxonomy": [
            {
                "sector_id": "I",
                "sector_name": "Stationary Energy",
                "sector_reference_number": "I",
                "subsector_id": "I.1",
                "subsector_name": "Residential buildings",
                "subsector_reference_number": "I.1",
                "scope_id": "1",
                "scope_name": "Scope 1",
            },
            {
                "sector_id": "I",
                "sector_name": "Stationary Energy",
                "sector_reference_number": "I",
                "subsector_id": "I.2",
                "subsector_name": "Commercial buildings",
                "subsector_reference_number": "I.2",
                "scope_id": "1",
                "scope_name": "Scope 1",
            }
        ],
        "current_values": [
            {
                "inventory_value_id": "value-1",
                "subsector_id": "I.1",
                "scope_id": "1",
                "value": "42",
                "unit": "tCO2e",
                "datasource_id": "existing-ds",
            }
        ],
        "source_candidates": [
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
                "normalized_rows": [{"value": 100, "unit": "MWh"}],
                "applicability_status": "applicable",
                "applicability_issues": [],
                "quality_score": "0.91",
            },
            {
                "datasource_id": "ds-removed",
                "name": "Removed source",
                "geography_match": "country",
                "source_scope": {"subsector_id": "I.1"},
                "normalized_rows": [],
                "applicability_status": "removed",
                "applicability_issues": ["Wrong geography"],
            },
            {
                "datasource_id": "ds-commercial",
                "name": "Commercial source",
                "geography_match": "city",
                "source_scope": {
                    "sector_id": "I",
                    "sector_name": "Stationary Energy",
                    "subsector_id": "I.2",
                    "subsector_name": "Commercial buildings",
                    "scope_id": "1",
                    "scope_name": "Scope 1",
                },
                "normalized_rows": [{"value": 200, "unit": "MWh"}],
                "applicability_status": "applicable",
                "applicability_issues": [],
            },
            {
                "datasource_id": "ds-failed",
                "name": "Failed source",
                "geography_match": "unknown",
                "source_scope": {"subsector_id": "I.1"},
                "normalized_rows": [],
                "applicability_status": "failed",
                "applicability_issues": ["Fetch failed"],
                "failure_reason": "Upstream timeout",
            },
        ],
        "permission_summary": {"can_review": True, "can_commit": False},
        "guidance_context": {
            "sector_overview": "Stationary Energy covers building and facility energy use.",
            "scope_rules": ["Use the GPC stationary energy scope mapping provided by CC."],
            "taxonomy_labels": {"I.1": "Residential buildings", "I.2": "Commercial buildings"},
            "methodology_summaries": [
                "Prefer subsector- and scope-matched energy datasets before broader proxies."
            ],
            "unit_conventions": ["Keep activity units aligned with the source dataset."],
            "source_selection_rules": [
                "Choose applicable city-level sources before broader regional or country sources."
            ],
            "known_limits_or_gaps": ["Commercial coverage can be incomplete for some cities."],
        },
    }


class StationaryEnergyDraftRouteTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.engine = create_async_engine(
            TEST_DATABASE_URL,
            echo=False,
            poolclass=StaticPool,
            connect_args={"check_same_thread": False},
        )
        self.session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
            self.engine,
            expire_on_commit=False,
        )

        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        self.app = get_app()

        async def get_test_session() -> AsyncIterator[AsyncSession]:
            async with self.session_factory() as session:
                yield session

        self.app.dependency_overrides[get_session] = get_test_session
        self.client = TestClient(self.app)
        self.default_cc_client = self._mock_cc_client()
        self.cc_client_patcher = patch(
            "app.services.stationary_energy_draft_service.CityCatalystClient",
            return_value=self.default_cc_client,
        )
        self.cc_client_patcher.start()

    async def asyncTearDown(self) -> None:
        self.cc_client_patcher.stop()
        self.app.dependency_overrides.clear()
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await self.engine.dispose()

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
        mock_client = self._mock_cc_client()
        mock_llm = self._mock_llm_generator()

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}), patch(
            "app.services.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
        ), patch(
            "app.services.stationary_energy_draft_service.StationaryEnergyProposalLLMService",
            return_value=mock_llm,
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

            status_response = self.client.get(
                f"/v1/stationary-energy-drafts/{draft_run_id}",
                params={"user_id": "user-1"},
                headers=_auth_headers(),
            )

        self.assertEqual(status_response.status_code, 200, status_response.text)
        status_data = status_response.json()
        self.assertEqual(status_data["status"], "ready")
        self.assertEqual(len(status_data["source_candidates"]), 2)
        self.assertEqual(
            sorted(candidate["applicability_status"] for candidate in status_data["source_candidates"]),
            ["applicable", "applicable"],
        )
        self.assertEqual(len(status_data["proposals"]), 2)
        self.assertEqual(status_data["llm_trace"]["model"], "mock-llm")
        self.assertEqual(start_data["llm_trace"]["model"], "mock-llm")
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
            proposal["target_ref"]["subsector_id"]: proposal["recommended_datasource_id"]
            for proposal in status_data["proposals"]
        }
        self.assertEqual(datasource_by_subsector["I.1"], "ds-applicable")
        self.assertEqual(datasource_by_subsector["I.2"], "ds-commercial")
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
        mock_llm.generate_proposals.assert_awaited_once()
        llm_candidates = mock_llm.generate_proposals.await_args.kwargs[
            "stored_source_candidates"
        ]
        self.assertEqual(
            sorted(candidate["datasource_id"] for candidate in llm_candidates),
            ["ds-applicable", "ds-commercial"],
        )
        context_summary = self._draft_context_summary(draft_run_id)
        self.assertEqual(context_summary["source_candidates_count"], 2)
        self.assertIn("guidance_context", context_summary)
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
        mock_client = self._mock_cc_client()
        mock_llm = self._mock_llm_generator()
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
                "normalized_rows": [{"value": 100, "unit": "MWh"}],
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
                "normalized_rows": [{"value": 220, "unit": "MWh"}],
                "applicability_status": "applicable",
                "applicability_issues": [],
                "quality_score": "0.88",
            },
        ]
        mock_client.load_stationary_energy_context = AsyncMock(
            side_effect=[_context_payload(), stale_context]
        )

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}), patch(
            "app.services.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
        ), patch(
            "app.services.stationary_energy_draft_service.StationaryEnergyProposalLLMService",
            return_value=mock_llm,
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

    def test_start_uses_request_bearer_token_when_thread_token_is_expired(self) -> None:
        thread_id = self._create_thread("user-1", context={"access_token": _expired_jwt()})
        mock_client = self._mock_cc_client()
        mock_llm = self._mock_llm_generator()

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}), patch(
            "app.services.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
        ), patch(
            "app.services.stationary_energy_draft_service.StationaryEnergyProposalLLMService",
            return_value=mock_llm,
        ):
            response = self.client.post(
                "/v1/stationary-energy-drafts/start",
                json={
                    "user_id": "user-1",
                    "city_id": "city-1",
                    "inventory_id": "inventory-1",
                    "thread_id": str(thread_id),
                },
                headers=_auth_headers(),
            )

        self.assertEqual(response.status_code, 201, response.text)
        mock_client.refresh_token.assert_not_awaited()
        self.assertEqual(
            mock_client.get_stationary_energy_allowed_capabilities.await_args.kwargs["token"],
            _active_jwt(),
        )

    def test_start_rejects_thread_user_mismatch_before_calling_cc(self) -> None:
        thread_id = self._create_thread("thread-owner")
        mock_client = self._mock_cc_client()
        mock_llm = self._mock_llm_generator()

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}), patch(
            "app.services.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
        ), patch(
            "app.services.stationary_energy_draft_service.StationaryEnergyProposalLLMService",
            return_value=mock_llm,
        ):
            response = self.client.post(
                "/v1/stationary-energy-drafts/start",
                json={
                    "user_id": "other-user",
                    "city_id": "city-1",
                    "inventory_id": "inventory-1",
                    "thread_id": str(thread_id),
                },
            )

        self.assertEqual(response.status_code, 403)
        mock_client.get_stationary_energy_allowed_capabilities.assert_not_awaited()
        mock_llm.generate_proposals.assert_not_awaited()

    def test_start_requires_access_token_before_calling_cc(self) -> None:
        mock_client = self._mock_cc_client()
        mock_llm = self._mock_llm_generator()

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}), patch(
            "app.services.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
        ), patch(
            "app.services.stationary_energy_draft_service.StationaryEnergyProposalLLMService",
            return_value=mock_llm,
        ):
            response = self.client.post(
                "/v1/stationary-energy-drafts/start",
                json={
                    "user_id": "user-1",
                    "city_id": "city-1",
                    "inventory_id": "inventory-1",
                },
            )

        self.assertEqual(response.status_code, 401)
        mock_client.refresh_token.assert_not_awaited()
        mock_client.get_stationary_energy_allowed_capabilities.assert_not_awaited()
        mock_llm.generate_proposals.assert_not_awaited()

    def test_start_rejects_token_that_cc_does_not_authorize(self) -> None:
        mock_client = self._mock_cc_client()
        mock_client.get_stationary_energy_allowed_capabilities = AsyncMock(
            side_effect=CityCatalystClientError("token rejected", status_code=401)
        )
        mock_llm = self._mock_llm_generator()

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}), patch(
            "app.services.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
        ), patch(
            "app.services.stationary_energy_draft_service.StationaryEnergyProposalLLMService",
            return_value=mock_llm,
        ):
            response = self.client.post(
                "/v1/stationary-energy-drafts/start",
                json={
                    "user_id": "user-1",
                    "city_id": "city-1",
                    "inventory_id": "inventory-1",
                },
                headers=_auth_headers("other-user"),
            )

        self.assertEqual(response.status_code, 401)
        mock_client.get_stationary_energy_allowed_capabilities.assert_awaited_once()
        mock_llm.generate_proposals.assert_not_awaited()

    def test_start_returns_502_when_llm_generation_fails(self) -> None:
        mock_client = self._mock_cc_client()
        mock_llm = Mock()
        mock_llm.generate_proposals = AsyncMock(
            side_effect=StationaryEnergyLLMServiceError("Stationary Energy LLM request failed")
        )

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}), patch(
            "app.services.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
        ), patch(
            "app.services.stationary_energy_draft_service.StationaryEnergyProposalLLMService",
            return_value=mock_llm,
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
        self.assertIn("Stationary Energy LLM request failed", response.text)
        mock_client.load_stationary_energy_context.assert_awaited_once()
        mock_llm.generate_proposals.assert_awaited_once()

    def test_retry_failed_draft_regenerates_snapshot(self) -> None:
        mock_client = self._mock_cc_client()
        failing_llm = Mock()
        failing_llm.generate_proposals = AsyncMock(
            side_effect=StationaryEnergyLLMServiceError("Stationary Energy LLM request failed")
        )

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}), patch(
            "app.services.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
        ), patch(
            "app.services.stationary_energy_draft_service.StationaryEnergyProposalLLMService",
            return_value=failing_llm,
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
            "generating",
        )

        retry_client = self._mock_cc_client()
        success_llm = self._mock_llm_generator()
        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}), patch(
            "app.services.stationary_energy_draft_service.CityCatalystClient",
            return_value=retry_client,
        ), patch(
            "app.services.stationary_energy_draft_service.StationaryEnergyProposalLLMService",
            return_value=success_llm,
        ):
            retry_response = self.client.post(
                f"/v1/stationary-energy-drafts/{draft_run_id}/retry",
                json={"user_id": "user-1"},
                headers=_auth_headers(),
            )

        self.assertEqual(retry_response.status_code, 200, retry_response.text)
        retry_data = retry_response.json()
        self.assertEqual(retry_data["status"], "ready")
        self.assertIsNone(retry_data["error_summary"])
        self.assertEqual(len(retry_data["proposals"]), 2)

    def test_retry_failure_keeps_previous_snapshot_atomic(self) -> None:
        draft_run_id, _proposal_id, _candidate_id = self._start_draft()
        initial_status = self._get_status(draft_run_id)

        retry_context = _context_payload()
        retry_context["source_candidates"] = [
            {
                "datasource_id": "ds-retry-only",
                "name": "Retry-only source",
                "geography_match": "city",
                "source_scope": {
                    "sector_id": "I",
                    "subsector_id": "I.1",
                    "scope_id": "1",
                },
                "normalized_rows": [{"value": 999, "unit": "MWh"}],
                "applicability_status": "applicable",
                "applicability_issues": [],
            }
        ]

        retry_client = self._mock_cc_client()
        retry_client.load_stationary_energy_context = AsyncMock(return_value=retry_context)
        failing_llm = Mock()
        failing_llm.generate_proposals = AsyncMock(
            side_effect=StationaryEnergyLLMServiceError("Stationary Energy LLM request failed")
        )

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}), patch(
            "app.services.stationary_energy_draft_service.CityCatalystClient",
            return_value=retry_client,
        ), patch(
            "app.services.stationary_energy_draft_service.StationaryEnergyProposalLLMService",
            return_value=failing_llm,
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
            "generating",
        )
        self.assertEqual(
            [candidate["candidate_id"] for candidate in failed_status_data["source_candidates"]],
            [candidate["candidate_id"] for candidate in initial_status["source_candidates"]],
        )
        self.assertEqual(
            [candidate["datasource_id"] for candidate in failed_status_data["source_candidates"]],
            [candidate["datasource_id"] for candidate in initial_status["source_candidates"]],
        )
        self.assertEqual(
            [proposal["proposal_id"] for proposal in failed_status_data["proposals"]],
            [proposal["proposal_id"] for proposal in initial_status["proposals"]],
        )

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
        self.assertEqual(review_data["decisions"][0]["selected_candidate_id"], candidate_id)
        self.assertEqual(review_data["decisions"][0]["selected_source_id"], expected_selected_source_id)
        self.assertEqual(review_data["decisions"][0]["decision_version"], 1)
        self.assertEqual(review_data["decisions"][0]["commit_status"], "pending_cc_commit")

        self.assertEqual(status_response.status_code, 200, status_response.text)
        status_data = status_response.json()
        self.assertEqual(len(status_data["review_decisions"]), len(decisions))
        self.assertEqual(status_data["review_decisions"][0]["user_id"], "user-1")

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
        self.assertTrue(all(decision["decision_version"] == 2 for decision in second_review_data["decisions"]))

        version_history: dict[str, list[int]] = {}
        for decision in status_data["review_decisions"]:
            version_history.setdefault(decision["proposal_id"], []).append(decision["decision_version"])

        self.assertTrue(version_history)
        self.assertTrue(all(versions == [1, 2] for versions in version_history.values()))

    def test_save_commits_latest_pending_review_decisions(self) -> None:
        mock_client = self._mock_cc_client()
        mock_llm = self._mock_llm_generator()

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}), patch(
            "app.services.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
        ), patch(
            "app.services.stationary_energy_draft_service.StationaryEnergyProposalLLMService",
            return_value=mock_llm,
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
        commit_rows = mock_client.commit_stationary_energy_accepted.await_args.kwargs["request_payload"]["rows"]
        self.assertTrue(commit_rows)
        self.assertTrue(all(row["selected_source_id"] for row in commit_rows))

    def test_save_commits_manual_review_decisions(self) -> None:
        mock_client = self._mock_cc_client()
        mock_llm = self._mock_llm_generator()

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}), patch(
            "app.services.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
        ), patch(
            "app.services.stationary_energy_draft_service.StationaryEnergyProposalLLMService",
            return_value=mock_llm,
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

    def test_status_rejects_wrong_user(self) -> None:
        draft_run_id, _proposal_id, _candidate_id = self._start_draft()

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}):
            response = self.client.get(
                f"/v1/stationary-energy-drafts/{draft_run_id}",
                params={"user_id": "other-user"},
                headers=_auth_headers("other-user"),
            )

        self.assertEqual(response.status_code, 403)

    async def test_streaming_chat_loads_stationary_energy_draft_context(self) -> None:
        draft_run_id = await self._create_persisted_draft_snapshot()
        handler = StreamingHandler(
            thread_id=uuid4(),
            user_id="user-1",
            session_factory=self.session_factory,
        )
        payload = MessageCreateRequest(
            user_id="user-1",
            content="Why did you choose these Stationary Energy sources?",
            context={"stationary_energy_draft_run_id": str(draft_run_id)},
        )

        history = await handler._load_conversation_history(None, payload)

        self.assertGreaterEqual(len(history), 2)
        self.assertEqual(history[0]["role"], "system")
        self.assertIn("STATIONARY_ENERGY_DRAFT_CONTEXT_JSON", history[0]["content"])
        self.assertIn("Testopolis", history[0]["content"])
        self.assertIn("ds-chat", history[0]["content"])
        self.assertIn("openai/gpt-5.4", history[0]["content"])
        self.assertIn("guidance_context", history[0]["content"])
        self.assertIn("Use subsector-specific energy activity data first.", history[0]["content"])
        self.assertNotIn("raw-output-should-not-be-in-chat-context", history[0]["content"])
        self.assertEqual(history[-1]["role"], "user")
        self.assertEqual(history[-1]["content"], payload.content)

    def _mock_cc_client(self) -> AsyncMock:
        mock_client = AsyncMock()
        mock_client.refresh_token = AsyncMock(return_value=("fresh-token", 3600))
        mock_client.get_stationary_energy_allowed_capabilities = AsyncMock(
            side_effect=lambda **kwargs: (
                [LOAD_CONTEXT_CAPABILITY]
                if kwargs.get("workflow_step") == "draft"
                else [COMMIT_ACCEPTED_CAPABILITY]
            )
        )
        mock_client.load_stationary_energy_context = AsyncMock(return_value=_context_payload())
        mock_client.commit_stationary_energy_accepted = AsyncMock(
            side_effect=self._mock_commit_response
        )
        return mock_client

    def _mock_llm_generator(self) -> Mock:
        async def generate_proposals(
            *,
            context: Any,
            stored_source_candidates: list[dict[str, Any]],
            allowed_capabilities: list[str],
            trace_id: str | None,
        ) -> StationaryEnergyLLMProposalResult:
            candidate_by_datasource = {
                candidate["datasource_id"]: candidate
                for candidate in stored_source_candidates
            }
            residential = candidate_by_datasource["ds-applicable"]
            commercial = candidate_by_datasource["ds-commercial"]
            proposals = [
                {
                    "target_ref": context.taxonomy[0].model_dump(mode="json", exclude_none=True),
                    "current_value": context.current_values[0].model_dump(mode="json", exclude_none=True),
                    "recommended_candidate_id": UUID(residential["candidate_id"]),
                    "recommended_datasource_id": residential["datasource_id"],
                    "alternative_candidate_ids": [],
                    "proposed_value": {
                        "datasource_id": residential["datasource_id"],
                        "row": residential["normalized_rows"][0],
                    },
                    "rationale": "Mock LLM selected the stored residential source.",
                    "status": "ready",
                    "confidence_score": Decimal("0.91"),
                },
                {
                    "target_ref": context.taxonomy[1].model_dump(mode="json", exclude_none=True),
                    "current_value": None,
                    "recommended_candidate_id": UUID(commercial["candidate_id"]),
                    "recommended_datasource_id": commercial["datasource_id"],
                    "alternative_candidate_ids": [],
                    "proposed_value": {
                        "datasource_id": commercial["datasource_id"],
                        "row": commercial["normalized_rows"][0],
                    },
                    "rationale": "Mock LLM selected the stored commercial source.",
                    "status": "ready",
                    "confidence_score": Decimal("0.82"),
                },
            ]
            return StationaryEnergyLLMProposalResult(
                proposals=proposals,
                trace={
                    "model": "mock-llm",
                    "input": {
                        "allowed_capabilities": allowed_capabilities,
                        "source_candidates": stored_source_candidates,
                    },
                    "raw_output": "{\"proposals\": []}",
                    "parsed_output": {"proposal_count": len(proposals)},
                    "trace_id": trace_id,
                },
            )

        mock_generator = Mock()
        mock_generator.generate_proposals = AsyncMock(side_effect=generate_proposals)
        return mock_generator

    def _start_draft(self) -> tuple[str, str, str]:
        mock_client = self._mock_cc_client()
        mock_llm = self._mock_llm_generator()
        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}), patch(
            "app.services.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
        ), patch(
            "app.services.stationary_energy_draft_service.StationaryEnergyProposalLLMService",
            return_value=mock_llm,
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
            self.assertEqual(response.status_code, 201, response.text)

            draft_run_id = response.json()["draft_run_id"]
            status_response = self.client.get(
                f"/v1/stationary-energy-drafts/{draft_run_id}",
                params={"user_id": "user-1"},
                headers=_auth_headers(),
            )
        self.assertEqual(status_response.status_code, 200, status_response.text)
        status_data = status_response.json()
        proposal = status_data["proposals"][0]
        recommended_candidate_id = proposal["recommended_candidate_id"]
        matching_candidate = next(
            (
                candidate
                for candidate in status_data["source_candidates"]
                if candidate["candidate_id"] == recommended_candidate_id
                and candidate["applicability_status"] == "applicable"
            ),
            None,
        )
        if matching_candidate is None:
            proposal_subsector_id = proposal["target_ref"].get("subsector_id")
            matching_candidate = next(
                candidate
                for candidate in status_data["source_candidates"]
                if candidate["applicability_status"] == "applicable"
                and candidate["source_scope"].get("subsector_id") == proposal_subsector_id
            )
        return (
            draft_run_id,
            proposal["proposal_id"],
            matching_candidate["candidate_id"],
        )

    def _get_status(self, draft_run_id: str, user_id: str = "user-1") -> dict[str, Any]:
        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}):
            response = self.client.get(
                f"/v1/stationary-energy-drafts/{draft_run_id}",
                params={"user_id": user_id},
                headers=_auth_headers(user_id),
            )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def _draft_context_summary(self, draft_run_id: str) -> dict[str, Any]:
        async def load_summary() -> dict[str, Any]:
            async with self.session_factory() as session:
                result = await session.execute(
                    select(StationaryEnergyDraftRun).where(
                        StationaryEnergyDraftRun.draft_run_id == UUID(draft_run_id)
                    )
                )
                draft_run = result.scalar_one()
                return draft_run.context_summary or {}

        return asyncio.run(load_summary())

    @staticmethod
    async def _mock_commit_response(
        *,
        request_payload: dict[str, Any],
        token: str | None = None,
    ) -> dict[str, Any]:
        rows = request_payload.get("rows") or []
        return {
            "draft_run_id": request_payload.get("draft_run_id"),
            "inventory_id": request_payload.get("inventory_id"),
            "results": [
                {
                    "proposal_id": row["proposal_id"],
                    "decision_version": row["decision_version"],
                    "row_type": row.get("row_type"),
                    "selected_source_id": row.get("selected_source_id"),
                    "manual_value": row.get("manual_value"),
                    "manual_unit": row.get("manual_unit"),
                    "status": "committed",
                    "token_present": bool(token),
                }
                for row in rows
            ],
        }

    def _complete_review_decisions(
        self,
        draft_run_id: str,
        overrides: dict[str, dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        overrides = overrides or {}
        status_data = self._get_status(draft_run_id)
        decisions: list[dict[str, Any]] = []
        for proposal in status_data["proposals"]:
            proposal_id = proposal["proposal_id"]
            if proposal_id in overrides:
                decisions.append(overrides[proposal_id])
            elif proposal.get("recommended_candidate_id"):
                decisions.append({"proposal_id": proposal_id, "action": "accept"})
            else:
                decisions.append({"proposal_id": proposal_id, "action": "leave_draft"})
        return decisions

    def _create_thread(self, user_id: str, context: dict[str, Any] | None = None) -> UUID:
        response = self.client.post(
            "/v1/threads",
            json={"user_id": user_id, "context": context or {"access_token": _active_jwt(user_id)}},
        )
        self.assertEqual(response.status_code, 201, response.text)
        return UUID(response.json()["thread_id"])

    def _latest_draft_run_id(self, user_id: str) -> str:
        async def load_id() -> str:
            async with self.session_factory() as session:
                result = await session.execute(
                    select(StationaryEnergyDraftRun)
                    .where(StationaryEnergyDraftRun.user_id == user_id)
                    .order_by(StationaryEnergyDraftRun.updated_at.desc())
                )
                draft_run = result.scalars().first()
                self.assertIsNotNone(draft_run)
                return str(draft_run.draft_run_id)

        return asyncio.run(load_id())

    def _set_draft_run_status(self, draft_run_id: str, status: str) -> None:
        async def set_status() -> None:
            async with self.session_factory() as session:
                result = await session.execute(
                    select(StationaryEnergyDraftRun).where(
                        StationaryEnergyDraftRun.draft_run_id == UUID(draft_run_id)
                    )
                )
                draft_run = result.scalar_one()
                draft_run.status = status
                await session.commit()

        asyncio.run(set_status())

    async def _create_persisted_draft_snapshot(self) -> UUID:
        async with self.session_factory() as session:
            draft_run = StationaryEnergyDraftRun(
                user_id="user-1",
                city_id="city-1",
                inventory_id="inventory-1",
                sector_code="stationary_energy",
                status="ready",
                workflow_step="draft",
                context_summary={
                    "city": {"city_id": "city-1", "name": "Testopolis"},
                    "inventory": {"inventory_id": "inventory-1", "year": 2024},
                    "taxonomy_count": 1,
                    "current_values_count": 1,
                    "source_candidates_count": 1,
                    "guidance_context": {
                        "sector_overview": "Stationary Energy guidance snapshot.",
                        "methodology_summaries": [
                            "Use subsector-specific energy activity data first."
                        ],
                    },
                    "llm_trace": {
                        "model": "openai/gpt-5.4",
                        "raw_output": "raw-output-should-not-be-in-chat-context",
                        "parsed_output": {"proposals": [{"status": "ready"}]},
                    },
                },
                permission_summary={"can_review": True},
            )
            session.add(draft_run)
            await session.flush()

            candidate = StationaryEnergyDraftSourceCandidate(
                draft_run_id=draft_run.draft_run_id,
                datasource_id="ds-chat",
                name="Chat context source",
                geography_match="city",
                source_scope={"subcategory_id": "I.1.2", "scope_id": "2"},
                source_data={"city": "Testopolis"},
                normalized_rows=[{"activity_value": 123, "activity_unit": "MWh"}],
                applicability_status="applicable",
                applicability_issues=[],
                quality_score=Decimal("0.9"),
                confidence_notes="Loaded for chat context.",
            )
            session.add(candidate)
            await session.flush()

            proposal = StationaryEnergyDraftProposal(
                draft_run_id=draft_run.draft_run_id,
                target_ref={"subcategory_id": "I.1.2", "scope_id": "2"},
                current_value={"value": "120", "unit": "MWh"},
                recommended_candidate_id=candidate.candidate_id,
                recommended_datasource_id=candidate.datasource_id,
                alternative_candidate_ids=[],
                proposed_value={"activity_value": 123, "activity_unit": "MWh"},
                rationale="Stored proposal for chat explanation.",
                status="ready",
                confidence_score=Decimal("0.9"),
            )
            session.add(proposal)
            await session.commit()
            return draft_run.draft_run_id


class StationaryEnergyMigrationTests(unittest.TestCase):
    def test_migration_contains_required_tables_and_indexes(self) -> None:
        table_names = {
            StationaryEnergyDraftRun.__tablename__,
            "stationary_energy_draft_source_candidates",
            "stationary_energy_draft_proposals",
            "stationary_energy_review_decisions",
        }
        for table_name in table_names:
            self.assertIn(table_name, Base.metadata.tables)

        source_indexes = {
            tuple(index.columns.keys())
            for index in Base.metadata.tables["stationary_energy_draft_source_candidates"].indexes
        }
        self.assertIn(("draft_run_id",), source_indexes)
        self.assertIn(("draft_run_id", "datasource_id"), source_indexes)
        self.assertIn(("draft_run_id", "applicability_status"), source_indexes)
        review_decision_columns = Base.metadata.tables["stationary_energy_review_decisions"].columns
        self.assertIn("decision_version", review_decision_columns)


class StationaryEnergyLLMValidationTests(unittest.TestCase):
    @patch("app.services.stationary_energy_llm_service.configure_agents_tracing")
    @patch("app.services.stationary_energy_llm_service.get_settings")
    def test_service_uses_shared_openrouter_options_and_prompt_config(
        self,
        mock_get_settings,
        _mock_tracing,
    ) -> None:
        """Verify prompt loading and OpenRouter client setup are centralized."""

        prompts = Mock()
        prompts.get_prompt = Mock(return_value="Stationary Energy prompt")
        mock_settings = SimpleNamespace(
            openrouter_api_key="test-key",
            openrouter_base_url="https://custom-openrouter.example/v1",
            openrouter_model="openai/gpt-4.1",
            llm=SimpleNamespace(
                models=SimpleNamespace(
                    orchestrator=SimpleNamespace(
                        name="openai/gpt-4.1",
                        temperature=0.0,
                    ),
                    agentic_flow=SimpleNamespace(
                        name="openai/gpt-5.4",
                        temperature=0.1,
                    ),
                ),
                prompts=prompts,
                api=SimpleNamespace(
                    openrouter=SimpleNamespace(
                        base_url="https://custom-openrouter.example/v1",
                        timeout_ms=30000,
                        retry_attempts=3,
                    )
                ),
            ),
            langsmith_tracing_enabled=False,
        )
        mock_get_settings.return_value = mock_settings
        client_kwargs = {
            "api_key": "test-key",
            "base_url": "https://custom-openrouter.example/v1",
            "timeout": 30.0,
            "max_retries": 3,
            "default_headers": {
                "HTTP-Referer": "https://citycatalyst.ai",
                "X-Title": "CityCatalyst Climate Advisor",
                "Accept": "application/json",
            },
        }

        with patch(
            "app.services.stationary_energy_llm_service.build_openrouter_client_options",
            return_value=SimpleNamespace(
                base_url="https://custom-openrouter.example/v1",
                kwargs=client_kwargs,
            ),
        ) as mock_builder, patch(
            "app.services.stationary_energy_llm_service.AsyncOpenAI"
        ) as mock_client_class:
            service = StationaryEnergyProposalLLMService()

        prompts.get_prompt.assert_called_once_with(
            "stationary_energy_draft_generation"
        )
        mock_builder.assert_called_once_with(
            mock_settings,
            missing_api_key_message=(
                "OPENROUTER_API_KEY must be set for Stationary Energy LLM proposals"
            ),
            error_cls=StationaryEnergyLLMServiceError,
        )
        mock_client_class.assert_called_once_with(**client_kwargs)
        self.assertEqual(service.model, "openai/gpt-5.4")
        self.assertEqual(service.temperature, 0.1)
        self.assertEqual(service.system_prompt, "Stationary Energy prompt")

    def test_rejects_candidate_datasource_mismatch(self) -> None:
        target_ref = _context_payload()["taxonomy"][0]
        candidate_id = uuid4()
        proposal = StationaryEnergyLLMProposal(
            target_ref=target_ref,
            recommended_candidate_id=candidate_id,
            recommended_datasource_id="wrong-ds",
            rationale="Bad source pairing",
            status="ready",
            confidence_score=Decimal("0.5"),
        )

        with self.assertRaisesRegex(ValueError, "does not match"):
            StationaryEnergyProposalLLMService._validate_and_normalize_proposals(
                [proposal],
                [
                    {
                        "candidate_id": str(candidate_id),
                        "datasource_id": "expected-ds",
                        "applicability_status": "applicable",
                        "source_scope": target_ref,
                    }
                ],
                [target_ref],
            )

    def test_rejects_missing_taxonomy_row(self) -> None:
        taxonomy = _context_payload()["taxonomy"]
        proposal = StationaryEnergyLLMProposal(
            target_ref=taxonomy[0],
            recommended_candidate_id=None,
            recommended_datasource_id=None,
            rationale="Only one proposal returned",
            status="gap",
            confidence_score=Decimal("0.5"),
        )

        with self.assertRaisesRegex(ValueError, "omitted taxonomy rows"):
            StationaryEnergyProposalLLMService._validate_and_normalize_proposals(
                [proposal],
                [],
                taxonomy,
            )

    def test_rejects_candidate_outside_target_scope(self) -> None:
        taxonomy = _context_payload()["taxonomy"]
        candidate_id = uuid4()
        proposal = StationaryEnergyLLMProposal(
            target_ref=taxonomy[0],
            recommended_candidate_id=candidate_id,
            recommended_datasource_id="ds-commercial",
            rationale="Bad scope pairing",
            status="ready",
            confidence_score=Decimal("0.5"),
        )

        with self.assertRaisesRegex(ValueError, "outside the proposal target scope"):
            StationaryEnergyProposalLLMService._validate_and_normalize_proposals(
                [proposal],
                [
                    {
                        "candidate_id": str(candidate_id),
                        "datasource_id": "ds-commercial",
                        "applicability_status": "applicable",
                        "source_scope": taxonomy[1],
                    }
                ],
                [taxonomy[0]],
            )


if __name__ == "__main__":
    unittest.main()
