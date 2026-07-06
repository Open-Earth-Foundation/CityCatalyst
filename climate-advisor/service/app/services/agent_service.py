"""
Agent Service for managing OpenAI Agents SDK lifecycle.

This service provides a centralized way to create and manage AI agents
with OpenRouter compatibility, custom tool integration, and configuration
management.
"""

from __future__ import annotations

import logging
from urllib.parse import urlparse
from typing import Any, Dict, Optional, Sequence, Union
from uuid import UUID

import openai
from agents import Agent, ModelSettings, OpenAIChatCompletionsModel
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import get_settings
from app.services.openrouter_client import build_openrouter_client_options
from app.tools.cc_inventory_tool import CCInventoryTool
from app.tools.cc_inventory_wrappers import build_cc_inventory_tools
from app.tools.climate_vector_sync import climate_vector_search
from app.tools.stationary_energy_review_tools import build_stationary_energy_review_tools
from app.tools.stationary_energy_start_draft_tools import (
    build_stationary_energy_start_draft_tools,
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
        inventory_id: Optional[str] = None,
        city_id: Optional[str] = None,
        session_factory: Optional[async_sessionmaker[AsyncSession]] = None,
        stationary_energy_draft_run_id: Optional[Union[str, UUID]] = None,
        stationary_energy_surface: bool = False,
    ) -> None:
        """Initialize the agent service with settings and OpenRouter client.
        
        Args:
            cc_access_token: JWT token from CityCatalyst for inventory access
            cc_thread_id: Current thread ID (for token refresh context)
            cc_user_id: User ID (for token refresh and inventory queries)
        """
        self.settings = get_settings()
        configure_agents_tracing(self.settings)
        
        # Store CC credentials for tools to use
        self.cc_access_token = cc_access_token
        self.cc_thread_id = cc_thread_id
        self.cc_user_id = cc_user_id
        self.inventory_id = inventory_id
        self.city_id = city_id
        self.session_factory = session_factory
        self.stationary_energy_draft_run_id = (
            str(stationary_energy_draft_run_id)
            if stationary_energy_draft_run_id
            else None
        )
        self._stationary_energy_surface = bool(
            stationary_energy_surface or self.stationary_energy_draft_run_id
        )
        self._inventory_tool: Optional[CCInventoryTool] = None
        self._token_ref: Dict[str, Optional[str]] = {"value": cc_access_token}
        self._inventory_prompt: Optional[str] = None
        self.active_instructions: Optional[str] = None

        # Initialize OpenRouter-configured AsyncOpenAI client and set globally
        self.client = self._create_openrouter_client()
        # Set the client globally for the Agents SDK to use
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

        # General chat uses the default prompt. Stationary Energy review chat
        # starts from its dedicated prompt instead, so default.md is not part of
        # that agentic flow.
        self.system_prompt = (
            None
            if self._uses_stationary_energy_review_prompt
            else self.settings.llm.prompts.get_prompt("default")
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

    async def _build_inventory_prompt(self, *, thread_identifier: str) -> Optional[str]:
        """Load the inventory-context prompt if an inventory is associated with the thread."""
        if self._inventory_prompt is not None:
            return self._inventory_prompt

        if not self.inventory_id:
            logger.debug("No inventory_id available; skipping inventory prompt")
            return None

        if not (self.cc_access_token and self.cc_user_id and self._inventory_tool):
            logger.debug(
                "Missing prerequisites for inventory prompt (token=%s, user_id=%s, tool=%s)",
                bool(self.cc_access_token),
                self.cc_user_id,
                bool(self._inventory_tool),
            )
            return None

        try:
            result = await self._inventory_tool.fetch_inventory(
                self.inventory_id,
                token=self._token_ref["value"],
                user_id=str(self.cc_user_id),
                thread_id=thread_identifier,
            )
        except Exception:
            logger.exception(
                "Unexpected error fetching inventory %s for prompt generation",
                self.inventory_id,
            )
            return None

        if not result.success or not result.data:
            logger.warning(
                "Unable to build inventory prompt (success=%s, error=%s, code=%s)",
                result.success,
                result.error,
                result.error_code,
            )
            return None

        payload = result.data.get("data", result.data) if isinstance(result.data, dict) else result.data
        context_block = self._format_inventory_context(payload)
        if not context_block:
            logger.debug("Inventory context formatting returned empty payload")
            return None

        try:
            template = self.settings.llm.prompts.get_prompt("inventory_context")
            self._inventory_prompt = template.format(inventory_context=context_block)
        except Exception as exc:
            logger.warning("Failed to apply inventory context template: %s", exc, exc_info=True)
            self._inventory_prompt = context_block

        return self._inventory_prompt

    @staticmethod
    def _nearest_population(populations: Any, target_year: Any, value_key: str) -> tuple[Optional[Any], Optional[int]]:
        """Find the population entry closest to the target year for a given key."""
        if not populations or target_year is None:
            return None, None

        try:
            target_year_int = int(target_year)
        except (TypeError, ValueError):
            return None, None

        closest_value: Optional[Any] = None
        closest_year: Optional[int] = None

        for entry in populations:
            if not isinstance(entry, dict):
                continue
            value = entry.get(value_key)
            entry_year = entry.get("year")
            if value is None or entry_year is None:
                continue
            try:
                entry_year_int = int(entry_year)
            except (TypeError, ValueError):
                continue

            if closest_year is None or abs(entry_year_int - target_year_int) < abs(closest_year - target_year_int):
                closest_value = value
                closest_year = entry_year_int

        return closest_value, closest_year

    def _format_inventory_context(self, inventory: Any) -> Optional[str]:
        """Format inventory data into a human-readable context snippet."""
        if not isinstance(inventory, dict):
            return None

        city = inventory.get("city") or {}
        inventory_year = inventory.get("year")
        inventory_name = inventory.get("inventoryName") or inventory.get("name")
        inventory_id = inventory.get("inventoryId") or inventory.get("id") or self.inventory_id
        total_emissions = inventory.get("totalEmissions")
        inventory_values = inventory.get("inventoryValues") or []

        populations = city.get("populations") or []
        city_population, city_population_year = self._nearest_population(populations, inventory_year, "population")
        region_population, region_population_year = self._nearest_population(populations, inventory_year, "regionPopulation")
        country_population, country_population_year = self._nearest_population(populations, inventory_year, "countryPopulation")

        lines = []

        if inventory_name:
            lines.append(f"- Inventory name: {inventory_name}")
        if inventory_id:
            lines.append(f"- Inventory ID: {inventory_id}")
        if inventory_year is not None:
            lines.append(f"- Inventory year: {inventory_year}")
        if total_emissions is not None:
            lines.append(f"- Reported total emissions: {total_emissions}")
        if inventory_values:
            lines.append(f"- Recorded inventory values: {len(inventory_values)}")

        city_name = city.get("name")
        region_name = city.get("region")
        country_name = city.get("country")
        country_locode = city.get("countryLocode") or city.get("locode")
        city_area = city.get("area")

        if city_name:
            lines.append(f"- City: {city_name}")
        if region_name:
            lines.append(f"- Region: {region_name}")
        if country_name:
            lines.append(f"- Country: {country_name}")
        if country_locode:
            lines.append(f"- Country LOCODE: {country_locode}")
        if city_area is not None:
            lines.append(f"- City area (km²): {city_area}")

        if city_population is not None:
            suffix = f" (year {city_population_year})" if city_population_year is not None else ""
            lines.append(f"- City population: {city_population}{suffix}")

        if region_population is not None:
            suffix = f" (year {region_population_year})" if region_population_year is not None else ""
            lines.append(f"- Region population: {region_population}{suffix}")

        if country_population is not None:
            suffix = f" (year {country_population_year})" if country_population_year is not None else ""
            lines.append(f"- Country population: {country_population}{suffix}")

        if not lines:
            return None

        return "\n".join(lines)

    def _can_register_stationary_energy_start_draft_tools(self) -> bool:
        """Return whether chat can expose the pre-draft Stationary Energy tool."""
        return bool(
            self._stationary_energy_surface
            and not self.stationary_energy_draft_run_id
            and self.city_id
            and self.inventory_id
            and self.session_factory
            and self.cc_user_id
        )

    def _build_stationary_energy_start_draft_tools(self) -> Sequence[object]:
        """Create start-draft tools scoped to the active city and inventory."""
        assert self.session_factory is not None
        assert self.city_id is not None
        assert self.inventory_id is not None
        assert self.cc_user_id is not None

        return build_stationary_energy_start_draft_tools(
            session_factory=self.session_factory,
            city_id=str(self.city_id),
            inventory_id=str(self.inventory_id),
            user_id=str(self.cc_user_id),
            thread_id=(
                UUID(str(self.cc_thread_id)) if self.cc_thread_id else None
            ),
            token_ref=self._token_ref,
        )
    
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
            agent_instructions = self.settings.llm.prompts.get_prompt(
                "stationary_energy_review"
            )
        else:
            agent_instructions = (
                self.system_prompt
                or self.settings.llm.prompts.get_prompt("default")
            )
        inventory_prompt: Optional[str] = None
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
            inventory_tools, token_ref = build_cc_inventory_tools(
                inventory_tool=self._inventory_tool,
                access_token=self._token_ref["value"],
                user_id=str(self.cc_user_id),
                thread_id=thread_identifier,
            )
            self._token_ref = token_ref
            tools.extend(inventory_tools)
            logger.info(
                "Registered CC inventory tools for thread_id=%s user_id=%s",
                thread_identifier,
                self.cc_user_id,
            )
            inventory_prompt = await self._build_inventory_prompt(
                thread_identifier=thread_identifier,
            )
        else:
            logger.debug(
                "Skipping CC inventory tools (token=%s, user_id=%s, thread_id=%s)",
                "present" if self.cc_access_token else "absent",
                self.cc_user_id,
                self.cc_thread_id,
            )

        if inventory_prompt:
            agent_instructions = f"{agent_instructions}\n\n{inventory_prompt}"

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

        if self._can_register_stationary_energy_start_draft_tools():
            tools.extend(self._build_stationary_energy_start_draft_tools())
            # The tool description carries the pre-draft routing instructions.
            logger.info(
                "Registered Stationary Energy start-draft tool inventory_id=%s thread_id=%s user_id=%s",
                self.inventory_id,
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
            [tool.name for tool in agent.tools] if hasattr(agent, 'tools') else []
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
        self._inventory_prompt = None

