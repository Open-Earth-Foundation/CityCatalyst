from __future__ import annotations

import pytest

pytest.importorskip("pgvector.sqlalchemy")
import asyncio
import json
from typing import Any
from uuid import UUID

from agents.tool import ToolContext

from app.services.stationary_energy.stationary_energy_agent_review import (
    StationaryEnergyAgentReviewService,
)
from app.services.stationary_energy.stationary_energy_review_models import (
    StationaryEnergyAgentReviewChoiceInput,
)
from app.tools.stationary_energy_review_tools import (
    build_stationary_energy_review_tools,
)
from tests.stationary_energy.draft_case import StationaryEnergyDraftCase
from tests.stationary_energy.fixtures import _active_jwt, _mock_cc_client


class StationaryEnergyAgentSaveTests(StationaryEnergyDraftCase):
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
                if getattr(tool, "name", None) == "stationary_energy_save_review_draft"
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
                service = StationaryEnergyAgentReviewService(
                    session,
                    cc_client=_mock_cc_client(),
                )
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
