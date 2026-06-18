"""Unit tests for request artifact writing."""

from __future__ import annotations

import json
from uuid import uuid4

from app.utils import artifacts as artifacts_module
from app.utils.artifacts import ArtifactWriter


def test_write_manifest_logs_summary_jsonl_without_events_folder(
    monkeypatch, tmp_path
) -> None:
    """MLflow artifact layout should keep the old root-level hierarchy."""
    json_artifacts: list[tuple[str, dict[str, object]]] = []
    text_artifacts: list[tuple[str, str]] = []

    monkeypatch.setenv("LOCAL_ARTIFACTS_ENABLED", "false")
    monkeypatch.setenv("LOG_DIR", str(tmp_path))
    monkeypatch.setattr(
        artifacts_module,
        "log_json_artifact",
        lambda artifact_file, payload: json_artifacts.append((artifact_file, payload)),
    )
    monkeypatch.setattr(
        artifacts_module,
        "log_text_artifact",
        lambda artifact_file, content: text_artifacts.append((artifact_file, content)),
    )

    writer = ArtifactWriter(request_id=uuid4())
    event_index = writer.write_event("fetch_city.completed", {"locode": "CL IQQ"})
    writer.write_step_detail(
        "fetch_city",
        {"locode": "CL IQQ"},
        event_index=event_index,
        event_type="fetch_city.completed",
    )
    writer.write_manifest({"counts": {"cities": 1}})

    assert [artifact_file for artifact_file, _ in text_artifacts] == ["summary.jsonl"]
    assert [artifact_file for artifact_file, _ in json_artifacts] == [
        "001_fetch_city.json",
        "manifest.json",
    ]

    summary_payload = json.loads(text_artifacts[0][1].strip())
    assert summary_payload["event_type"] == "fetch_city.completed"
