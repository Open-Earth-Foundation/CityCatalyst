from __future__ import annotations

import pytest

pytest.importorskip("pgvector.sqlalchemy")
import asyncio
from typing import Any

from app.models.stationary_energy_drafts import SaveStationaryEnergyDraftRequest
from app.services.stationary_energy.stationary_energy_agent_review import (
    StationaryEnergyAgentReviewService,
)
from app.services.stationary_energy.stationary_energy_draft_service import (
    StationaryEnergyDraftService,
)
from app.services.stationary_energy.stationary_energy_review_models import (
    StationaryEnergyNotationKeyChoiceInput,
)
from tests.stationary_energy.draft_case import StationaryEnergyDraftCase
from tests.stationary_energy.fixtures import (
    _active_jwt,
    _mock_cc_client,
    _notation_targets_payload,
)


class StationaryEnergyAgentNotationTests(StationaryEnergyDraftCase):
    def test_agent_review_stage_edit_and_rollback_notation_key(self) -> None:
        draft_run_id = asyncio.run(self._create_persisted_draft_snapshot())
        mock_client = _mock_cc_client()
        mock_client.list_stationary_energy_notation_keys.return_value = (
            _notation_targets_payload()
        )

        async def exercise() -> dict[str, Any]:
            async with self.session_factory() as session:
                proposal_id = await self._first_proposal_id(session, draft_run_id)
                service = StationaryEnergyAgentReviewService(
                    session,
                    cc_client=mock_client,
                )
                listed = await service.list_notation_keys(
                    draft_run_id=draft_run_id,
                    user_id="user-1",
                    authorization=f"Bearer {_active_jwt()}",
                )
                staged = await service.stage_notation_key(
                    draft_run_id=draft_run_id,
                    user_id="user-1",
                    authorization=f"Bearer {_active_jwt()}",
                    choice=StationaryEnergyNotationKeyChoiceInput(
                        target_id="I.1.2",
                        notation_key="NO",
                        unavailable_explanation="No activity occurs in scope.",
                    ),
                )
                edited = await service.stage_notation_key(
                    draft_run_id=draft_run_id,
                    user_id="user-1",
                    authorization=f"Bearer {_active_jwt()}",
                    choice=StationaryEnergyNotationKeyChoiceInput(
                        proposal_id=proposal_id,
                        notation_key="NE",
                        unavailable_explanation="Data was not estimated.",
                    ),
                )
                rolled_back = await service.rollback_staged_notation_keys(
                    draft_run_id=draft_run_id,
                    user_id="user-1",
                    target_ids=["I.1.2"],
                )
                await session.commit()
                return {
                    "listed": listed.model_dump(mode="json"),
                    "staged": staged.model_dump(mode="json"),
                    "edited": edited.model_dump(mode="json"),
                    "rolled_back": rolled_back.model_dump(mode="json"),
                }

        result = asyncio.run(exercise())

        self.assertTrue(result["listed"]["success"])
        self.assertEqual(
            [
                entry["notation_key"]
                for entry in result["listed"]["allowed_notation_keys"]
            ],
            ["NO", "NE", "IE", "C"],
        )
        self.assertEqual(result["listed"]["targets"][0]["target_id"], "I.1.2")
        self.assertTrue(result["staged"]["success"])
        self.assertEqual(
            result["staged"]["selected_choices"][0]["action"],
            "set_notation_key",
        )
        self.assertEqual(
            result["edited"]["selected_choices"][0]["notation_key"],
            "NE",
        )
        self.assertTrue(result["rolled_back"]["success"])
        self.assertEqual(
            result["rolled_back"]["message_key"],
            "tool-message-notation-rollback-success",
        )
        self.assertEqual(
            self._get_status(str(draft_run_id))["staged_review_selections"],
            [],
        )

    def test_save_commits_notation_key_decisions_after_review_save(self) -> None:
        draft_run_id = asyncio.run(self._create_persisted_draft_snapshot())
        mock_client = _mock_cc_client()
        mock_client.list_stationary_energy_notation_keys.return_value = (
            _notation_targets_payload()
        )

        async def exercise() -> dict[str, Any]:
            async with self.session_factory() as session:
                service = StationaryEnergyAgentReviewService(
                    session,
                    cc_client=mock_client,
                )
                await service.stage_notation_key(
                    draft_run_id=draft_run_id,
                    user_id="user-1",
                    authorization=f"Bearer {_active_jwt()}",
                    choice=StationaryEnergyNotationKeyChoiceInput(
                        target_id="I.1.2",
                        notation_key="NO",
                        unavailable_explanation="No activity occurs in scope.",
                    ),
                )
                review_result = await service.save_review_draft(
                    draft_run_id=draft_run_id,
                    user_id="user-1",
                    authorization=f"Bearer {_active_jwt()}",
                )
                await session.commit()

            async with self.session_factory() as session:
                draft_service = StationaryEnergyDraftService(
                    session,
                    cc_client=mock_client,
                )
                save_result = await draft_service.save_draft(
                    draft_run_id=draft_run_id,
                    payload=SaveStationaryEnergyDraftRequest(user_id="user-1"),
                    authorization=f"Bearer {_active_jwt()}",
                )
                await session.commit()
                return {
                    "review": review_result.model_dump(mode="json"),
                    "save": save_result.model_dump(mode="json"),
                }

        result = asyncio.run(exercise())

        self.assertTrue(result["review"]["success"])
        decision = result["review"]["saved_decisions"][0]
        self.assertEqual(decision["action"], "set_notation_key")
        self.assertEqual(decision["notation_key"], "NO")
        self.assertEqual(decision["commit_status"], "pending_cc_commit")

        self.assertEqual(result["save"]["status"], "saved")
        saved_decision = result["save"]["decisions"][0]
        self.assertEqual(saved_decision["commit_status"], "committed")
        self.assertEqual(saved_decision["commit_response"]["notation_key"], "NO")
        mock_client.commit_stationary_energy_accepted.assert_not_awaited()
        mock_client.commit_stationary_energy_notation_keys.assert_awaited_once()
        notation_rows = (
            mock_client.commit_stationary_energy_notation_keys.await_args.kwargs[
                "request_payload"
            ]["rows"]
        )
        self.assertEqual(notation_rows[0]["target_id"], "I.1.2")
        self.assertEqual(notation_rows[0]["notation_key"], "NO")
