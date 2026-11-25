from __future__ import annotations

import pytest

pytest.importorskip("pgvector.sqlalchemy")
import asyncio
from typing import Any
from uuid import UUID, uuid4

from app.services.stationary_energy.stationary_energy_agent_review import (
    StationaryEnergyAgentReviewService,
)
from app.services.stationary_energy.stationary_energy_review_models import (
    StationaryEnergyAgentReviewChoiceInput,
)
from tests.stationary_energy.draft_case import StationaryEnergyDraftCase


class StationaryEnergyAgentChoicesTests(StationaryEnergyDraftCase):
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
        self.assertEqual(self._get_status(draft_run_id)["staged_review_selections"], [])

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
