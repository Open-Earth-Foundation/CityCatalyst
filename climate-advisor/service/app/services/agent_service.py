"""
Agent Service for managing OpenAI Agents SDK lifecycle.

This service provides a centralized way to create and manage AI agents
with OpenRouter compatibility, custom tool integration, and configuration
management.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional, Union
from uuid import UUID

import openai
from agents import Agent
from openai import AsyncOpenAI

from ..config import get_settings
from ..tools import (
    CCInventoryTool,
    build_cc_inventory_tools,
    climate_vector_search,
)

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
    ):
        """Initialize the agent service with settings and OpenRouter client.
        
        Args:
            cc_access_token: JWT token from CityCatalyst for inventory access
            cc_thread_id: Current thread ID (for token refresh context)
            cc_user_id: User ID (for token refresh and inventory queries)
        """
        self.settings = get_settings()
        
        # Store CC credentials for tools to use
        self.cc_access_token = cc_access_token
        self.cc_thread_id = cc_thread_id
        self.cc_user_id = cc_user_id
        self.inventory_id = inventory_id
        self._inventory_tool: Optional[CCInventoryTool] = None
        self._token_ref: Dict[str, Optional[str]] = {"value": cc_access_token}
        self._inventory_prompt: Optional[str] = None

        # Initialize OpenRouter-configured AsyncOpenAI client and set globally
        self.client = self._create_openrouter_client()
        # Set the client globally for the Agents SDK to use
        openai.api_key = self.client.api_key
        openai.base_url = self.client.base_url
        openai.default_headers = self.client.default_headers
        openai.timeout = self.client.timeout
        openai.max_retries = self.client.max_retries

        # Load system prompt
        self.system_prompt = self.settings.llm.prompts.get_prompt("default")

        # Get default model and temperature from settings
        self.default_model = self.settings.llm.models.get("default", "openai/gpt-4o")
        self.default_temperature = self.settings.llm.generation.defaults.temperature

        logger.info(
            "AgentService initialized with model=%s, temperature=%s, cc_token=%s",
            self.default_model,
            self.default_temperature,
            "present" if cc_access_token else "absent",
        )
    
    def _create_openrouter_client(self) -> AsyncOpenAI:
        """Create an AsyncOpenAI client configured for OpenRouter.
        
        Returns:
            Configured AsyncOpenAI client
        """
        api_key = self.settings.openrouter_api_key
        if not api_key:
            raise ValueError("OpenRouter API key (OPENROUTER_API_KEY) must be set")
        
        base_url = self.settings.openrouter_base_url or "https://openrouter.ai/api/v1"
        
        # Get OpenRouter metadata from environment or settings
        referer = os.getenv("OPENROUTER_REFERER") or "https://citycatalyst.ai"
        title = os.getenv("OPENROUTER_TITLE") or "CityCatalyst Climate Advisor"
        
        # Configure headers for OpenRouter
        default_headers = {
            "HTTP-Referer": referer,
            "X-Title": title,
            "Accept": "application/json",
        }
        
        # Get timeout from settings
        timeout_ms = self.settings.llm.api.openrouter.timeout_ms or 30000
        timeout_seconds = timeout_ms / 1000
        
        client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url.rstrip("/"),
            timeout=timeout_seconds,
            default_headers=default_headers,
            max_retries=2,
        )
        
        logger.info("OpenRouter client created with base_url=%s", base_url)
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
    
    async def create_agent(
        self,
        *,
        model: Optional[str] = None,
        instructions: Optional[str] = None,
    ) -> Agent:
        """Create an AI agent with climate tools.
        
        Temperature is configured globally in llm_config.yaml and applies to all requests.
        The Agents SDK uses the OpenAI client configuration set during initialization.
        
        Args:
            model: Optional model override (uses default if not provided)
            instructions: Optional instructions override (uses system prompt if not provided)
        
        Returns:
            Configured Agent instance
        """
        agent_model = model or self.default_model
        agent_instructions = instructions or self.system_prompt
        inventory_prompt: Optional[str] = None
        tools = []

        if self.cc_access_token and self.cc_user_id and self.cc_thread_id:
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

        tools.append(climate_vector_search)

        agent = Agent(
            name="Climate Advisor",
            instructions=agent_instructions,
            model=agent_model,
            tools=tools,
        )
        
        logger.info(
            "Created agent with model=%s, temperature=%s (from config), tools=%s",
            agent_model,
            self.default_temperature,
            [tool.name for tool in agent.tools] if hasattr(agent, 'tools') else []
        )
        
        return agent
    
    async def close(self):
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

