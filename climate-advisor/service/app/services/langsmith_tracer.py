from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Dict, List, Optional
from uuid import uuid4

from ..config import get_settings

try:
    import requests
except ImportError:  # pragma: no cover - requests is required but guard for safety
    requests = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)

try:
    from langsmith import Client
    from langsmith.schemas import RunEvent
except ImportError:  # pragma: no cover - langsmith is optional at runtime
    Client = None  # type: ignore[assignment,misc]
    RunEvent = None  # type: ignore[assignment,misc]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class LangSmithTracer:
    """LangSmith tracer supporting both automatic and manual tracing modes."""

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
        self.enabled = bool(enabled and api_key and Client is not None)
        self._client: Optional[Any] = None
        self._session = None
        self._workspace_id = workspace_id
        self._active_runs: Dict[str, Dict[str, Any]] = {}

        if not self.enabled:
            logger.debug("LangSmith tracing is disabled")
            if enabled and not api_key:
                logger.warning(
                    "LangSmith tracing enabled but LANGSMITH_API_KEY not set. "
                    "Populate the key in the environment or disable tracing."
                )
            return

        api_url = endpoint.rstrip("/") if endpoint else None
        try:
            if Client is None:
                raise ImportError("LangSmith Client not available")
            self._client = Client(api_url=api_url, api_key=api_key)
        except Exception as exc:  # pragma: no cover - network failures
            logger.exception("Failed to initialise LangSmith client: %s", exc)
            self.enabled = False
            return

        # Make sure org-scoped keys include the workspace/tenant header
        if workspace_id:
            os.environ["LANGSMITH_WORKSPACE_ID"] = workspace_id
            try:
                if self._client and hasattr(self._client, 'session'):
                    self._client.session.headers["X-Tenant-ID"] = workspace_id
            except Exception:  # pragma: no cover - defensive
                logger.warning("Unable to set LangSmith workspace header")

        logger.info(
            "LangSmith tracing enabled for project '%s' (manual API logging)",
            self.project_name,
        )

    def _append_event(self, run_id: Optional[str], name: str, data: Dict[str, Any]) -> None:
        if not run_id or not self.enabled:
            return
        if RunEvent is None:
            return
        record = self._active_runs.get(run_id)
        if record is None:
            return
        events: List[Any] = record.setdefault("events", [])
        events.append(RunEvent(name=name, time=_utcnow(), kwargs=data))

    def start_conversation_run(
        self,
        *,
        name: str,
        inputs: Dict[str, Any],
        tags: Optional[List[str]] = None,
    ) -> Optional[str]:
        """Start a new conversation run for manual tracing."""
        if not self.enabled:
            return None

        if not self._client:
            return None

        run_id = str(uuid4())
        try:
            payload_tags = tags or []
            self._client.create_run(
                name=name,
                inputs=inputs,
                run_type="chain",
                project_name=self.project_name,
                id=run_id,
                start_time=_utcnow(),
                tags=payload_tags,
            )
        except Exception as exc:  # pragma: no cover - network/SDK errors
            logger.exception("Failed to create LangSmith run: %s", exc)
            return None

        self._active_runs[run_id] = {"events": []}
        return run_id

    def complete_run(
        self,
        run_id: Optional[str],
        *,
        outputs: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> None:
        """Complete a conversation run and record final outputs."""
        if not self.enabled:
            return

        if not run_id or not self._client:
            return

        record = self._active_runs.pop(run_id, {})
        events = record.get("events")

        update_kwargs: Dict[str, Any] = {"end_time": _utcnow()}
        if outputs is not None:
            update_kwargs["outputs"] = outputs
        if error:
            update_kwargs["error"] = error
        if events:
            update_kwargs["events"] = events

        try:
            self._client.update_run(run_id, **update_kwargs)
        except Exception as exc:  # pragma: no cover
            logger.exception("Failed to complete LangSmith run %s: %s", run_id, exc)

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
        """Log a tool execution as a separate run with parent relationship."""
        if not self.enabled:
            return None

        if not self._client:
            return None

        run_id = str(uuid4())
        try:
            payload_tags = tags or []
            self._client.create_run(
                name=name,
                inputs=inputs,
                run_type="tool",
                project_name=self.project_name,
                id=run_id,
                start_time=_utcnow(),
                parent_run_id=parent_run_id,
                tags=payload_tags,
            )

            update_kwargs: Dict[str, Any] = {"end_time": _utcnow()}
            if outputs is not None:
                update_kwargs["outputs"] = outputs
            if error:
                update_kwargs["error"] = error

            self._client.update_run(run_id, **update_kwargs)
        except Exception as exc:  # pragma: no cover
            logger.exception("Failed to log LangSmith tool run: %s", exc)
            return None

        return run_id

    def record_stream_event(
        self,
        run_id: Optional[str],
        *,
        event_name: str,
        payload: Dict[str, Any],
    ) -> None:
        if not self.enabled or not run_id:
            return
        self._append_event(run_id, event_name, payload)


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
