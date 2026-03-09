"""Per-request JSONL artifact writer."""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Mapping
from uuid import UUID


logger = logging.getLogger(__name__)


def _artifacts_enabled() -> bool:
    """Return True when ARTIFACT_LOG_JSONL env var is set to a truthy value."""
    value = os.getenv("ARTIFACT_LOG_JSONL", "true").strip().lower()
    return value in {"1", "true", "yes", "on"}


class ArtifactWriter:
    """Best-effort JSONL artifact writer for one request."""

    def __init__(self, request_id: UUID) -> None:
        self.request_id = request_id
        self.enabled = _artifacts_enabled()
        log_dir = Path(os.getenv("LOG_DIR", "logs"))
        self.path = log_dir / "requests" / f"{request_id}.jsonl"

    def write_event(self, event_type: str, payload: Mapping[str, object]) -> None:
        """Append a single JSON event line. Failures are logged and ignored."""
        if not self.enabled:
            return

        event = {
            "timestamp": datetime.now(UTC).isoformat(),
            "request_id": str(self.request_id),
            "event_type": event_type,
            "payload": dict(payload),
        }
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(event, ensure_ascii=True))
                handle.write("\n")
        except Exception:
            logger.exception("Failed to write artifact event `%s`", event_type)


__all__ = ["ArtifactWriter"]
