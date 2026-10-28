"""Per-request artifact writer using the shared default run-folder hierarchy."""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Mapping
from uuid import UUID

from app.utils.mlflow_logging import log_json_artifact, log_text_artifact


logger = logging.getLogger(__name__)
ARTIFACT_SCHEMA_VERSION = "1.2"
RESERVED_MANIFEST_KEYS = {"schema_version", "request_id", "generated_files"}


def _artifacts_enabled() -> bool:
    """Return whether JSON artifact writing is enabled."""
    return os.getenv("LOCAL_ARTIFACTS_ENABLED", "true").strip().lower() == "true"


class ArtifactWriter:
    """Best-effort artifact writer for one request.

    MLflow and optional local files use the same relative artifact paths so both
    outputs follow one shared default layout rather than separate hierarchies.
    """

    def __init__(
        self,
        request_id: UUID,
        *,
        request_kind: str = "prioritization",
    ) -> None:
        self.request_id = request_id
        self.request_kind = self._safe_file_stem(request_kind)
        self.local_enabled = _artifacts_enabled()
        log_dir = Path(os.getenv("LOG_DIR", "logs"))
        created_at_utc = datetime.now(UTC)
        timestamp_prefix = created_at_utc.strftime("%Y%m%d-%H%M%S")
        # Group all artifacts for one run under a single folder.
        self._run_dir = (
            log_dir
            / "requests"
            / self.request_kind
            / f"{timestamp_prefix}Z_{request_id}"
        )
        self.path = self._run_dir / "summary.jsonl"
        self._event_counter = 0
        self._summary_lines: list[str] = []
        self._written_files: set[str] = set()

    @property
    def run_dir(self) -> Path:
        """Return the request-scoped artifact directory for this writer."""
        return self._run_dir

    def _next_event_counter(self) -> int:
        """Return a monotonically increasing per-request event counter."""
        self._event_counter += 1
        return self._event_counter

    def _safe_file_stem(self, name: str) -> str:
        """Convert event/step name to a filename-safe stem."""
        lowered = name.strip().lower()
        sanitized = lowered.replace(".", "_").replace(" ", "_").replace("/", "_")
        return sanitized or "step"

    def _register_written_file(self, relative_path: str) -> None:
        """Track one run-relative file path for manifest generation."""
        self._written_files.add(relative_path)

    def write_event(self, event_type: str, payload: Mapping[str, object]) -> int | None:
        """Write one summary event and return its event index."""
        event_index = self._next_event_counter()
        event = {
            "timestamp": datetime.now(UTC).isoformat(),
            "request_id": str(self.request_id),
            "request_kind": self.request_kind,
            "event_index": event_index,
            "event_type": event_type,
            "payload": dict(payload),
        }
        summary_line = json.dumps(event, ensure_ascii=False)
        self._summary_lines.append(summary_line)
        self._register_written_file("summary.jsonl")
        if not self.local_enabled:
            return event_index
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as handle:
                handle.write(summary_line)
                handle.write("\n")
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
        """Write detail for one pipeline step, optionally linked to one event."""
        if event_index is None:
            event_index = self._next_event_counter()
        else:
            self._event_counter = max(self._event_counter, event_index)

        detail: dict[str, object] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "request_id": str(self.request_id),
            "request_kind": self.request_kind,
            "event_index": event_index,
            "step_name": step_name,
        }
        if event_type is not None:
            detail["event_type"] = event_type
        detail["payload"] = dict(payload)
        safe_step_name = self._safe_file_stem(step_name)
        detail_filename = f"{event_index:03d}_{safe_step_name}.json"
        log_json_artifact(detail_filename, detail)
        self._register_written_file(detail_filename)
        if not self.local_enabled:
            return
        detail_path = self._run_dir / detail_filename
        try:
            detail_path.parent.mkdir(parents=True, exist_ok=True)
            detail_path.write_text(
                json.dumps(detail, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except Exception:
            logger.exception("Failed to write step detail `%s`", step_name)

    def write_run_file(self, filename: str, payload: Any) -> Path | None:
        """Write one JSON-compatible artifact file directly inside the run folder."""
        log_json_artifact(filename, payload)
        self._register_written_file(filename)
        if not self.local_enabled:
            return None
        output_path = self._run_dir / filename
        try:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            return output_path
        except Exception:
            logger.exception("Failed to write run file `%s`", filename)
            return None

    def write_run_text_file(self, filename: str, content: str) -> Path | None:
        """Write one plain-text artifact file directly inside the run folder."""
        log_text_artifact(filename, content)
        self._register_written_file(filename)
        if not self.local_enabled:
            return None
        output_path = self._run_dir / filename
        try:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(content, encoding="utf-8")
            return output_path
        except Exception:
            logger.exception("Failed to write run text file `%s`", filename)
            return None

    def write_manifest(self, payload: Mapping[str, object]) -> Path | None:
        """Write run-level manifest describing generated artifact files."""
        manifest_path = self._run_dir / "manifest.json"
        if self._summary_lines:
            log_text_artifact("summary.jsonl", "\n".join(self._summary_lines) + "\n")
        safe_payload = {
            key: value
            for key, value in payload.items()
            if key not in RESERVED_MANIFEST_KEYS
        }
        manifest = {
            **safe_payload,
            "schema_version": ARTIFACT_SCHEMA_VERSION,
            "request_id": str(self.request_id),
            "request_kind": self.request_kind,
            "generated_files": sorted(self._written_files),
        }
        log_json_artifact("manifest.json", manifest)
        self._register_written_file("manifest.json")
        if not self.local_enabled:
            return None
        try:
            manifest_path.parent.mkdir(parents=True, exist_ok=True)
            manifest_path.write_text(
                json.dumps(manifest, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            return manifest_path
        except Exception:
            logger.exception("Failed to write run manifest")
            return None
