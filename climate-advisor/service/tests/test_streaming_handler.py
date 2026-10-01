from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.models.requests import MessageCreateRequest
from app.services.native_input_catalog_service import ActiveRequestContext
from app.utils.chat_workflow_context import ChatWorkflowContext
from app.utils.sse import format_sse
from app.utils.streaming_handler import StreamingHandler
from tests.streaming_fixtures import _parse_sse_payload


class StreamingHandlerTests(unittest.IsolatedAsyncioTestCase):
    def test_native_input_catalog_context_uses_authenticated_request_identity(
        self,
    ) -> None:
        handler = StreamingHandler(
            thread_id="thread-1",
            user_id="body-user",
            session_factory=MagicMock(),
            cc_access_token="trusted-core-token",
            catalog_user_id="authenticated-user",
            inventory_id="inventory-1",
            request_context={
                "city_id": "city-1",
                "native_input_selection": {
                    "catalog_id": "request-context-catalog",
                    "capability_id": "ghgi.inventory.status_overview",
                },
            },
            request_options={
                "project_id": "project-1",
                "native_input_selection": {
                    "catalog_id": "request-options-catalog",
                    "capability_id": "ghgi.inventory.status_overview",
                },
            },
        )
        payload = MessageCreateRequest(
            user_id="attacker-supplied-user",
            content="hello",
            context={
                "user_id": "attacker-supplied-user",
                "organization_id": "organization-1",
                "native_input_selection": {
                    "catalog_id": "catalog-1",
                    "capability_id": "ghgi.inventory.status_overview",
                },
            },
            options={"native_input_selection": {"catalog_id": "forged"}},
        )

        context = handler._native_input_catalog_request(payload)

        self.assertEqual(
            context,
            ActiveRequestContext(
                user_id="authenticated-user",
                thread_id="thread-1",
                organization_id="organization-1",
                project_id="project-1",
                city_id="city-1",
                inventory_id="inventory-1",
            ),
        )

    def test_native_input_catalog_context_requires_validated_core_identity(
        self,
    ) -> None:
        handler = StreamingHandler(
            thread_id="thread-1",
            user_id="body-user",
            session_factory=MagicMock(),
            cc_access_token="unvalidated-token",
            request_context={"city_id": "city-1"},
        )
        payload = MessageCreateRequest(
            user_id="body-user",
            content="hello",
            context={"organization_id": "organization-1"},
        )

        self.assertIsNone(handler._native_input_catalog_request(payload))

    def test_native_input_catalog_context_requires_current_core_credential(
        self,
    ) -> None:
        """Body identity and scope do not establish catalog authorization."""
        handler = StreamingHandler(
            thread_id="thread-1",
            user_id="authenticated-user",
            session_factory=MagicMock(),
            inventory_id="inventory-1",
            request_context={"city_id": "city-1"},
            request_options={"project_id": "project-1"},
        )
        payload = MessageCreateRequest(
            user_id="attacker-supplied-user",
            content="hello",
            context={
                "user_id": "attacker-supplied-user",
                "organization_id": "organization-1",
                "native_input_selection": {
                    "catalog_id": "catalog-1",
                    "capability_id": "ghgi.inventory.status_overview",
                },
            },
            options={"native_input_selection": {"catalog_id": "forged"}},
        )

        context = handler._native_input_catalog_request(payload)

        self.assertIsNone(context)

    async def test_done_event_reflects_persisted_history(self) -> None:
        payload = MessageCreateRequest(
            user_id="user-1",
            content="hello",
            context={
                "native_input_selection": {
                    "catalog_id": "payload-catalog",
                    "capability_id": "ghgi.inventory.status_overview",
                }
            },
            options={
                "native_input_selection": {
                    "catalog_id": "options-catalog",
                    "capability_id": "ghgi.inventory.status_overview",
                }
            },
        )
        handler = StreamingHandler(
            thread_id="thread-1",
            user_id="user-1",
            session_factory=MagicMock(),
        )

        fake_agent_service = MagicMock()
        fake_agent_service.create_agent = AsyncMock(return_value=object())
        fake_agent_service.close = AsyncMock()

        async def fake_stream_events(
            self, agent, request_payload, conversation_history
        ):
            self.assistant_tokens.append("Persisted answer")
            yield format_sse(
                {"index": 0, "content": "Persisted answer"},
                event="message",
                id="0",
            ).encode("utf-8")

        with (
            patch(
                "app.utils.streaming_handler.AgentService",
                return_value=fake_agent_service,
            ) as mock_agent_service,
            patch.object(
                StreamingHandler,
                "_load_conversation_history",
                AsyncMock(return_value=[]),
            ),
            patch.object(
                StreamingHandler,
                "_stream_agent_events",
                new=fake_stream_events,
            ),
            patch(
                "app.utils.streaming_handler.persist_assistant_message",
                AsyncMock(return_value=True),
            ),
        ):
            chunks = [chunk async for chunk in handler.stream_response(payload)]

        done_payload = _parse_sse_payload(chunks[-1])

        self.assertEqual(done_payload["event"], "done")
        self.assertTrue(done_payload["data"]["history_saved"])
        self.assertTrue(handler.history_saved)
        fake_agent_service.close.assert_awaited_once()
        agent_service_kwargs = mock_agent_service.call_args.kwargs
        self.assertNotIn("native_input_selection", agent_service_kwargs)
        self.assertIsNone(agent_service_kwargs["native_input_catalog_context"])

    async def test_persist_refreshed_token_from_agent_service(self) -> None:
        handler = StreamingHandler(
            thread_id="thread-1",
            user_id="user-1",
            session_factory=MagicMock(),
            cc_access_token="old-token",
        )
        handler.agent_service = MagicMock()
        handler.agent_service.current_cc_token.return_value = "fresh-token"
        handler.token_handler = MagicMock()
        handler.token_handler.handle_refreshed_token = AsyncMock(return_value=True)

        await handler._persist_refreshed_token_from_agent()

        handler.token_handler.handle_refreshed_token.assert_awaited_once_with(
            "fresh-token",
            handler.agent_service,
        )
        self.assertEqual(handler.cc_access_token, "fresh-token")

    async def test_resolve_workflow_context_loads_thread_once(self) -> None:
        draft_run_id = str(uuid4())
        concept_note_run_id = str(uuid4())
        handler = StreamingHandler(
            thread_id=str(uuid4()),
            user_id="user-1",
            session_factory=MagicMock(),
        )
        thread_context_loader = AsyncMock(
            return_value=ChatWorkflowContext(
                stationary_energy_draft_run_id=draft_run_id,
                concept_note_run_id=concept_note_run_id,
            )
        )

        with patch.object(
            handler,
            "_load_thread_workflow_context",
            thread_context_loader,
        ):
            await handler._resolve_workflow_context(
                MessageCreateRequest(user_id="user-1", content="hello")
            )

        thread_context_loader.assert_awaited_once()
        self.assertEqual(
            handler.workflow_context,
            ChatWorkflowContext(
                stationary_energy_draft_run_id=draft_run_id,
                concept_note_run_id=concept_note_run_id,
            ),
        )

    async def test_run_config_uses_persisted_stationary_energy_context_marker(
        self,
    ) -> None:
        draft_run_id = str(uuid4())
        payload = MessageCreateRequest(user_id="user-1", content="hello")
        handler = StreamingHandler(
            thread_id=str(uuid4()),
            user_id="user-1",
            session_factory=MagicMock(),
        )
        handler.workflow_context = ChatWorkflowContext(
            stationary_energy_draft_run_id=draft_run_id
        )

        run_config = handler._run_config(payload)

        self.assertEqual(
            run_config.workflow_name,
            "Climate Advisor Stationary Energy Context Chat",
        )
        self.assertEqual(
            run_config.trace_metadata["trace_category"],
            "ca_agentic_context_chat",
        )
        self.assertTrue(run_config.trace_metadata["ca_agentic_flow"])
        self.assertEqual(
            run_config.trace_metadata["stationary_energy_draft_run_id"],
            draft_run_id,
        )
