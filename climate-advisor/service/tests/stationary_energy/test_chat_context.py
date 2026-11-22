from __future__ import annotations

import pytest

from app.utils.streaming_context import resolve_workflow_context

pytest.importorskip("pgvector.sqlalchemy")
from uuid import uuid4

from sqlalchemy import select

from app.models.db.stationary_energy_draft import StationaryEnergyDraftProposal
from app.models.requests import MessageCreateRequest
from app.utils.streaming_handler import StreamingHandler
from tests.stationary_energy.draft_case import StationaryEnergyDraftCase
from tests.stationary_energy.fixtures import _auth_headers


class StationaryEnergyChatContextTests(StationaryEnergyDraftCase):
    def test_status_rejects_wrong_user(self) -> None:
        draft_run_id, _proposal_id, _candidate_id = self._start_draft()

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

        await resolve_workflow_context(handler, payload)
        history = await handler._load_conversation_history(None, payload)

        # The persisted draft snapshot and the page's UI state reach the model.
        self.assertEqual(history[0]["role"], "system")
        context = history[0]["content"].split("STATIONARY_ENERGY_DRAFT_CONTEXT_JSON", 1)[1]
        for expected in (
            "Testopolis",
            "ds-chat",
            "Use subsector-specific energy activity data first.",
            proposal_id,
            "Focused right pane row",
            "candidate-chat",
            "confirmed_bulk_review_choices",
            "confirmed_staged_review_rollback_choices",
        ):
            self.assertIn(expected, context)
        self.assertNotIn("llm_generation", history[0]["content"])
        self.assertEqual(history[-1]["role"], "user")
        self.assertEqual(history[-1]["content"], payload.content)
