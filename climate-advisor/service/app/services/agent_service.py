"""
Agent Service for managing OpenAI Agents SDK lifecycle.

This service provides a centralized way to create and manage AI agents
with OpenRouter compatibility, custom tool integration, and configuration
management.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

import openai
from agents import Agent
from openai import AsyncOpenAI

from ..config import get_settings
from ..tools import climate_vector_search

logger = logging.getLogger(__name__)


class AgentService:
    """Service for creating and managing AI agents with OpenRouter support."""
    
    def __init__(self):
        """Initialize the agent service with settings and OpenRouter client."""
        self.settings = get_settings()

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
            "AgentService initialized with model=%s, temperature=%s",
            self.default_model,
            self.default_temperature
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
        agent = Agent(
            name="Climate Advisor",
            instructions=agent_instructions,
            model=agent_model,
            tools=[climate_vector_search],
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

