from __future__ import annotations

import pytest

pytest.importorskip("pgvector.sqlalchemy")
import asyncio
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
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db import Base
from app.db.session import get_session
from app.main import get_app
from app.models.db.stationary_energy_draft import (
    StationaryEnergyDraftProposal,
    StationaryEnergyDraftRun,
    StationaryEnergyDraftSourceCandidate,
)
from app.models.db.thread import Thread as ChatThread
from app.utils.token_manager import parse_jwt_claims
from tests.stationary_energy.fixtures import _active_jwt, _auth_headers, _mock_cc_client


class StationaryEnergyDraftCase(unittest.IsolatedAsyncioTestCase):
    """Isolated SQLite/API harness shared by draft behavior suites."""

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
        self.default_cc_client = _mock_cc_client()
        self.cc_client_patcher = patch(
            "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
            return_value=self.default_cc_client,
        )
        self.cc_client_patcher.start()

        async def _identity(token: str) -> str:
            claims = parse_jwt_claims(token)
            if claims and claims.get("sub"):
                return str(claims["sub"])
            return token

        self.identity_patcher = patch(
            "app.utils.citycatalyst_auth.CityCatalystClient.validate_user_identity",
            new=AsyncMock(side_effect=_identity),
        )
        self.identity_patcher.start()
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
        self.identity_patcher.stop()
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

    def _start_draft(self) -> tuple[str, str, str]:
        """Create a ready draft and return one proposal/candidate pair."""
        mock_client = _mock_cc_client()
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
        token = _active_jwt(user_id)
        if context and isinstance(context.get("access_token"), str):
            token = str(context["access_token"])
        response = self.client.post(
            "/v1/threads",
            json={
                "user_id": user_id,
                "context": context or {"access_token": token},
            },
            headers={"Authorization": f"Bearer {token}"},
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

    @staticmethod
    async def _first_proposal_id(
        session: AsyncSession,
        draft_run_id: UUID,
    ) -> UUID:
        result = await session.execute(
            select(StationaryEnergyDraftProposal.proposal_id)
            .where(StationaryEnergyDraftProposal.draft_run_id == draft_run_id)
            .order_by(StationaryEnergyDraftProposal.proposal_id)
        )
        return result.scalar_one()

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
