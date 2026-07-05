from __future__ import annotations

import asyncio
import os
import tempfile
import time
import unittest
from concurrent.futures import Future
from pathlib import Path
from threading import Thread
from typing import Any, AsyncIterator
from unittest.mock import AsyncMock, patch
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

pytest.importorskip("pgvector.sqlalchemy")

from app.db import Base
from app.db.session import get_session
from app.main import get_app
from app.models.db.stationary_energy_draft import StationaryEnergyDraftRun
from app.services.citycatalyst_client import CityCatalystClientError
from app.services.stationary_energy.stationary_energy_draft_service import (
    COMMIT_ACCEPTED_CAPABILITY,
    LOAD_CONTEXT_CAPABILITY,
)
from tests.test_stationary_energy_drafts import (
    _active_jwt,
    _auth_headers,
    _context_payload,
)


class StationaryEnergyDraftAuthContractTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        fd, database_path = tempfile.mkstemp(prefix="cc-se-draft-auth-", suffix=".sqlite")
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
        self.cc_client_patcher = patch(
            "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
            return_value=self._mock_cc_client(),
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
        for future in self.background_futures:
            try:
                future.result(timeout=5)
            except Exception:
                continue

    def test_start_list_and_resume_reject_token_subject_mismatch_from_cc(self) -> None:
        mock_client = self._mock_subject_mismatch_cc_client()

        with patch.dict(
            os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}
        ), patch(
            "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
        ):
            start_response = self.client.post(
                "/v1/stationary-energy-drafts/start",
                json={
                    "user_id": "other-user",
                    "city_id": "city-1",
                    "inventory_id": "inventory-1",
                },
                headers=_auth_headers("user-1"),
            )
            list_response = self.client.get(
                "/v1/stationary-energy-drafts",
                params={
                    "user_id": "other-user",
                    "city_id": "city-1",
                    "inventory_id": "inventory-1",
                    "sector_code": "stationary_energy",
                },
                headers=_auth_headers("user-1"),
            )
            resume_response = self.client.get(
                "/v1/stationary-energy-drafts/resume",
                params={
                    "user_id": "other-user",
                    "city_id": "city-1",
                    "inventory_id": "inventory-1",
                    "sector_code": "stationary_energy",
                },
                headers=_auth_headers("user-1"),
            )

        self.assertEqual(start_response.status_code, 403, start_response.text)
        self.assertEqual(list_response.status_code, 403, list_response.text)
        self.assertEqual(resume_response.status_code, 403, resume_response.text)
        self.assertEqual(
            [
                call.kwargs["user_id"]
                for call in mock_client.get_stationary_energy_allowed_capabilities.await_args_list
            ],
            ["other-user", "other-user", "other-user"],
        )
        self.assertTrue(
            all(
                call.kwargs["token"] == _active_jwt("user-1")
                for call in mock_client.get_stationary_energy_allowed_capabilities.await_args_list
            )
        )

    def test_status_retry_review_and_save_reject_token_subject_mismatch_from_cc(
        self,
    ) -> None:
        draft_run_id = self._start_draft()
        review_decisions = self._complete_review_decisions(draft_run_id)
        mock_client = self._mock_subject_mismatch_cc_client()

        with patch.dict(
            os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}
        ), patch(
            "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
        ):
            status_response = self.client.get(
                f"/v1/stationary-energy-drafts/{draft_run_id}",
                params={"user_id": "other-user"},
                headers=_auth_headers("user-1"),
            )
            retry_response = self.client.post(
                f"/v1/stationary-energy-drafts/{draft_run_id}/retry",
                json={"user_id": "other-user"},
                headers=_auth_headers("user-1"),
            )
            review_response = self.client.post(
                f"/v1/stationary-energy-drafts/{draft_run_id}/review",
                json={"user_id": "other-user", "decisions": review_decisions},
                headers=_auth_headers("user-1"),
            )
            save_response = self.client.post(
                f"/v1/stationary-energy-drafts/{draft_run_id}/save",
                json={"user_id": "other-user"},
                headers=_auth_headers("user-1"),
            )

        self.assertEqual(status_response.status_code, 403, status_response.text)
        self.assertEqual(retry_response.status_code, 403, retry_response.text)
        self.assertEqual(review_response.status_code, 403, review_response.text)
        self.assertEqual(save_response.status_code, 403, save_response.text)
        self.assertEqual(
            [
                call.kwargs["user_id"]
                for call in mock_client.get_stationary_energy_allowed_capabilities.await_args_list
            ],
            ["other-user", "other-user", "other-user", "other-user"],
        )
        self.assertTrue(
            all(
                call.kwargs["token"] == _active_jwt("user-1")
                for call in mock_client.get_stationary_energy_allowed_capabilities.await_args_list
            )
        )

    def test_stationary_energy_routes_reject_missing_or_malformed_bearer_tokens(
        self,
    ) -> None:
        draft_run_id = self._start_draft()
        review_decisions = self._complete_review_decisions(draft_run_id)
        endpoints = [
            (
                "POST",
                "/v1/stationary-energy-drafts/start",
                {
                    "user_id": "user-1",
                    "city_id": "city-1",
                    "inventory_id": "inventory-1",
                },
            ),
            (
                "GET",
                "/v1/stationary-energy-drafts",
                {
                    "user_id": "user-1",
                    "city_id": "city-1",
                    "inventory_id": "inventory-1",
                    "sector_code": "stationary_energy",
                },
            ),
            (
                "GET",
                "/v1/stationary-energy-drafts/resume",
                {
                    "user_id": "user-1",
                    "city_id": "city-1",
                    "inventory_id": "inventory-1",
                    "sector_code": "stationary_energy",
                },
            ),
            ("GET", f"/v1/stationary-energy-drafts/{draft_run_id}", {"user_id": "user-1"}),
            ("POST", f"/v1/stationary-energy-drafts/{draft_run_id}/retry", {"user_id": "user-1"}),
            (
                "POST",
                f"/v1/stationary-energy-drafts/{draft_run_id}/review",
                {"user_id": "user-1", "decisions": review_decisions},
            ),
            ("POST", f"/v1/stationary-energy-drafts/{draft_run_id}/save", {"user_id": "user-1"}),
        ]

        mock_client = self._mock_cc_client()
        with patch.dict(
            os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}
        ), patch(
            "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
            return_value=mock_client,
        ):
            for method, endpoint, payload in endpoints:
                if method == "GET":
                    missing_response = self.client.get(endpoint, params=payload)
                    malformed_response = self.client.get(
                        endpoint,
                        params=payload,
                        headers={"Authorization": "Token not-a-bearer"},
                    )
                else:
                    missing_response = self.client.request(
                        method,
                        endpoint,
                        json=payload,
                    )
                    malformed_response = self.client.request(
                        method,
                        endpoint,
                        json=payload,
                        headers={"Authorization": "Token not-a-bearer"},
                    )

                self.assertEqual(
                    missing_response.status_code,
                    401,
                    f"{method} {endpoint}: {missing_response.text}",
                )
                self.assertEqual(
                    malformed_response.status_code,
                    401,
                    f"{method} {endpoint}: {malformed_response.text}",
                )

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

    def _mock_subject_mismatch_cc_client(self) -> AsyncMock:
        mock_client = self._mock_cc_client()
        mock_client.get_stationary_energy_allowed_capabilities = AsyncMock(
            side_effect=CityCatalystClientError(
                "token subject does not match request user",
                status_code=403,
            )
        )
        return mock_client

    def _start_draft(self) -> str:
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
        return draft_run_id

    def _wait_for_draft_status(
        self,
        draft_run_id: str,
        expected_status: str,
        timeout: float = 5.0,
    ) -> None:
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
        async def load_status() -> str:
            async with self.session_factory() as session:
                result = await session.execute(
                    select(StationaryEnergyDraftRun.status).where(
                        StationaryEnergyDraftRun.draft_run_id == UUID(draft_run_id)
                    )
                )
                return str(result.scalar_one())

        return asyncio.run(load_status())

    def _get_status(self, draft_run_id: str) -> dict[str, Any]:
        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}):
            response = self.client.get(
                f"/v1/stationary-energy-drafts/{draft_run_id}",
                params={"user_id": "user-1"},
                headers=_auth_headers(),
            )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def _complete_review_decisions(self, draft_run_id: str) -> list[dict[str, Any]]:
        status_data = self._get_status(draft_run_id)
        decisions: list[dict[str, Any]] = []
        for proposal in status_data["proposals"]:
            if proposal.get("recommended_candidate_id"):
                decisions.append(
                    {"proposal_id": proposal["proposal_id"], "action": "accept"}
                )
            else:
                decisions.append(
                    {"proposal_id": proposal["proposal_id"], "action": "leave_draft"}
                )
        return decisions

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
