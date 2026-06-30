from __future__ import annotations

import base64
import asyncio
import json
import os
import tempfile
import time
import unittest
from concurrent.futures import Future
from decimal import Decimal
from pathlib import Path
from threading import Thread
from typing import Any, AsyncIterator
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from agents.tool import ToolContext

pytest.importorskip("pgvector.sqlalchemy")

from app.db import Base
from app.db.session import get_session
from app.main import get_app
from app.models.db.stationary_energy_draft import (
    StationaryEnergyDraftProposal,
    StationaryEnergyDraftRun,
    StationaryEnergyDraftSourceCandidate,
)
from app.models.db.thread import Thread as ChatThread
from app.models.requests import MessageCreateRequest
from app.services.citycatalyst_client import CityCatalystClientError
from app.services.stationary_energy.stationary_energy_draft_service import (
    COMMIT_ACCEPTED_CAPABILITY,
    LOAD_CONTEXT_CAPABILITY,
    StationaryEnergyDraftService,
)
from app.services.stationary_energy.stationary_energy_proposal_builder import (
    build_deterministic_proposals,
)
from app.services.stationary_energy.stationary_energy_agent_review import (
    StationaryEnergyAgentReviewService,
)
from app.services.stationary_energy.stationary_energy_review_models import (
    StationaryEnergyAgentReviewChoiceInput,
)
from app.tools.stationary_energy_review_tools import (
    build_stationary_energy_review_tools,
)
from app.tools.stationary_energy_start_draft_tools import (
    build_stationary_energy_start_draft_tools,
)
from app.utils.streaming_handler import StreamingHandler


def _unsigned_jwt(claims: dict[str, Any]) -> str:
    def encode_json(payload: dict[str, Any]) -> str:
        raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

    return (
        f"{encode_json({'alg': 'none', 'typ': 'JWT'})}.{encode_json(claims)}.signature"
    )


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
            },
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
                "normalized_rows": [
                    {
                        "value": 200,
                        "unit": "MWh",
                        "emissions_value_100yr": "2000000",
                        "emissions_unit": "kgCO2e",
                    }
                ],
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
            "scope_rules": [
                "Use the GPC stationary energy scope mapping provided by CC."
            ],
            "taxonomy_labels": {
                "I.1": "Residential buildings",
                "I.2": "Commercial buildings",
            },
            "methodology_summaries": [
                "Prefer subsector- and scope-matched energy datasets before broader proxies."
            ],
            "unit_conventions": [
                "Keep activity units aligned with the source dataset."
            ],
            "source_selection_rules": [
                "Choose applicable city-level sources before broader regional or country sources."
            ],
            "known_limits_or_gaps": [
                "Commercial coverage can be incomplete for some cities."
            ],
        },
    }


class StationaryEnergyDraftRouteTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        fd, database_path = tempfile.mkstemp(prefix="cc-se-drafts-", suffix=".sqlite")
        os.close(fd)
        self.database_path = Path(database_path)
        self.engine = create_async_engine(
            f"sqlite+aiosqlite:///{self.database_path.as_posix()}",
            echo=False,
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
        self.background_futures: list[Future[Any]] = []
        self.default_cc_client = self._mock_cc_client()
        self.cc_client_patcher = patch(
            "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
            return_value=self.default_cc_client,
        )
        self.cc_client_patcher.start()
        self.background_session_factory_patcher = patch(
            "app.services.stationary_energy.stationary_energy_draft_service.get_session_factory",
            return_value=self.session_factory,
        )
        self.background_session_factory_patcher.start()
        self.background_task_patcher = patch(
            "app.services.stationary_energy.stationary_energy_draft_service._schedule_background_task",
            side_effect=self._schedule_background_task,
        )
        self.background_task_patcher.start()

    async def asyncTearDown(self) -> None:
        self.background_task_patcher.stop()
        self._drain_background_futures()
        self.background_session_factory_patcher.stop()
        self.cc_client_patcher.stop()
        self.app.dependency_overrides.clear()
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await self.engine.dispose()
        self.database_path.unlink(missing_ok=True)

    def _schedule_background_task(self, coro: Any) -> Future[Any]:
        """Run draft generation in a thread so sync route tests can observe it."""
        future: Future[Any] = Future()
        self.background_futures.append(future)

        def run() -> None:
            try:
                future.set_result(asyncio.run(coro))
            except BaseException as exc:
                future.set_exception(exc)

        Thread(target=run, daemon=True).start()
        return future

    def _drain_background_futures(self) -> None:
        """Wait for scheduled draft generation before tearing down the DB."""
        for future in self.background_futures:
            try:
                future.result(timeout=5)
            except Exception:
                continue

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

        with patch.dict(
            os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}
        ), patch(
            "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
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
        mock_client = self._mock_cc_client()
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

        with patch.dict(
            os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}
        ), patch(
            "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
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

    def test_start_uses_request_bearer_token_when_thread_token_is_expired(self) -> None:
        thread_id = self._create_thread(
            "user-1", context={"access_token": _expired_jwt()}
        )
        mock_client = self._mock_cc_client()

        with patch.dict(
            os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}
        ), patch(
            "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
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
        self._wait_for_draft_status(response.json()["draft_run_id"], "ready")
        mock_client.refresh_token.assert_not_awaited()
        self.assertEqual(
            mock_client.get_stationary_energy_allowed_capabilities.await_args.kwargs[
                "token"
            ],
            _active_jwt(),
        )

    def test_agent_start_draft_tool_refreshes_expired_thread_token_before_start(
        self,
    ) -> None:
        thread_id = self._create_thread(
            "user-1", context={"access_token": _expired_jwt()}
        )
        token_ref = {"value": _expired_jwt()}
        mock_client = self._mock_cc_client()

        async def exercise() -> dict[str, Any]:
            tools = build_stationary_energy_start_draft_tools(
                session_factory=self.session_factory,
                city_id="city-1",
                inventory_id="inventory-1",
                user_id="user-1",
                thread_id=thread_id,
                token_ref=token_ref,
            )
            start_tool = next(
                tool
                for tool in tools
                if getattr(tool, "name", None) == "stationary_energy_start_draft"
            )
            ctx = ToolContext(
                context=None,
                tool_call_id="test-call",
                tool_name="stationary_energy_start_draft",
                tool_arguments={},
            )

            output = await start_tool.on_invoke_tool(  # type: ignore[attr-defined]
                ctx,
                json.dumps({}),
            )
            return json.loads(output)

        with patch(
            "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
        ):
            data = asyncio.run(exercise())

        self.assertTrue(data["success"], data)
        self._wait_for_draft_status(data["draft_run_id"], "ready")
        mock_client.refresh_token.assert_awaited_once_with("user-1")
        self.assertEqual(token_ref["value"], "fresh-token")
        self.assertEqual(
            mock_client.get_stationary_energy_allowed_capabilities.await_args.kwargs[
                "token"
            ],
            "fresh-token",
        )
        self.assertEqual(
            asyncio.run(self._get_thread_context(thread_id))["access_token"],
            "fresh-token",
        )

    def test_agent_start_draft_tool_maps_http_errors(self) -> None:
        token_ref = {"value": None}

        async def exercise() -> dict[str, Any]:
            tools = build_stationary_energy_start_draft_tools(
                session_factory=self.session_factory,
                city_id="city-1",
                inventory_id="inventory-1",
                user_id="user-1",
                thread_id=None,
                token_ref=token_ref,
            )
            start_tool = next(
                tool
                for tool in tools
                if getattr(tool, "name", None) == "stationary_energy_start_draft"
            )
            ctx = ToolContext(
                context=None,
                tool_call_id="test-call",
                tool_name="stationary_energy_start_draft",
                tool_arguments={},
            )

            output = await start_tool.on_invoke_tool(  # type: ignore[attr-defined]
                ctx,
                json.dumps({}),
            )
            return json.loads(output)

        data = asyncio.run(exercise())

        self.assertFalse(data["success"], data)
        self.assertEqual(data["action"], "stationary_energy_start_draft")
        self.assertEqual(data["message_key"], "tool-error-http")
        self.assertEqual(data["message_params"], {"status": 401})
        self.assertEqual(data["error_code"], "http_401")

    def test_start_rejects_thread_user_mismatch_before_calling_cc(self) -> None:
        thread_id = self._create_thread("thread-owner")
        mock_client = self._mock_cc_client()

        with patch.dict(
            os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}
        ), patch(
            "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
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

    def test_start_requires_access_token_before_calling_cc(self) -> None:
        mock_client = self._mock_cc_client()

        with patch.dict(
            os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}
        ), patch(
            "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
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

    def test_start_rejects_token_that_cc_does_not_authorize(self) -> None:
        mock_client = self._mock_cc_client()
        mock_client.get_stationary_energy_allowed_capabilities = AsyncMock(
            side_effect=CityCatalystClientError("token rejected", status_code=401)
        )

        with patch.dict(
            os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}
        ), patch(
            "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
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

    def test_start_returns_502_when_context_loading_fails(self) -> None:
        mock_client = self._mock_cc_client()
        mock_client.load_stationary_energy_context = AsyncMock(
            side_effect=CityCatalystClientError("context failed", status_code=502)
        )

        with patch.dict(
            os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}
        ), patch(
            "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
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
        mock_client = self._mock_cc_client()
        mock_client.load_stationary_energy_context = AsyncMock(
            side_effect=CityCatalystClientError("context failed", status_code=502)
        )

        with patch.dict(
            os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}
        ), patch(
            "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
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

        retry_client = self._mock_cc_client()
        with patch.dict(
            os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}
        ), patch(
            "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
            return_value=retry_client,
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

        retry_client = self._mock_cc_client()
        retry_client.load_stationary_energy_context = AsyncMock(
            side_effect=CityCatalystClientError("retry context failed", status_code=502)
        )

        with patch.dict(
            os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}
        ), patch(
            "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
            return_value=retry_client,
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

    def test_review_and_save_reject_generating_draft(self) -> None:
        mock_client = self._mock_cc_client()

        def hold_background_task(coro: Any) -> Future[Any]:
            """Leave the draft in generating state for route guard assertions."""
            coro.close()
            future: Future[Any] = Future()
            future.set_result(None)
            return future

        with patch.dict(
            os.environ,
            {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"},
        ), patch(
            "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
        ), patch(
            "app.services.stationary_energy.stationary_energy_draft_service._schedule_background_task",
            side_effect=hold_background_task,
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

    def test_save_commits_latest_pending_review_decisions(self) -> None:
        mock_client = self._mock_cc_client()

        with patch.dict(
            os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}
        ), patch(
            "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
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
        mock_client = self._mock_cc_client()

        with patch.dict(
            os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}
        ), patch(
            "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
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

    def test_agent_review_accept_one_stages_valid_choice(self) -> None:
        draft_run_id, proposal_id, candidate_id = self._start_draft()

        async def exercise() -> dict[str, Any]:
            async with self.session_factory() as session:
                service = StationaryEnergyAgentReviewService(session)
                result = await service.accept_one(
                    draft_run_id=UUID(draft_run_id),
                    user_id="user-1",
                    choice=StationaryEnergyAgentReviewChoiceInput(
                        proposal_id=UUID(proposal_id),
                        candidate_id=UUID(candidate_id),
                        rationale="Use the visible recommended source.",
                    ),
                )
                await session.commit()
                return result.model_dump(mode="json")

        result = asyncio.run(exercise())
        self.assertTrue(result["success"])
        self.assertEqual(len(result["selected_choices"]), 1)
        self.assertNotIn("message", result)
        self.assertEqual(result["message_key"], "tool-message-stage-success")
        self.assertEqual(result["message_params"], {"selected": 1, "pending": 1})
        status = self._get_status(draft_run_id)
        self.assertEqual(len(status["staged_review_selections"]), 1)
        self.assertEqual(
            status["staged_review_selections"][0]["proposal_id"],
            proposal_id,
        )

    def test_agent_review_rejects_unavailable_choice(self) -> None:
        draft_run_id, proposal_id, _candidate_id = self._start_draft()

        async def exercise() -> dict[str, Any]:
            async with self.session_factory() as session:
                service = StationaryEnergyAgentReviewService(session)
                result = await service.accept_one(
                    draft_run_id=UUID(draft_run_id),
                    user_id="user-1",
                    choice=StationaryEnergyAgentReviewChoiceInput(
                        proposal_id=UUID(proposal_id),
                        candidate_id=uuid4(),
                    ),
                )
                await session.commit()
                return result.model_dump(mode="json")

        result = asyncio.run(exercise())
        self.assertFalse(result["success"])
        self.assertEqual(result["selected_choices"], [])
        self.assertEqual(len(result["blocked_choices"]), 1)
        self.assertNotIn("message", result)
        self.assertEqual(result["message_key"], "tool-message-stage-blocked")
        self.assertEqual(result["message_params"], {"blocked": 1})
        self.assertEqual(
            self._get_status(draft_run_id)["staged_review_selections"], []
        )

    def test_agent_review_accept_multiple_reports_partial_message_key(self) -> None:
        draft_run_id, proposal_id, candidate_id = self._start_draft()

        async def exercise() -> dict[str, Any]:
            async with self.session_factory() as session:
                service = StationaryEnergyAgentReviewService(session)
                result = await service.accept_multiple(
                    draft_run_id=UUID(draft_run_id),
                    user_id="user-1",
                    choices=[
                        StationaryEnergyAgentReviewChoiceInput(
                            proposal_id=UUID(proposal_id),
                            candidate_id=UUID(candidate_id),
                        ),
                        StationaryEnergyAgentReviewChoiceInput(
                            proposal_id=uuid4(),
                            candidate_id=uuid4(),
                        ),
                    ],
                )
                await session.commit()
                return result.model_dump(mode="json")

        result = asyncio.run(exercise())
        self.assertFalse(result["success"])
        self.assertEqual(len(result["selected_choices"]), 1)
        self.assertEqual(len(result["blocked_choices"]), 1)
        self.assertNotIn("message", result)
        self.assertEqual(result["message_key"], "tool-message-stage-partial")
        self.assertEqual(
            result["message_params"],
            {"selected": 1, "blocked": 1, "pending": 1},
        )
        self.assertEqual(
            len(self._get_status(draft_run_id)["staged_review_selections"]), 1
        )

    def test_agent_review_accept_all_stages_unresolved_recommended_choices(
        self,
    ) -> None:
        draft_run_id, _proposal_id, _candidate_id = self._start_draft()

        async def exercise() -> dict[str, Any]:
            async with self.session_factory() as session:
                service = StationaryEnergyAgentReviewService(session)
                result = await service.accept_all_recommended(
                    draft_run_id=UUID(draft_run_id),
                    user_id="user-1",
                    rationale="User asked the agent to pick best.",
                )
                await session.commit()
                return result.model_dump(mode="json")

        result = asyncio.run(exercise())
        self.assertTrue(result["success"])
        self.assertEqual(len(result["selected_choices"]), 2)
        self.assertNotIn("message", result)
        self.assertEqual(result["message_key"], "tool-message-stage-success")
        self.assertEqual(result["message_params"], {"selected": 2, "pending": 0})
        status = self._get_status(draft_run_id)
        self.assertEqual(len(status["staged_review_selections"]), 2)

    def test_agent_review_preview_all_recommended_does_not_stage_choices(self) -> None:
        draft_run_id, _proposal_id, _candidate_id = self._start_draft()

        async def exercise() -> dict[str, Any]:
            async with self.session_factory() as session:
                service = StationaryEnergyAgentReviewService(session)
                result = await service.preview_all_recommended(
                    draft_run_id=UUID(draft_run_id),
                    user_id="user-1",
                    rationale="User asked the agent to pick best.",
                )
                await session.commit()
                return result.model_dump(mode="json")

        result = asyncio.run(exercise())
        self.assertTrue(result["success"])
        self.assertEqual(
            result["ui_event"],
            "stationary_energy_review_bulk_confirmation_requested",
        )
        self.assertNotIn("message", result)
        self.assertEqual(result["message_key"], "tool-message-bulk-confirm-success")
        self.assertEqual(result["message_params"], {"selected": 2, "pending": 0})
        self.assertEqual(len(result["pending_choices"]), 2)
        status = self._get_status(draft_run_id)
        self.assertEqual(status["staged_review_selections"], [])

    def test_agent_review_preview_staged_source_change_uses_empty_without_alternative(
        self,
    ) -> None:
        draft_run_id, proposal_id, candidate_id = self._start_draft()

        async def exercise() -> dict[str, Any]:
            async with self.session_factory() as session:
                service = StationaryEnergyAgentReviewService(session)
                await service.accept_one(
                    draft_run_id=UUID(draft_run_id),
                    user_id="user-1",
                    choice=StationaryEnergyAgentReviewChoiceInput(
                        proposal_id=UUID(proposal_id),
                        candidate_id=UUID(candidate_id),
                    ),
                )
                result = await service.preview_staged_source_changes(
                    draft_run_id=UUID(draft_run_id),
                    user_id="user-1",
                    proposal_ids=[UUID(proposal_id)],
                )
                await session.commit()
                return result.model_dump(mode="json")

        result = asyncio.run(exercise())
        self.assertTrue(result["success"])
        self.assertEqual(
            result["ui_event"],
            "stationary_energy_review_change_confirmation_requested",
        )
        self.assertNotIn("message", result)
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

        async def exercise() -> dict[str, Any]:
            async with self.session_factory() as session:
                service = StationaryEnergyAgentReviewService(session)
                await service.accept_one(
                    draft_run_id=UUID(draft_run_id),
                    user_id="user-1",
                    choice=StationaryEnergyAgentReviewChoiceInput(
                        proposal_id=UUID(proposal_id),
                        candidate_id=UUID(candidate_id),
                    ),
                )
                result = await service.preview_staged_source_changes(
                    draft_run_id=UUID(draft_run_id),
                    user_id="user-1",
                    proposal_ids=[UUID(proposal_id)],
                )
                await session.commit()
                return result.model_dump(mode="json")

        result = asyncio.run(exercise())
        self.assertTrue(result["success"])
        self.assertEqual(result["pending_choices"][0]["action"], "override_source")
        self.assertEqual(
            result["pending_choices"][0]["selected_candidate_id"],
            alternative_candidate_id,
        )
        self.assertEqual(
            result["pending_choices"][0]["selected_source_id"],
            "ds-preview-alt-details",
        )

    def test_agent_review_options_include_source_evidence_for_chat_checks(
        self,
    ) -> None:
        draft_run_id, _proposal_id, _candidate_id = self._start_draft()

        async def exercise() -> dict[str, Any]:
            async with self.session_factory() as session:
                service = StationaryEnergyAgentReviewService(session)
                result = await service.list_review_options(
                    draft_run_id=UUID(draft_run_id),
                    user_id="user-1",
                )
                return result.model_dump(mode="json")

        result = asyncio.run(exercise())
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

        async def exercise() -> dict[str, Any]:
            async with self.session_factory() as session:
                service = StationaryEnergyAgentReviewService(session)
                await service.accept_all_recommended(
                    draft_run_id=UUID(draft_run_id),
                    user_id="user-1",
                    rationale="User accepted all recommended sources.",
                )
                result = await service.preview_staged_sources_rollback(
                    draft_run_id=UUID(draft_run_id),
                    user_id="user-1",
                )
                await session.commit()
                return result.model_dump(mode="json")

        result = asyncio.run(exercise())
        self.assertTrue(result["success"])
        self.assertEqual(
            result["ui_event"],
            "stationary_energy_review_rollback_confirmation_requested",
        )
        self.assertNotIn("message", result)
        self.assertEqual(
            result["message_key"],
            "tool-message-staged-rollback-confirm-success",
        )
        self.assertEqual(result["message_params"], {"selected": 2, "pending": 2})
        self.assertEqual(len(result["pending_choices"]), 2)
        self.assertTrue(
            all(
                choice["action"] == "rollback_staged"
                for choice in result["pending_choices"]
            )
        )
        self.assertEqual(
            len(self._get_status(draft_run_id)["staged_review_selections"]), 2
        )

    def test_agent_review_rollback_staged_sources_removes_active_selection(
        self,
    ) -> None:
        draft_run_id, proposal_id, candidate_id = self._start_draft()

        async def exercise() -> dict[str, Any]:
            async with self.session_factory() as session:
                service = StationaryEnergyAgentReviewService(session)
                await service.accept_one(
                    draft_run_id=UUID(draft_run_id),
                    user_id="user-1",
                    choice=StationaryEnergyAgentReviewChoiceInput(
                        proposal_id=UUID(proposal_id),
                        candidate_id=UUID(candidate_id),
                    ),
                )
                result = await service.rollback_staged_sources(
                    draft_run_id=UUID(draft_run_id),
                    user_id="user-1",
                    proposal_ids=[UUID(proposal_id)],
                )
                await session.commit()
                return result.model_dump(mode="json")

        result = asyncio.run(exercise())
        self.assertTrue(result["success"])
        self.assertEqual(result["selected_choices"][0]["action"], "rollback_staged")
        self.assertNotIn("message", result)
        self.assertEqual(result["message_key"], "tool-message-staged-rollback-success")
        self.assertEqual(result["message_params"], {"selected": 1, "pending": 2})
        self.assertEqual(self._get_status(draft_run_id)["staged_review_selections"], [])

    def test_agent_review_accept_all_includes_notation_backed_gap_with_recommended_source(
        self,
    ) -> None:
        draft_run_id = asyncio.run(self._create_notation_review_draft_snapshot())

        async def exercise() -> dict[str, Any]:
            async with self.session_factory() as session:
                service = StationaryEnergyAgentReviewService(session)
                result = await service.accept_all_recommended(
                    draft_run_id=draft_run_id,
                    user_id="user-1",
                    rationale="User asked the agent to pick best.",
                )
                await session.commit()
                return result.model_dump(mode="json")

        result = asyncio.run(exercise())
        self.assertTrue(result["success"])
        self.assertEqual(len(result["selected_choices"]), 1)
        self.assertNotIn("message", result)
        self.assertEqual(result["message_key"], "tool-message-stage-success")
        self.assertEqual(result["message_params"], {"selected": 1, "pending": 0})
        self.assertEqual(result["selected_choices"][0]["action"], "accept")

        status = self._get_status(str(draft_run_id))
        self.assertEqual(len(status["staged_review_selections"]), 1)
        self.assertEqual(
            status["staged_review_selections"][0]["action"],
            "accept",
        )

    def test_agent_review_save_draft_blocks_when_required_choices_are_missing(
        self,
    ) -> None:
        draft_run_id, proposal_id, candidate_id = self._start_draft()

        async def exercise() -> dict[str, Any]:
            async with self.session_factory() as session:
                service = StationaryEnergyAgentReviewService(session)
                await service.accept_one(
                    draft_run_id=UUID(draft_run_id),
                    user_id="user-1",
                    choice=StationaryEnergyAgentReviewChoiceInput(
                        proposal_id=UUID(proposal_id),
                        candidate_id=UUID(candidate_id),
                    ),
                )
                result = await service.save_review_draft(
                    draft_run_id=UUID(draft_run_id),
                    user_id="user-1",
                    authorization=f"Bearer {_active_jwt()}",
                )
                await session.commit()
                return result.model_dump(mode="json")

        result = asyncio.run(exercise())
        self.assertFalse(result["success"])
        self.assertEqual(result["action"], "stationary_energy_save_review_draft")
        self.assertEqual(result["pending_required_count"], 1)
        self.assertNotIn("message", result)
        self.assertEqual(result["message_key"], "tool-message-review-save-blocked")
        self.assertEqual(result["message_params"], {"blocked": 1})
        self.assertEqual(self._get_status(draft_run_id)["review_decisions"], [])

    def test_agent_review_save_draft_tool_returns_message_key_when_token_missing(
        self,
    ) -> None:
        draft_run_id, _proposal_id, _candidate_id = self._start_draft()

        async def exercise() -> dict[str, Any]:
            tools = build_stationary_energy_review_tools(
                session_factory=self.session_factory,
                draft_run_id=draft_run_id,
                user_id="user-1",
                token_ref={"value": None},
            )
            save_tool = next(
                tool
                for tool in tools
                if getattr(tool, "name", None)
                == "stationary_energy_save_review_draft"
            )
            ctx = ToolContext(
                context=None,
                tool_call_id="test-call",
                tool_name="stationary_energy_save_review_draft",
                tool_arguments={},
            )

            output = await save_tool.on_invoke_tool(  # type: ignore[attr-defined]
                ctx,
                json.dumps({}),
            )
            return json.loads(output)

        data = asyncio.run(exercise())

        self.assertFalse(data["success"])
        self.assertNotIn("message", data)
        self.assertEqual(data["message_key"], "tool-error-missing-token")
        self.assertEqual(data["message_params"], {})
        self.assertEqual(data["error_code"], "missing_token")

    def test_inventory_context_tool_refreshes_expired_thread_token(self) -> None:
        thread_id = self._create_thread(
            "user-1", context={"access_token": _expired_jwt()}
        )
        mock_client = self._mock_cc_client()
        captured_tokens: list[str | None] = []

        async def load_status_overview(
            _client: object,
            *,
            request_payload: dict[str, Any],
            token: str | None = None,
        ) -> dict[str, Any]:
            captured_tokens.append(token)
            return {
                "action": "ghgi.inventory.status_overview",
                "success": True,
                "data": {
                    "inventory_id": request_payload["inventory_id"],
                    "filled": 31,
                },
            }

        with patch.dict(
            os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}
        ), patch(
            "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
        ):
            response = self.client.post(
                "/v1/stationary-energy-drafts/start",
                json={
                    "user_id": "user-1",
                    "city_id": "city-1",
                    "inventory_id": "inventory-1",
                    "thread_id": str(thread_id),
                    "context": {"access_token": _active_jwt()},
                },
                headers=_auth_headers(),
            )
            self.assertEqual(response.status_code, 201, response.text)
            draft_run_id = response.json()["draft_run_id"]
            self._wait_for_draft_status(draft_run_id, "ready")

        token_ref = {"value": _expired_jwt()}

        async def exercise() -> dict[str, Any]:
            tools = build_stationary_energy_review_tools(
                session_factory=self.session_factory,
                draft_run_id=draft_run_id,
                user_id="user-1",
                token_ref=token_ref,
            )
            status_tool = next(
                tool
                for tool in tools
                if getattr(tool, "name", None) == "inventory_status_overview"
            )
            ctx = ToolContext(
                context=None,
                tool_call_id="test-call",
                tool_name="inventory_status_overview",
                tool_arguments={},
            )
            output = await status_tool.on_invoke_tool(  # type: ignore[attr-defined]
                ctx,
                "{}",
            )
            return json.loads(output)

        with patch(
            "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
        ), patch(
            "app.services.citycatalyst_client.CityCatalystClient.load_inventory_status_overview",
            new=load_status_overview,
        ):
            data = asyncio.run(exercise())

        self.assertTrue(data["success"], data)
        self.assertEqual(captured_tokens, ["fresh-token"])
        self.assertEqual(token_ref["value"], "fresh-token")
        mock_client.refresh_token.assert_awaited_once_with("user-1")
        self.assertEqual(
            asyncio.run(self._get_thread_context(thread_id))["access_token"],
            "fresh-token",
        )

    def test_inventory_save_confirmation_tool_allows_partial_review_save(
        self,
    ) -> None:
        draft_run_id, proposal_id, candidate_id = self._start_draft()

        async def exercise() -> dict[str, Any]:
            async with self.session_factory() as session:
                service = StationaryEnergyAgentReviewService(session)
                await service.accept_one(
                    draft_run_id=UUID(draft_run_id),
                    user_id="user-1",
                    choice=StationaryEnergyAgentReviewChoiceInput(
                        proposal_id=UUID(proposal_id),
                        candidate_id=UUID(candidate_id),
                    ),
                )
                await session.commit()

            tools = build_stationary_energy_review_tools(
                session_factory=self.session_factory,
                draft_run_id=draft_run_id,
                user_id="user-1",
                token_ref={"value": _active_jwt()},
            )
            inventory_save_tool = next(
                tool
                for tool in tools
                if getattr(tool, "name", None)
                == "stationary_energy_request_inventory_save_confirmation"
            )
            ctx = ToolContext(
                context=None,
                tool_call_id="test-call",
                tool_name="stationary_energy_request_inventory_save_confirmation",
                tool_arguments={},
            )

            output = await inventory_save_tool.on_invoke_tool(  # type: ignore[attr-defined]
                ctx,
                json.dumps({}),
            )
            return json.loads(output)

        data = asyncio.run(exercise())

        self.assertTrue(data["success"])
        self.assertEqual(
            data["ui_event"],
            "stationary_energy_inventory_save_confirmation_requested",
        )
        self.assertNotIn("message", data)
        self.assertEqual(data["message_key"], "tool-message-inventory-save-confirm")
        self.assertEqual(data["message_params"], {})

    def test_inventory_save_confirmation_tool_requests_card_when_review_is_complete(
        self,
    ) -> None:
        draft_run_id, _proposal_id, _candidate_id = self._start_draft()

        async def exercise() -> dict[str, Any]:
            async with self.session_factory() as session:
                service = StationaryEnergyAgentReviewService(session)
                await service.accept_all_recommended(
                    draft_run_id=UUID(draft_run_id),
                    user_id="user-1",
                    rationale="User asked the agent to pick best.",
                )
                await session.commit()

            tools = build_stationary_energy_review_tools(
                session_factory=self.session_factory,
                draft_run_id=draft_run_id,
                user_id="user-1",
                token_ref={"value": _active_jwt()},
            )
            inventory_save_tool = next(
                tool
                for tool in tools
                if getattr(tool, "name", None)
                == "stationary_energy_request_inventory_save_confirmation"
            )
            ctx = ToolContext(
                context=None,
                tool_call_id="test-call",
                tool_name="stationary_energy_request_inventory_save_confirmation",
                tool_arguments={},
            )

            output = await inventory_save_tool.on_invoke_tool(  # type: ignore[attr-defined]
                ctx,
                json.dumps({}),
            )
            return json.loads(output)

        data = asyncio.run(exercise())

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

        async def exercise() -> dict[str, Any]:
            async with self.session_factory() as session:
                service = StationaryEnergyAgentReviewService(session)
                await service.accept_all_recommended(
                    draft_run_id=UUID(draft_run_id),
                    user_id="user-1",
                    rationale="User asked the agent to pick best.",
                )
                result = await service.save_review_draft(
                    draft_run_id=UUID(draft_run_id),
                    user_id="user-1",
                    authorization=f"Bearer {_active_jwt()}",
                )
                await session.commit()
                return result.model_dump(mode="json")

        result = asyncio.run(exercise())
        self.assertTrue(result["success"])
        self.assertEqual(result["pending_required_count"], 0)
        self.assertNotIn("message", result)
        self.assertEqual(result["message_key"], "tool-message-review-save-success")
        self.assertEqual(result["message_params"], {"selected": 2})
        status = self._get_status(draft_run_id)
        self.assertEqual(status["status"], "reviewed")
        self.assertEqual(status["staged_review_selections"], [])
        self.assertEqual(len(status["review_decisions"]), 2)

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
        async with self.session_factory() as session:
            proposal_result = await session.execute(
                select(StationaryEnergyDraftProposal.proposal_id).where(
                    StationaryEnergyDraftProposal.draft_run_id == draft_run_id
                )
            )
            proposal_id = str(proposal_result.scalar_one())

        handler = StreamingHandler(
            thread_id=uuid4(),
            user_id="user-1",
            session_factory=self.session_factory,
        )
        payload = MessageCreateRequest(
            user_id="user-1",
            content="Why did you choose these Stationary Energy sources?",
            context={
                "stationary_energy_draft_run_id": str(draft_run_id),
                "stationary_energy_focused_proposal_id": proposal_id,
                "stationary_energy_focused_decision_state": {
                    "action": "accept",
                    "selected_option": {
                        "id": "candidate-chat",
                        "action": "accept",
                        "label": "Chat source",
                        "short_label": "Chat source",
                        "selected_source_id": "ds-chat",
                        "recommended": True,
                    },
                },
                "stationary_energy_pending_decision_reviews": [
                    {
                        "proposal_id": proposal_id,
                        "label": "Focused right pane row",
                    }
                ],
                "stationary_energy_confirmed_bulk_review_choices": [
                    {
                        "proposal_id": proposal_id,
                        "action": "accept",
                    }
                ],
                "stationary_energy_confirmed_staged_review_rollback_choices": [
                    {
                        "proposal_id": proposal_id,
                    }
                ],
            },
            options={"stationary_energy_pending_decision_review_count": 1},
        )

        history = await handler._load_conversation_history(None, payload)

        self.assertGreaterEqual(len(history), 2)
        self.assertEqual(history[0]["role"], "system")
        system_content = history[0]["content"]
        self.assertIn(
            "You are Clima assisting with an active GPC Stationary Energy draft review.",
            system_content,
        )
        self.assertIn(
            "Handle one Stationary Energy review intent per user turn.",
            system_content,
        )
        context_start = system_content.index("<context>")
        self.assertGreater(
            context_start,
            system_content.index(
                "Handle one Stationary Energy review intent per user turn."
            ),
        )
        self.assertIn("</context>", system_content)
        self.assertTrue(system_content.rstrip().endswith("</context>"))
        self.assertIn(
            "STATIONARY_ENERGY_DRAFT_CONTEXT_JSON",
            system_content[context_start:],
        )
        self.assertIn("Testopolis", system_content)
        self.assertIn("ds-chat", system_content)
        self.assertIn("guidance_context", system_content)
        self.assertNotIn("llm_generation", system_content)
        self.assertIn("ui_context", system_content)
        self.assertIn(proposal_id, system_content)
        self.assertIn("Focused right pane row", system_content)
        self.assertIn("focused_decision_state", system_content)
        self.assertIn("candidate-chat", system_content)
        self.assertIn("confirmed_bulk_review_choices", system_content)
        self.assertIn(
            "confirmed_staged_review_rollback_choices",
            system_content,
        )
        self.assertIn(
            "Use subsector-specific energy activity data first.", system_content
        )
        self.assertNotIn(
            "raw-output-should-not-be-in-chat-context", system_content
        )
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
        mock_client.load_stationary_energy_context = AsyncMock(
            return_value=_context_payload()
        )
        mock_client.commit_stationary_energy_accepted = AsyncMock(
            side_effect=self._mock_commit_response
        )
        return mock_client

    def _start_draft(self) -> tuple[str, str, str]:
        """Create a ready draft and return one proposal/candidate pair."""
        mock_client = self._mock_cc_client()
        with patch.dict(
            os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}
        ), patch(
            "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
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
            self._wait_for_draft_status(draft_run_id, "ready")
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
                and candidate["source_scope"].get("subsector_id")
                == proposal_subsector_id
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

    def _wait_for_draft_status(
        self,
        draft_run_id: str,
        expected_status: str,
        timeout: float = 5.0,
    ) -> None:
        """Poll the persisted draft run until it reaches the expected status."""
        deadline = time.monotonic() + timeout
        last_status: str | None = None
        while time.monotonic() < deadline:
            last_status = self._draft_run_status(draft_run_id)
            if last_status == expected_status:
                return
            if last_status == "failed" and expected_status != "failed":
                self.fail(
                    f"Draft {draft_run_id} failed before reaching {expected_status}"
                )
            time.sleep(0.05)
        self.fail(
            f"Draft {draft_run_id} reached {last_status!r}, not {expected_status!r}"
        )

    def _draft_run_status(self, draft_run_id: str) -> str:
        """Read the persisted status for a draft run without hitting route code."""

        async def load_status() -> str:
            async with self.session_factory() as session:
                result = await session.execute(
                    select(StationaryEnergyDraftRun.status).where(
                        StationaryEnergyDraftRun.draft_run_id == UUID(draft_run_id)
                    )
                )
                return str(result.scalar_one())

        return asyncio.run(load_status())

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

    def _create_thread(
        self, user_id: str, context: dict[str, Any] | None = None
    ) -> UUID:
        response = self.client.post(
            "/v1/threads",
            json={
                "user_id": user_id,
                "context": context or {"access_token": _active_jwt(user_id)},
            },
        )
        self.assertEqual(response.status_code, 201, response.text)
        return UUID(response.json()["thread_id"])

    async def _get_thread_context(self, thread_id: UUID) -> dict[str, Any]:
        """Return persisted thread context for assertions."""
        async with self.session_factory() as session:
            thread = await session.get(ChatThread, thread_id)
            self.assertIsNotNone(thread)
            return dict(thread.context or {})

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

    async def _create_notation_review_draft_snapshot(self) -> UUID:
        async with self.session_factory() as session:
            draft_run = StationaryEnergyDraftRun(
                user_id="user-1",
                city_id="city-1",
                inventory_id="inventory-1",
                sector_code="stationary_energy",
                status="ready",
                workflow_step="review",
                context_summary={"city": {"city_id": "city-1", "name": "Testopolis"}},
                permission_summary={"can_review": True},
            )
            session.add(draft_run)
            await session.flush()

            candidate = StationaryEnergyDraftSourceCandidate(
                draft_run_id=draft_run.draft_run_id,
                datasource_id="global-energy-monitor-coal-no",
                name="Global Energy Monitor",
                publisher_name="Global Energy Monitor",
                geography_match="country",
                source_scope={"subcategory_id": "I.7.1", "scope_id": "1"},
                source_data={
                    "notation_key": "NO",
                    "details_datasource_id": "global-energy-monitor-coal-no",
                },
                normalized_rows=[],
                applicability_status="applicable",
                applicability_issues=[],
            )
            session.add(candidate)
            await session.flush()

            proposal = StationaryEnergyDraftProposal(
                draft_run_id=draft_run.draft_run_id,
                target_ref={
                    "subsector_name": (
                        "Fugitive Emissions From Mining Processing Storage "
                        "And Transportation Of Coal"
                    ),
                    "subcategory_name": (
                        "Emissions From Fugitive Emissions Within The City Boundary"
                    ),
                    "subcategory_id": "I.7.1",
                    "scope_name": "Scope 1",
                    "scope_id": "1",
                },
                recommended_candidate_id=candidate.candidate_id,
                recommended_datasource_id=candidate.datasource_id,
                alternative_candidate_ids=[],
                proposed_value={
                    "notation_key": "NO",
                    "datasource_id": candidate.datasource_id,
                },
                rationale=(
                    "Source reports notation key 'NO' (not occurring): "
                    "There are no facilities found in the city boundary."
                ),
                status="gap",
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
            "stationary_energy_staged_review_selections",
        }
        for table_name in table_names:
            self.assertIn(table_name, Base.metadata.tables)

        source_indexes = {
            tuple(index.columns.keys())
            for index in Base.metadata.tables[
                "stationary_energy_draft_source_candidates"
            ].indexes
        }
        self.assertIn(("draft_run_id",), source_indexes)
        self.assertIn(("draft_run_id", "datasource_id"), source_indexes)
        self.assertIn(("draft_run_id", "applicability_status"), source_indexes)
        review_decision_columns = Base.metadata.tables[
            "stationary_energy_review_decisions"
        ].columns
        self.assertIn("decision_version", review_decision_columns)
        staged_selection_columns = Base.metadata.tables[
            "stationary_energy_staged_review_selections"
        ].columns
        self.assertIn("tool_call_id", staged_selection_columns)


class StationaryEnergyProposalBuilderTests(unittest.TestCase):
    def test_equal_multi_source_values_become_needs_review(self) -> None:
        taxonomy = [_context_payload()["taxonomy"][0]]
        candidate_1 = {
            "candidate_id": str(uuid4()),
            "datasource_id": "ds-a",
            "publisher_name": "A",
            "dataset_year": 2024,
            "geography_match": "city",
            "source_scope": taxonomy[0],
            "normalized_rows": [
                {
                    "emissions_value_100yr": "1000000",
                    "emissions_unit": "kgCO2e",
                }
            ],
            "applicability_status": "applicable",
        }
        candidate_2 = {
            "candidate_id": str(uuid4()),
            "datasource_id": "ds-b",
            "publisher_name": "B",
            "dataset_year": 2024,
            "geography_match": "city",
            "source_scope": taxonomy[0],
            "normalized_rows": [
                {
                    "emissions_value_100yr": "1000000.0",
                    "emissions_unit": "kgCO2e",
                }
            ],
            "applicability_status": "applicable",
        }

        proposals = build_deterministic_proposals(
            taxonomy_rows=taxonomy,
            stored_source_candidates=[candidate_1, candidate_2],
            current_values=[],
            inventory_year=2024,
        )

        self.assertEqual(len(proposals), 1)
        proposal = proposals[0]
        self.assertEqual(proposal["status"], "needs_review")
        self.assertEqual(proposal["recommended_datasource_id"], "ds-a")
        self.assertEqual(
            proposal["alternative_candidate_ids"],
            [candidate_2["candidate_id"]],
        )

    def test_different_multi_source_values_become_deterministic_conflict(
        self,
    ) -> None:
        taxonomy = [_context_payload()["taxonomy"][0]]
        candidate_1 = {
            "candidate_id": str(uuid4()),
            "datasource_id": "ds-a",
            "publisher_name": "A",
            "dataset_year": 2024,
            "geography_match": "city",
            "source_scope": taxonomy[0],
            "normalized_rows": [
                {
                    "emissions_value_100yr": "1000000",
                    "emissions_unit": "kgCO2e",
                }
            ],
            "applicability_status": "applicable",
        }
        candidate_2 = {
            "candidate_id": str(uuid4()),
            "datasource_id": "ds-b",
            "publisher_name": "B",
            "dataset_year": 2024,
            "geography_match": "city",
            "source_scope": taxonomy[0],
            "normalized_rows": [
                {
                    "emissions_value_100yr": "2000000",
                    "emissions_unit": "kgCO2e",
                }
            ],
            "applicability_status": "applicable",
        }

        proposals = build_deterministic_proposals(
            taxonomy_rows=taxonomy,
            stored_source_candidates=[candidate_1, candidate_2],
            current_values=[],
            inventory_year=2024,
        )

        self.assertEqual(len(proposals), 1)
        proposal = proposals[0]
        self.assertEqual(proposal["status"], "conflict")
        self.assertEqual(proposal["recommended_datasource_id"], "ds-a")
        self.assertEqual(
            proposal["alternative_candidate_ids"],
            [candidate_2["candidate_id"]],
        )


if __name__ == "__main__":
    unittest.main()
