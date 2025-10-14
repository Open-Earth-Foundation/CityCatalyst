"""
Synchronous wrapper for ClimateVectorSearchTool for OpenAI Agents SDK compatibility.

This module provides a sync function tool that wraps the async ClimateVectorSearchTool,
allowing it to be used with the OpenAI Agents SDK which requires synchronous tools.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from agents import function_tool

from .climate_vector_tool import ClimateVectorSearchTool, ClimateToolResult
from ..config import get_settings

logger = logging.getLogger(__name__)


def _format_tool_result_for_llm(result: ClimateToolResult) -> str:
    """Format the ClimateToolResult into a simple string for LLM consumption.
    
    Args:
        result: The result from the vector search tool
        
    Returns:
        Formatted string with search results or error message
    """
    if not result.used:
        reason = result.reason or "unknown"
        return f"Climate search was not used. Reason: {reason}"
    
    if result.prompt_context:
        # Use the pre-formatted prompt context if available
        return result.prompt_context
    
    if not result.matches:
        return "No relevant climate information found for your query."
    
    # Format matches into readable text
    formatted_parts = []
    formatted_parts.append(f"Found {len(result.matches)} relevant climate information sources:\n")
    
    for i, match in enumerate(result.matches, 1):
        formatted_parts.append(f"\n--- Source {i} ---")
        formatted_parts.append(f"File: {match.filename}")
        if match.file_path:
            formatted_parts.append(f"Path: {match.file_path}")
        formatted_parts.append(f"Relevance Score: {match.score:.2f}")
        formatted_parts.append(f"\nContent:\n{match.content}\n")
    
    return "\n".join(formatted_parts)


async def _run_vector_search(question: str) -> str:
    """Internal async function to execute the vector search.
    
    Args:
        question: The search query
        
    Returns:
        Formatted string with search results
    """
    try:
        settings = get_settings()
        tool = ClimateVectorSearchTool(settings=settings)
        
        # Run the async tool
        result = await tool.run(question)
        
        # Format result for LLM
        return _format_tool_result_for_llm(result)
        
    except Exception as exc:
        logger.exception("Error in vector search tool: %s", exc)
        return f"Error executing climate search: {str(exc)}"


def climate_vector_search_sync(question: str) -> str:
    """Synchronous wrapper for climate vector search - for testing purposes.

    Args:
        question: The search query to find relevant climate information.

    Returns:
        Formatted string with search results
    """
    # Check if we're already in an event loop (e.g., when called from Agents SDK)
    try:
        loop = asyncio.get_running_loop()
        # We're in an async context, create a task to run the async function
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(asyncio.run, _run_vector_search(question))
            return future.result()
    except RuntimeError:
        # No running event loop, safe to use asyncio.run()
        try:
            return asyncio.run(_run_vector_search(question))
        except Exception as exc:
            logger.exception("Fatal error in climate_vector_search wrapper: %s", exc)
            return f"Unable to search climate knowledge base: {str(exc)}"


@function_tool
async def climate_vector_search(question: str) -> str:
    """Search the climate knowledge base for relevant information.

    This tool searches a vector database containing climate-related documents,
    research papers, and information about climate change, emissions, GHG protocols,
    carbon accounting, sustainability, environmental policies, renewable energy,
    net zero goals, climate adaptation, and mitigation strategies.

    Use this tool when the user asks about climate-related topics that may require
    specific factual information, data, or references from authoritative sources.

    Args:
        question: The search query to find relevant climate information.
                 Should be a clear, specific question or topic related to climate.

    Returns:
        A formatted string containing relevant climate information from the knowledge base,
        including source references and content excerpts. If no relevant information is found,
        returns a message indicating so.

    Examples:
        - "What is Scope 2 emissions?"
        - "How do cities calculate GHG emissions?"
        - "What are the IPCC guidelines for carbon accounting?"
    """
    return await _run_vector_search(question)

