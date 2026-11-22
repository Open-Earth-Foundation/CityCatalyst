"""Workflow-scoped tool registration and instruction selection."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.services.agent_service import AgentService
from tests.agent_service_fixtures import build_mock_settings


def _create_agent_kwargs(settings, **service_kwargs) -> dict:
    """Create an agent and return the keyword arguments it was built with."""
    with (
        patch("app.services.agent_service.get_settings", return_value=settings),
        patch("app.services.agent_service.AsyncOpenAI"),
        patch("app.services.agent_service.Agent") as agent_class,
    ):
        service = AgentService(**service_kwargs)
        asyncio.run(service.create_agent())
    return agent_class.call_args.kwargs


def _tool_names(agent_kwargs: dict) -> list[str]:
    return [getattr(tool, "name", "") for tool in agent_kwargs["tools"]]


def test_stationary_energy_tools_registered_only_with_draft_context() -> None:
    settings = build_mock_settings()
    draft_tools = _tool_names(
        _create_agent_kwargs(
            settings,
            cc_access_token="jwt-token",
            cc_thread_id=uuid4(),
            cc_user_id="user-123",
            city_id="city-123",
            inventory_id="inventory-123",
            session_factory=MagicMock(),
            stationary_energy_draft_run_id=uuid4(),
        )
    )

    assert set(draft_tools) == {
        "inventory_status_overview",
        "inventory_emissions_context",
        "stationary_energy_list_review_options",
        "stationary_energy_list_notation_keys",
        "stationary_energy_accept_one",
        "stationary_energy_stage_notation_key",
        "stationary_energy_accept_multiple",
        "stationary_energy_accept_all_recommended",
        "stationary_energy_request_bulk_review_confirmation",
        "stationary_energy_request_bulk_notation_confirmation",
        "stationary_energy_apply_bulk_notation_choices",
        "stationary_energy_request_all_recommended_confirmation",
        "stationary_energy_request_staged_source_change_confirmation",
        "stationary_energy_request_staged_sources_rollback_confirmation",
        "stationary_energy_rollback_staged_sources",
        "stationary_energy_rollback_staged_notation_keys",
        "stationary_energy_save_review_draft",
        "stationary_energy_request_inventory_save_confirmation",
    }

    general_tools = _tool_names(
        _create_agent_kwargs(
            settings,
            cc_access_token="jwt-token",
            cc_thread_id=uuid4(),
            cc_user_id="user-123",
            session_factory=MagicMock(),
        )
    )

    for tool_name in (
        "inventory_list_accessible",
        "inventory_status_overview",
        "inventory_emissions_context",
        "get_all_datasources",
        "climate_vector_search",
    ):
        assert tool_name in general_tools
    assert "stationary_energy_accept_one" not in general_tools


def test_stationary_energy_start_draft_registered_only_before_draft_exists() -> None:
    """Start-draft is available only on the pre-draft Stationary Energy surface."""
    settings = build_mock_settings()
    surface = {
        "cc_thread_id": uuid4(),
        "cc_user_id": "user-123",
        "city_id": "city-123",
        "inventory_id": "inventory-123",
        "session_factory": MagicMock(),
        "stationary_energy_surface": True,
    }

    pre_draft = _create_agent_kwargs(settings, **surface)
    start_draft_tool = next(
        tool
        for tool in pre_draft["tools"]
        if getattr(tool, "name", "") == "stationary_energy_start_draft"
    )
    assert "continue_request" in start_draft_tool.params_json_schema["properties"]

    with_draft = _create_agent_kwargs(
        settings, **surface, stationary_energy_draft_run_id=uuid4()
    )
    assert "stationary_energy_start_draft" not in _tool_names(with_draft)


def test_cnb_chat_selects_composed_prompt_even_when_bundle_is_unavailable() -> None:
    settings = build_mock_settings()
    settings.llm.prompts.compose_prompt.side_effect = lambda name: f"Core + {name}"
    with (
        patch("app.services.agent_service.get_settings", return_value=settings),
        patch("app.services.agent_service.AsyncOpenAI"),
        patch(
            "app.services.agent_service.load_agent_context",
            new=AsyncMock(return_value=None),
        ),
        patch("app.services.agent_service.Agent") as agent_class,
    ):
        service = AgentService(
            cc_access_token="token",
            cc_user_id="user-1",
            cc_thread_id=uuid4(),
            session_factory=MagicMock(),
            concept_note_run_id=uuid4(),
        )
        asyncio.run(service.create_agent())
        assert agent_class.call_args.kwargs["instructions"] == "Core + cnb_chat"
        # Choices need no context bundle, so they stay available without one.
        assert _tool_names(agent_class.call_args.kwargs) == ["concept_note_ask_question"]

        # Rebuilding an agent must not fall back to general chat instructions.
        service.system_prompt = None
        asyncio.run(service.create_agent())
        assert agent_class.call_args.kwargs["instructions"] == "Core + cnb_chat"
        asyncio.run(service.create_agent(instructions="Explicit override"))
        assert agent_class.call_args.kwargs["instructions"] == "Explicit override"
