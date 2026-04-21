"""Per-request artifact writer for summary JSONL and step detail JSON files."""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Mapping
from uuid import UUID


logger = logging.getLogger(__name__)
ARTIFACT_SCHEMA_VERSION = "1.0"
RESERVED_MANIFEST_KEYS = {"schema_version", "request_id", "generated_files"}


def _artifacts_enabled() -> bool:
    """Return True when ARTIFACT_LOG_JSONL env var is set to a truthy value."""
    value = os.getenv("ARTIFACT_LOG_JSONL", "true").strip().lower()
    return value in {"1", "true", "yes", "on"}


class ArtifactWriter:
    """Best-effort artifact writer for one request."""

    def __init__(self, request_id: UUID) -> None:
        self.request_id = request_id
        self.enabled = _artifacts_enabled()
        log_dir = Path(os.getenv("LOG_DIR", "logs"))
        created_at_utc = datetime.now(UTC)
        timestamp_prefix = created_at_utc.strftime("%Y%m%d-%H%M%S")
        # Group all artifacts for one run under a single folder.
        self._run_dir = (
            log_dir
            / "requests"
            / f"{timestamp_prefix}Z_{request_id}"
        )
        self.path = self._run_dir / "summary.jsonl"
        self._event_counter = 0
        self._written_files: set[str] = set()

    def _next_event_counter(self) -> int:
        """Return a monotonically increasing per-request event counter."""
        self._event_counter += 1
        return self._event_counter

    def _safe_file_stem(self, name: str) -> str:
        """Convert event/step name to a filename-safe stem."""
        lowered = name.strip().lower()
        sanitized = lowered.replace(".", "_").replace(" ", "_").replace("/", "_")
        return sanitized or "step"

    def _register_written_file(self, file_path: Path) -> None:
        """Track one run-relative file path for manifest generation."""
        try:
            relative_path = file_path.relative_to(self._run_dir).as_posix()
        except ValueError:
            relative_path = file_path.as_posix()
        self._written_files.add(relative_path)

    def write_event(self, event_type: str, payload: Mapping[str, object]) -> int | None:
        """Append one summary event and return its event index."""
        if not self.enabled:
            return None

        event_index = self._next_event_counter()
        event = {
            "timestamp": datetime.now(UTC).isoformat(),
            "request_id": str(self.request_id),
            "event_index": event_index,
            "event_type": event_type,
            "payload": dict(payload),
        }
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(event, ensure_ascii=True))
                handle.write("\n")
            self._register_written_file(self.path)
        except Exception:
            logger.exception("Failed to write artifact event `%s`", event_type)
        return event_index

    def write_step_detail(
        self,
        step_name: str,
        payload: Mapping[str, object],
        *,
        event_index: int | None = None,
        event_type: str | None = None,
    ) -> None:
        """Write detail for one pipeline step, optionally linked to summary event."""
        if not self.enabled:
            return

        if event_index is None:
            event_index = self._next_event_counter()
        else:
            self._event_counter = max(self._event_counter, event_index)

        detail: dict[str, object] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "request_id": str(self.request_id),
            "event_index": event_index,
            "step_name": step_name,
        }
        if event_type is not None:
            detail["event_type"] = event_type
        detail["payload"] = dict(payload)
        safe_step_name = self._safe_file_stem(step_name)
        detail_path = self._run_dir / f"{event_index:03d}_{safe_step_name}.json"
        try:
            detail_path.parent.mkdir(parents=True, exist_ok=True)
            detail_path.write_text(
                json.dumps(detail, ensure_ascii=True, indent=2),
                encoding="utf-8",
            )
            self._register_written_file(detail_path)
        except Exception:
            logger.exception("Failed to write step detail `%s`", step_name)

    def write_run_file(self, filename: str, payload: Mapping[str, object]) -> Path | None:
        """Write one JSON artifact file directly inside the run folder."""
        if not self.enabled:
            return None

        output_path = self._run_dir / filename
        try:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(
                json.dumps(dict(payload), ensure_ascii=True, indent=2),
                encoding="utf-8",
            )
            self._register_written_file(output_path)
            return output_path
        except Exception:
            logger.exception("Failed to write run file `%s`", filename)
            return None

    def write_run_text_file(self, filename: str, content: str) -> Path | None:
        """Write one plain-text artifact file directly inside the run folder."""
        if not self.enabled:
            return None

        output_path = self._run_dir / filename
        try:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(content, encoding="utf-8")
            self._register_written_file(output_path)
            return output_path
        except Exception:
            logger.exception("Failed to write run text file `%s`", filename)
            return None

    def write_manifest(self, payload: Mapping[str, object]) -> Path | None:
        """Write run-level manifest describing generated artifact files."""
        if not self.enabled:
            return None

        manifest_path = self._run_dir / "manifest.json"
        safe_payload = {
            key: value
            for key, value in payload.items()
            if key not in RESERVED_MANIFEST_KEYS
        }
        manifest = {
            **safe_payload,
            "schema_version": ARTIFACT_SCHEMA_VERSION,
            "request_id": str(self.request_id),
            "generated_files": sorted(self._written_files),
        }
        try:
            manifest_path.parent.mkdir(parents=True, exist_ok=True)
            manifest_path.write_text(
                json.dumps(manifest, ensure_ascii=True, indent=2),
                encoding="utf-8",
            )
            self._register_written_file(manifest_path)
            return manifest_path
        except Exception:
            logger.exception("Failed to write run manifest")
            return None
