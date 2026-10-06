from __future__ import annotations

import pytest

pytest.importorskip("pgvector.sqlalchemy")
import asyncio
import json
import os
from typing import Any
from unittest.mock import AsyncMock, patch

from agents.tool import ToolContext

from app.services.citycatalyst_client import CityCatalystClientError
from app.tools.stationary_energy_start_draft_tools import (
    build_stationary_energy_start_draft_tools,
)
from tests.stationary_energy.draft_case import StationaryEnergyDraftCase
from tests.stationary_energy.fixtures import (
    _active_jwt,
    _auth_headers,
    _expired_jwt,
    _mock_cc_client,
    _mock_subject_mismatch_cc_client,
)


class StationaryEnergyAuthorizationTests(StationaryEnergyDraftCase):
    def test_start_uses_request_bearer_token_when_thread_token_is_expired(self) -> None:
        thread_id = self._create_thread(
            "user-1", context={"access_token": _expired_jwt()}
        )
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
        mock_client = _mock_cc_client()

        async def exercise() -> dict[str, Any]:
            tools = build_stationary_energy_start_draft_tools(
                session_factory=self.session_factory,
                city_id="city-1",
                inventory_id="inventory-1",
                user_id="user-1",
                thread_id=thread_id,
                token_ref=token_ref,
                client_factory=lambda: mock_client,
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
                json.dumps({"continue_request": True}),
            )
            return json.loads(output)

        data = asyncio.run(exercise())

        self.assertTrue(data["success"], data)
        # The page re-sends the request once the run is ready.
        self.assertTrue(data["continue_request"])
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
                    "user_id": "other-user",
                    "city_id": "city-1",
                    "inventory_id": "inventory-1",
                    "thread_id": str(thread_id),
                },
            )

        self.assertEqual(response.status_code, 403)
        mock_client.get_stationary_energy_allowed_capabilities.assert_not_awaited()

    def test_start_requires_access_token_before_calling_cc(self) -> None:
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
                },
            )

        self.assertEqual(response.status_code, 401)
        mock_client.refresh_token.assert_not_awaited()
        mock_client.get_stationary_energy_allowed_capabilities.assert_not_awaited()

    def test_start_rejects_token_that_cc_does_not_authorize(self) -> None:
        mock_client = _mock_cc_client()
        mock_client.get_stationary_energy_allowed_capabilities = AsyncMock(
            side_effect=CityCatalystClientError("token rejected", status_code=401)
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
                },
                headers=_auth_headers("other-user"),
            )

        self.assertEqual(response.status_code, 401)
        mock_client.get_stationary_energy_allowed_capabilities.assert_awaited_once()

    def test_start_list_and_resume_reject_token_subject_mismatch_from_cc(self) -> None:
        mock_client = _mock_subject_mismatch_cc_client()

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
        draft_run_id, _proposal_id, _candidate_id = self._start_draft()
        review_decisions = self._complete_review_decisions(draft_run_id)
        mock_client = _mock_subject_mismatch_cc_client()

        with (
            patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}),
            patch(
                "app.services.stationary_energy.stationary_energy_draft_service.CityCatalystClient",
                return_value=mock_client,
            ),
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
        draft_run_id, _proposal_id, _candidate_id = self._start_draft()
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
            (
                "GET",
                f"/v1/stationary-energy-drafts/{draft_run_id}",
                {
                    "user_id": "user-1",
                },
            ),
            (
                "POST",
                f"/v1/stationary-energy-drafts/{draft_run_id}/retry",
                {
                    "user_id": "user-1",
                },
            ),
            (
                "POST",
                f"/v1/stationary-energy-drafts/{draft_run_id}/review",
                {
                    "user_id": "user-1",
                    "decisions": self._complete_review_decisions(draft_run_id),
                },
            ),
            (
                "POST",
                f"/v1/stationary-energy-drafts/{draft_run_id}/save",
                {
                    "user_id": "user-1",
                },
            ),
        ]

        with patch.dict(os.environ, {"CA_FEATURE_FLAGS": "STATIONARY_ENERGY_AGENTIC"}):
            for method, endpoint, payload in endpoints:
                if method == "GET":
                    missing_response = self.client.get(endpoint, params=payload)
                    malformed_response = self.client.get(
                        endpoint,
                        params=payload,
                        headers={"Authorization": "Basic token"},
                    )
                else:
                    missing_response = self.client.post(endpoint, json=payload)
                    malformed_response = self.client.post(
                        endpoint,
                        json=payload,
                        headers={"Authorization": "Basic token"},
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
