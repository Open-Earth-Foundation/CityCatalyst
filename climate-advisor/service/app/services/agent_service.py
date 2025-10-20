"""
Agent Service for managing OpenAI Agents SDK lifecycle.

This service provides a centralized way to create and manage AI agents
with OpenRouter compatibility, custom tool integration, and configuration
management.
"""

from __future__ import annotations

import logging
import os
from typing import Dict, Optional
from uuid import UUID
from typing import Union

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
        self._inventory_tool: Optional[CCInventoryTool] = None
        self._token_ref: Dict[str, Optional[str]] = {"value": cc_access_token}

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
        
        # Create agent with climate vector search tool
        tools = [climate_vector_search]

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
        else:
            logger.debug(
                "Skipping CC inventory tools (token=%s, user_id=%s, thread_id=%s)",
                "present" if self.cc_access_token else "absent",
                self.cc_user_id,
                self.cc_thread_id,
            )

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

