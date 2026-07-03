"""
Agent Service for managing OpenAI Agents SDK lifecycle.

This service provides a centralized way to create and manage AI agents
with OpenRouter compatibility, custom tool integration, and configuration
management.
"""

from __future__ import annotations

import logging
from urllib.parse import urlparse
from typing import Dict, Optional, Union
from uuid import UUID

import openai
from agents import Agent, ModelSettings, OpenAIChatCompletionsModel
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import get_settings
from app.services.openrouter_client import build_openrouter_client_options
from app.tools.cc_inventory_tool import CCInventoryTool
from app.tools.cc_inventory_wrappers import build_cc_datasource_tools
from app.tools.climate_vector_sync import climate_vector_search
from app.tools.inventory_context_tools import build_inventory_capability_tools
from app.tools.stationary_energy_review_tools import (
    build_stationary_energy_review_tools,
)
from app.utils.agent_tracing import configure_agents_tracing

logger = logging.getLogger(__name__)


class AgentService:
    """Service for creating and managing AI agents with OpenRouter support.

    Optionally stores CityCatalyst credentials (token, thread_id, user_id)
    for use by tools that query CC inventory data.
    """

    def __init__(
        self,
        cc_access_token: Optional[str] = None,
        cc_thread_id: Optional[Union[str, UUID]] = None,
        cc_user_id: Optional[str] = None,
        session_factory: Optional[async_sessionmaker[AsyncSession]] = None,
        stationary_energy_draft_run_id: Optional[Union[str, UUID]] = None,
    ) -> None:
        """Initialize the agent service with settings and OpenRouter client.

        Args:
            cc_access_token: JWT token from CityCatalyst for inventory access
            cc_thread_id: Current thread ID (for token refresh context)
            cc_user_id: User ID (for token refresh and inventory queries)
        """
        self.settings = get_settings()
        configure_agents_tracing(self.settings)

        # Store CC credentials for tools to use.
        self.cc_access_token = cc_access_token
        self.cc_thread_id = cc_thread_id
        self.cc_user_id = cc_user_id
        self.session_factory = session_factory
        self.stationary_energy_draft_run_id = (
            str(stationary_energy_draft_run_id)
            if stationary_energy_draft_run_id
            else None
        )
        self._inventory_tool: Optional[CCInventoryTool] = None
        self._token_ref: Dict[str, Optional[str]] = {"value": cc_access_token}
        self.active_instructions: Optional[str] = None

        # Initialize the chat client once and expose it to the Agents SDK.
        self.client = self._create_openrouter_client()
        openai.api_key = self.client.api_key
        openai.base_url = self.client.base_url
        openai.default_headers = self.client.default_headers
        openai.timeout = self.client.timeout
        openai.max_retries = self.client.max_retries

        self._uses_stationary_energy_review_prompt = bool(
            self.stationary_energy_draft_run_id
            and self.session_factory
            and self.cc_user_id
        )

        # Compose the shared core prompt with the active workflow prompt.
        self.chat_system_prompt = self.settings.llm.prompts.compose_prompt("chat")
        self.stationary_energy_system_prompt = (
            self.settings.llm.prompts.compose_prompt("stationary_energy_review")
            if self.settings.llm.prompts.stationary_energy_review
            else None
        )
        self.system_prompt = (
            None if self._uses_stationary_energy_review_prompt else self.chat_system_prompt
        )

        orchestrator_model = self.settings.llm.models.orchestrator
        agentic_flow_model = self.settings.llm.models.agentic_flow or orchestrator_model
        self.raw_default_model = orchestrator_model.name
        self.raw_agentic_flow_model = agentic_flow_model.name
        self.default_model = self._resolve_chat_model_name(self.raw_default_model)
        self.agentic_flow_model = self._resolve_chat_model_name(
            self.raw_agentic_flow_model
        )
        self.default_temperature = orchestrator_model.temperature
        self.agentic_flow_temperature = agentic_flow_model.temperature

        logger.info(
            "AgentService initialized with raw_default_model=%s, default_model=%s, raw_agentic_flow_model=%s, agentic_flow_model=%s, base_url=%s, temperature=%s, agentic_flow_temperature=%s, cc_token=%s",
            self.raw_default_model,
            self.default_model,
            self.raw_agentic_flow_model,
            self.agentic_flow_model,
            self._chat_base_url,
            self.default_temperature,
            self.agentic_flow_temperature,
            "present" if cc_access_token else "absent",
        )

    def preferred_model_for_context(
        self,
        *,
        stationary_energy_draft_run_id: Optional[str] = None,
    ) -> str:
        """Choose the default chat model for the current workflow context."""
        if stationary_energy_draft_run_id:
            return self.agentic_flow_model
        return self.default_model

    def _chat_base_hostname(self) -> str:
        """Return the hostname for the active chat-completions base URL."""
        if not self._chat_base_url:
            return ""
        return (urlparse(self._chat_base_url).hostname or "").lower()

    def _uses_openai_model_names(self) -> bool:
        """Return whether the active chat provider expects raw OpenAI model IDs."""
        return self._chat_base_hostname() == "api.openai.com"

    def _resolve_chat_model_name(self, model: str) -> str:
        """Normalize provider-prefixed model IDs for the active chat provider."""
        if self._uses_openai_model_names() and model.startswith("openai/"):
            return model.split("/", 1)[1]
        return model

    def _temperature_for_model(self, *, raw_model: str, resolved_model: str) -> float:
        """Return the configured temperature for the selected chat model."""
        if (
            raw_model == self.raw_agentic_flow_model
            or resolved_model == self.agentic_flow_model
        ):
            return self.agentic_flow_temperature
        return self.default_temperature

    def _create_openrouter_client(self) -> AsyncOpenAI:
        """Create an AsyncOpenAI client configured from the shared OpenRouter helper."""

        client_options = build_openrouter_client_options(
            self.settings,
            missing_api_key_message="OpenRouter API key (OPENROUTER_API_KEY) must be set",
        )
        self._chat_base_url = client_options.base_url
        client = AsyncOpenAI(**client_options.kwargs)
        logger.info("OpenRouter client created with base_url=%s", self._chat_base_url)
        return client

    async def create_agent(
        self,
        *,
        model: Optional[str] = None,
        instructions: Optional[str] = None,
    ) -> Agent:
        """Create an AI agent with climate tools.

        Temperature is selected from the configured orchestrator or agentic-flow role.
        The Agents SDK uses the OpenAI client configuration set during initialization.

        Args:
            model: Optional model override (uses default if not provided)
            instructions: Optional instructions override

        Returns:
            Configured Agent instance
        """
        # Resolve model and instruction settings before registering workflow tools.
        raw_agent_model = model or self.raw_default_model
        agent_model = self._resolve_chat_model_name(raw_agent_model)
        agent_temperature = self._temperature_for_model(
            raw_model=raw_agent_model,
            resolved_model=agent_model,
        )
        if instructions:
            agent_instructions = instructions
        elif self._uses_stationary_energy_review_prompt:
            agent_instructions = (
                self.stationary_energy_system_prompt
                or self.settings.llm.prompts.compose_prompt(
                    "stationary_energy_review"
                )
            )
        else:
            agent_instructions = (
                self.system_prompt
                or self.settings.llm.prompts.compose_prompt("chat")
            )
        tools = []

        # General chat can query CityCatalyst inventory data directly. Active
        # Stationary Energy review chat uses the persisted draft snapshot and
        # scoped review tools instead.
        if (
            not self._uses_stationary_energy_review_prompt
            and self.cc_access_token
            and self.cc_user_id
            and self.cc_thread_id
        ):
            thread_identifier = str(self.cc_thread_id)
            self._inventory_tool = CCInventoryTool()
            datasource_tools, token_ref = build_cc_datasource_tools(
                inventory_tool=self._inventory_tool,
                access_token=self._token_ref["value"],
                user_id=str(self.cc_user_id),
                thread_id=thread_identifier,
            )
            self._token_ref = token_ref
            inventory_tools = build_inventory_capability_tools(
                user_id=str(self.cc_user_id),
                token_ref=self._token_ref,
            )
            tools.extend(inventory_tools)
            tools.extend(datasource_tools)
            logger.info(
                "Registered CC inventory capability tools for thread_id=%s user_id=%s",
                thread_identifier,
                self.cc_user_id,
            )
        else:
            logger.debug(
                "Skipping CC inventory tools (token=%s, user_id=%s, thread_id=%s)",
                "present" if self.cc_access_token else "absent",
                self.cc_user_id,
                self.cc_thread_id,
            )

        # Add Stationary Energy review tools only for an active CA-owned draft run.
        if (
            self.stationary_energy_draft_run_id
            and self.session_factory
            and self.cc_user_id
        ):
            stationarity_tools = build_stationary_energy_review_tools(
                session_factory=self.session_factory,
                draft_run_id=self.stationary_energy_draft_run_id,
                user_id=str(self.cc_user_id),
                token_ref=self._token_ref,
            )
            tools.extend(stationarity_tools)
            logger.info(
                "Registered Stationary Energy review tools for draft_run_id=%s thread_id=%s user_id=%s",
                self.stationary_energy_draft_run_id,
                self.cc_thread_id,
                self.cc_user_id,
            )

        # Keep vector search available for general climate-advice fallback context.
        if not self._uses_stationary_energy_review_prompt:
            tools.append(climate_vector_search)

        self.active_instructions = agent_instructions

        # Build the Agents SDK object with the finalized instructions and tool list.
        agent = Agent(
            name="Climate Advisor",
            instructions=agent_instructions,
            model=OpenAIChatCompletionsModel(
                model=agent_model,
                openai_client=self.client,
            ),
            model_settings=ModelSettings(
                temperature=agent_temperature,
                include_usage=True,
            ),
            tools=tools,
        )

        logger.info(
            "Created agent with raw_model=%s, resolved_model=%s, temperature=%s (from config), tools=%s",
            raw_agent_model,
            agent_model,
            agent_temperature,
            [tool.name for tool in agent.tools] if hasattr(agent, "tools") else [],
        )

        return agent

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        if self.client:
            await self.client.close()
            logger.info("AgentService client closed")
        if self._inventory_tool:
            await self._inventory_tool.close()

    def update_cc_token(self, token: str) -> None:
        """Update the cached CC token used by inventory tools."""
        self.cc_access_token = token
        self._token_ref["value"] = token

    def current_cc_token(self) -> Optional[str]:
        """Return the latest CC token after tool execution."""
        return self._token_ref.get("value")
