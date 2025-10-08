from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Dict, List, Optional

from ..config import get_settings

try:
    import requests
except ImportError:  # pragma: no cover - requests is required but guard for safety
    requests = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)

try:
    from langsmith import Client
except ImportError:  # pragma: no cover - langsmith is optional at runtime
    Client = None  # type: ignore[assignment]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class LangSmithTracer:
    """Simple wrapper around LangSmith client for manual run logging."""

    def __init__(
        self,
        *,
        api_key: Optional[str],
        endpoint: Optional[str],
        project_name: Optional[str],
        enabled: bool,
        workspace_id: Optional[str] = None,
    ) -> None:
        self.project_name = project_name or "climate_advisor"
        self.enabled = bool(enabled and api_key)
        self._client = None
        self._session = None
        self._workspace_id = workspace_id

        if not self.enabled:
            logger.debug("LangSmith tracing is disabled")
            if not api_key:
                logger.warning("LangSmith tracing is enabled but LANGSMITH_API_KEY is not set. Create a .env file with your LangSmith API key or disable tracing in llm_config.yaml")
            return

        # Set environment variables for automatic LangChain/LangGraph tracing
        # This enables built-in instrumentation without manual run creation
        if api_key:
            os.environ["LANGSMITH_API_KEY"] = api_key
        os.environ["LANGSMITH_TRACING"] = "true"
        os.environ["LANGSMITH_PROJECT"] = self.project_name
        
        if endpoint:
            os.environ["LANGSMITH_ENDPOINT"] = endpoint.rstrip("/")
        
        # Note: workspace_id is intentionally NOT used here
        # Automatic tracing doesn't require workspace_id and avoids 403 errors
        
        logger.info("LangSmith automatic tracing enabled for project: %s", self.project_name)
        logger.info("Tracing will be handled automatically by LangChain/LangGraph SDK")

    def start_conversation_run(
        self,
        *,
        name: str,
        inputs: Dict[str, Any],
        tags: Optional[List[str]] = None,
    ) -> Optional[str]:
        # Manual run creation disabled - using automatic tracing instead
        # LangChain/LangGraph will automatically trace if env vars are set
        if not self.enabled:
            return None
        
        logger.debug("Automatic tracing is enabled - runs will be created automatically by LangChain SDK")
        return None

    def complete_run(
        self,
        run_id: Optional[str],
        *,
        outputs: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> None:
        # Manual run completion disabled - using automatic tracing instead
        # LangChain/LangGraph will automatically complete runs
        if not self.enabled:
            return
        
        logger.debug("Automatic tracing is enabled - runs will be completed automatically by LangChain SDK")

    def log_tool_run(
        self,
        *,
        parent_run_id: Optional[str],
        name: str,
        inputs: Dict[str, Any],
        outputs: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> Optional[str]:
        # Manual tool run logging disabled - using automatic tracing instead
        # LangChain/LangGraph will automatically trace tool calls
        if not self.enabled:
            return None
        
        logger.debug("Automatic tracing is enabled - tool runs will be traced automatically by LangChain SDK")
        return None


@lru_cache(maxsize=1)
def _get_langsmith_tracer() -> LangSmithTracer:
    settings = get_settings()
    # Get workspace ID from environment variable
    workspace_id = os.getenv("LANGSMITH_WORKSPACE_ID")
    return LangSmithTracer(
        api_key=settings.langsmith_api_key,
        endpoint=settings.langsmith_endpoint,
        project_name=settings.langsmith_project,
        enabled=settings.langsmith_tracing_enabled,
        workspace_id=workspace_id,
    )


def get_langsmith_tracer() -> Optional[LangSmithTracer]:
    tracer = _get_langsmith_tracer()
    return tracer if tracer.enabled else None
