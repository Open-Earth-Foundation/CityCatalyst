"""Tests for CNB funder research service orchestration and artifacts."""

import json
from contextlib import nullcontext
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

from app.services.cnb import research_service
from app.services.cnb.research_prompt import model_research_state
from app.services.cnb.research_service import run_funding_opportunity_research
from app.tools.firecrawl import CapturedSource
from tests.cnb.helpers import RecordingResponses, build_request, build_result


class FakeFirecrawl:
    """Capture the two deterministic seed URLs without network calls."""

    def __init__(self, *, run_directory: Path, **_kwargs) -> None:
        self.run_directory = run_directory
        self.captured_sources: list[CapturedSource] = []

    def scrape(self, *, url: str) -> dict[str, object]:
        source_ref = f"source-{len(self.captured_sources) + 1:03d}"
        relative_path = f"sources/{source_ref}.md"
        (self.run_directory / "sources").mkdir(parents=True, exist_ok=True)
        (self.run_directory / relative_path).write_text(
            f"# Seed\n\n{url}",
            encoding="utf-8",
        )
        self.captured_sources.append(
            CapturedSource(
                source_ref=source_ref,
                url=url,
                title="Seed",
                content_hash="hash",
                fetched_at=datetime.now(timezone.utc),
                local_snapshot_path=relative_path,
            )
        )
        return {
            "source_ref": source_ref,
            "url": url,
            "title": "Seed",
            "markdown": "# Seed",
            "links": [],
            "local_snapshot_path": relative_path,
        }

    def close(self) -> None:
        return None


def test_service_writes_pending_review_artifacts_on_final_turn(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """A one-turn run uses seed scrapes and still emits a valid partial bundle."""
    fake_settings = SimpleNamespace(
        openrouter_api_key="test-openrouter-key",
        firecrawl_api_key="test-firecrawl-key",
        llm=SimpleNamespace(
            api=SimpleNamespace(
                openrouter=SimpleNamespace(base_url="https://openrouter.ai/api/v1")
            ),
            models=SimpleNamespace(
                funding_research=SimpleNamespace(
                    name="openai/gpt-5.6-sol",
                    reasoning_effort="medium",
                )
            ),
            prompts=SimpleNamespace(get_prompt=lambda _name: "Research prompt"),
            tools=SimpleNamespace(
                firecrawl=SimpleNamespace(
                    base_url="https://api.firecrawl.dev/v2",
                    timeout_seconds=120,
                )
            ),
        ),
    )
    monkeypatch.setattr(research_service, "get_settings", lambda: fake_settings)
    monkeypatch.setattr(research_service, "FirecrawlClient", FakeFirecrawl)
    # MLflow and tracing are observability only; keep them offline.
    mlflow_run = SimpleNamespace(info=SimpleNamespace(run_id="mlflow-001"))
    monkeypatch.setattr(
        research_service, "start_run", lambda **_kwargs: nullcontext(mlflow_run)
    )
    monkeypatch.setattr(
        research_service,
        "workflow_trace",
        lambda **_kwargs: nullcontext(SimpleNamespace()),
    )
    for name in (
        "set_span_outputs",
        "update_current_trace_context",
        "log_metrics",
        "log_json_artifact",
        "log_text_artifact",
        "log_directory_artifacts",
    ):
        monkeypatch.setattr(research_service, name, lambda *_args, **_kwargs: None)
    responses = RecordingResponses(
        model_research_state(
            build_result(),
            [SimpleNamespace(source_ref="source-002", url=str(build_request().program_url))],
        )
    )

    bundle = run_funding_opportunity_research(
        build_request(max_turns=1),
        output_root=tmp_path,
        openai_client=SimpleNamespace(responses=responses),
    )
    run_directory = tmp_path / bundle.run_id

    # The partial bundle is stored for review.
    assert bundle.schema_version == "3.0"
    assert bundle.review.status == "pending_review"
    assert bundle.funder.name == "Example Funder"
    assert bundle.funding_opportunities[0].name == "Example Program"
    assert bundle.funded_projects == []
    assert len(bundle.sources) == 2
    assert sorted(path.name for path in run_directory.glob("*.json")) == [
        "research_bundle.json"
    ]
    saved_bundle = json.loads(
        (run_directory / "research_bundle.json").read_text(encoding="utf-8")
    )
    assert saved_bundle["request"]["program_name"] == "Example Program"
    assert (run_directory / "review.md").exists()
    assert (run_directory / "agent_trace.jsonl").exists()
    assert bundle.run_metadata.model_name == "openai/gpt-5.6-sol"
    assert bundle.run_metadata.mlflow_run_id == "mlflow-001"
    assert bundle.run_metadata.prompt_sha256

    # The only turn is the final audit: no tools, the seeded object, open gaps.
    assert "tools" not in responses.calls[0]
    model_input = json.loads(responses.calls[0]["input"])
    assert model_input["current_filled_object"]["funding_opportunities"][0]["name"] == (
        "Example Program"
    )
    assert "current_filled_object" not in model_input["research_request"]
    assert model_input["missing_data"]
    assert model_input["turn_budget"]["final_audit"] is True
