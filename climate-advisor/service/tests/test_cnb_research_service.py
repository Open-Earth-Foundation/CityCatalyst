"""Tests for CNB funder research service orchestration and artifacts."""

from contextlib import nullcontext
from datetime import datetime, timezone
import json
from pathlib import Path
from types import SimpleNamespace

from app.services import cnb_research_service
from app.services.cnb_research_service import run_funding_opportunity_research
from app.tools.firecrawl import CapturedSource
from tests.cnb_research_helpers import build_request, build_result


def test_service_writes_pending_review_artifacts_on_final_turn(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """A one-turn run uses seed scrapes and still emits a valid partial bundle."""
    parsed_result = build_result()

    class FakeResponses:
        """Record the final Responses API request and return parsed output."""

        def __init__(self) -> None:
            self.calls: list[dict[str, object]] = []

        def parse(self, **kwargs: object) -> SimpleNamespace:
            self.calls.append(kwargs)
            return SimpleNamespace(
                id="response-001",
                output=[],
                output_parsed=parsed_result,
            )

    class FakeOpenAI:
        """Minimal OpenAI client surface used by the service."""

        def __init__(self) -> None:
            self.responses = FakeResponses()

    class FakeFirecrawl:
        """Capture the two deterministic seed URLs without network calls."""

        def __init__(self, *, run_directory: Path, **_kwargs) -> None:
            self.run_directory = run_directory
            self._captured: list[CapturedSource] = []

        @property
        def captured_sources(self) -> list[CapturedSource]:
            return self._captured

        def scrape(self, *, url: str) -> dict[str, object]:
            source_ref = f"source-{len(self._captured) + 1:03d}"
            relative_path = f"sources/{source_ref}.md"
            (self.run_directory / "sources").mkdir(parents=True, exist_ok=True)
            (self.run_directory / relative_path).write_text(
                f"# Seed\n\n{url}",
                encoding="utf-8",
            )
            self._captured.append(
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

    prompts = SimpleNamespace(get_prompt=lambda _name: "Research prompt")
    fake_settings = SimpleNamespace(
        openai_api_key="test-openai-key",
        firecrawl_api_key="test-firecrawl-key",
        llm=SimpleNamespace(
            api=SimpleNamespace(
                openai=SimpleNamespace(base_url="https://api.openai.com/v1")
            ),
            models=SimpleNamespace(
                funding_research=SimpleNamespace(
                    name="gpt-5.6-terra",
                    reasoning_effort="medium",
                )
            ),
            prompts=prompts,
            tools=SimpleNamespace(
                firecrawl=SimpleNamespace(
                    base_url="https://api.firecrawl.dev/v2",
                    timeout_seconds=120,
                )
            ),
        ),
    )
    monkeypatch.setattr(cnb_research_service, "get_settings", lambda: fake_settings)
    monkeypatch.setattr(
        cnb_research_service,
        "FirecrawlClient",
        FakeFirecrawl,
    )
    fake_mlflow_run = SimpleNamespace(info=SimpleNamespace(run_id="mlflow-001"))
    started_run_kwargs: list[dict[str, object]] = []

    def fake_start_run(**kwargs: object) -> nullcontext[SimpleNamespace]:
        started_run_kwargs.append(kwargs)
        return nullcontext(fake_mlflow_run)

    monkeypatch.setattr(
        cnb_research_service,
        "start_run",
        fake_start_run,
    )
    logged_metrics: list[dict[str, float | int]] = []
    logged_json_artifacts: list[str] = []
    monkeypatch.setattr(
        cnb_research_service,
        "log_metrics",
        lambda metrics: logged_metrics.append(metrics),
    )
    monkeypatch.setattr(
        cnb_research_service,
        "log_json_artifact",
        lambda artifact_file, _payload: logged_json_artifacts.append(artifact_file),
    )
    monkeypatch.setattr(
        cnb_research_service,
        "log_text_artifact",
        lambda *_args, **_kwargs: None,
    )
    fake_openai = FakeOpenAI()
    bundle = run_funding_opportunity_research(
        build_request(max_turns=1),
        output_root=tmp_path,
        openai_client=fake_openai,
    )
    run_directory = tmp_path / bundle.run_id

    assert bundle.schema_version == "1.2"
    assert bundle.run_metadata.pipeline_version == "1.2"
    assert bundle.review.status == "pending_review"
    assert bundle.opportunity.program_name == "Example Program"
    assert len(bundle.sources) == 2
    assert (run_directory / "research_bundle.json").exists()
    assert sorted(path.name for path in run_directory.glob("*.json")) == [
        "research_bundle.json"
    ]
    saved_bundle = json.loads(
        (run_directory / "research_bundle.json").read_text(encoding="utf-8")
    )
    assert saved_bundle["request"]["program_name"] == "Example Program"
    assert saved_bundle["run_metadata"]["model_name"] == "gpt-5.6-terra"
    assert (run_directory / "review.md").exists()
    assert (run_directory / "agent_trace.jsonl").exists()
    assert fake_openai.responses.calls[0]["model"] == "gpt-5.6-terra"
    assert fake_openai.responses.calls[0]["reasoning"] == {"effort": "medium"}
    assert "tools" not in fake_openai.responses.calls[0]
    model_input = json.loads(fake_openai.responses.calls[0]["input"])
    assert model_input["current_filled_object"]["opportunity"]["program_name"] == (
        "Example Program"
    )
    assert "current_filled_object" not in model_input["research_request"]
    assert model_input["missing_data"]
    assert model_input["turn_budget"]["final_audit"] is True
    assert bundle.run_metadata.model_name == "gpt-5.6-terra"
    assert bundle.run_metadata.reasoning_effort == "medium"
    assert bundle.run_metadata.mlflow_run_id == "mlflow-001"
    assert bundle.run_metadata.prompt_sha256
    assert logged_metrics[0]["turns_used"] == 1
    assert logged_json_artifacts == ["research_bundle.json"]
    assert started_run_kwargs[0]["tags"]["module"] == "concept_note_builder"
