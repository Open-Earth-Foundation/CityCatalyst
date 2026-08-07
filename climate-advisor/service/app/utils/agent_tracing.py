from __future__ import annotations

import logging
from typing import Any

from agents import set_trace_processors
from langsmith.wrappers import OpenAIAgentsTracingProcessor

from app.config import get_settings


logger = logging.getLogger(__name__)

_TRACING_CONFIGURED = False


def configure_agents_tracing(settings: Any | None = None) -> bool:
    """Configure LangSmith tracing for OpenAI Agents SDK once per process."""
    global _TRACING_CONFIGURED

    settings = settings or get_settings()
    if not getattr(settings, "langsmith_tracing_enabled", False):
        return False
    if _TRACING_CONFIGURED:
        return True

    try:
        set_trace_processors(
            [
                OpenAIAgentsTracingProcessor(
                    project_name=settings.langsmith_project,
                    metadata={"service": settings.app_name},
                )
            ]
        )
        _TRACING_CONFIGURED = True
        logger.info("LangSmith tracing enabled for Agents SDK")
        return True
    except Exception as exc:
        logger.warning("Failed to initialize LangSmith tracing: %s", exc)
        return False
