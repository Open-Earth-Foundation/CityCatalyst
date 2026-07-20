"""Tests for the offline Concept Note Builder funder research pipeline."""

from __future__ import annotations

from contextlib import nullcontext
from datetime import datetime, timezone
import json
from pathlib import Path
from types import SimpleNamespace

import httpx
from openai.lib._pydantic import to_strict_json_schema
from pydantic import ValidationError
import pytest

from app.models.cnb_research import (
    FieldEvidence,
    FinancialAmountResearchResult,
    FunderProfileResearchResult,
    FundingOpportunityResearchAgentDraft,
    FundingOpportunityResearchRequest,
    FundingOpportunityResearchResult,
    FundedProjectActionDraft,
    FundedProjectDraft,
    FundingLinkResearchResult,
)
from app.services import cnb_research_service
from app.services.cnb_research_agent import find_missing_data, run_agent_loop
from app.services.cnb_research_bundle import convert_agent_opportunity, material_paths
from app.services.cnb_research_service import run_funding_opportunity_research
from app.tools.firecrawl import CapturedSource, FirecrawlClient


def build_request(*, max_turns: int = 3) -> FundingOpportunityResearchRequest:
    """Create a valid no-template request for tests."""
    return FundingOpportunityResearchRequest(
        funder_name="Example Funder",
        funder_url="https://funder.example/",
        program_name="Example Program",
        program_url="https://funder.example/program",
        application_template_url=None,
        max_turns=max_turns,
    )


def build_result() -> FundingOpportunityResearchResult:
    """Create a small fully typed model result."""
    return FundingOpportunityResearchResult(
        opportunity=FundingOpportunityResearchAgentDraft(
            funder_name="Example Funder",
            funder_url="https://funder.example/",
            funder_profile=FunderProfileResearchResult(),
            program_name="Example Program",
            program_url="https://funder.example/program",
            live_status="open",
        ),
        evidence=[
            FieldEvidence(
                evidence_ref="evidence-001",
                target_path="opportunity.live_status",
                source_ref="source-002",
                source_location="Status",
                quote_or_summary="The official program page says applications are open.",
            )
        ],
    )


def test_request_accepts_missing_template_and_rejects_zero_turns() -> None:
    """The optional template stays optional while max_turns remains positive."""
    assert build_request().application_template_url is None
    assert build_request().current_filled_object is None

    resumed_manifest = build_request().model_dump(mode="json")
    resumed_manifest["current_filled_object"] = build_result().model_dump(
        mode="json"
    )
    resumed_request = FundingOpportunityResearchRequest.model_validate(
        resumed_manifest
    )
    assert resumed_request.current_filled_object == build_result()

    with pytest.raises(ValidationError):
        build_request(max_turns=0)


def test_firecrawl_client_searches_extracts_and_writes_snapshots(tmp_path) -> None:
    """Firecrawl responses become compact search leads and local Markdown sources."""
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/search"):
            payload = json.loads(request.content)
            assert payload["includeDomains"] == ["example.gov"]
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "data": {
                        "web": [
                            {
                                "title": "Official program",
                                "url": "https://example.gov/program",
                                "description": "Program details",
                            }
                        ]
                    },
                },
            )
        return httpx.Response(
            200,
            json={
                "success": True,
                "data": {
                    "markdown": "# Official program\n\nMaximum award: $50,000.",
                    "json": {"maximum_award": 50000},
                    "links": ["https://example.gov/program/rfp.pdf"],
                    "metadata": {
                        "title": "Official program",
                        "sourceURL": "https://example.gov/program",
                    },
                },
            },
        )

    http_client = httpx.Client(
        transport=httpx.MockTransport(handler),
        base_url="https://api.firecrawl.dev",
    )
    client = FirecrawlClient(
        api_key="test-key",
        run_directory=tmp_path,
        http_client=http_client,
    )

    search = client.search(
        query="official program",
        limit=5,
        include_domains=["https://example.gov/programs"],
    )
    extracted = client.extract(
        url="https://example.gov/program",
        extraction_prompt="Extract the maximum award.",
    )

    assert len(search["results"]) == 1
    assert extracted["extracted"] == {"maximum_award": 50000}
    assert extracted["source_ref"] == "source-001"
    snapshot = tmp_path / "sources" / "source-001.md"
    assert snapshot.exists()
    assert "Maximum award: $50,000" in snapshot.read_text(encoding="utf-8")
    assert len(client.captured_sources) == 1


def test_model_output_schema_avoids_unsupported_strict_json_features() -> None:
    """Keep the pinned OpenAI strict schema free of formats and regex patterns."""
    schema = to_strict_json_schema(FundingOpportunityResearchResult)

    def keys(value: object):
        """Yield every key in a nested JSON-schema value."""
        if isinstance(value, dict):
            for key, child in value.items():
                yield key
                yield from keys(child)
        elif isinstance(value, list):
            for child in value:
                yield from keys(child)

    schema_keys = set(keys(schema))
    assert "format" not in schema_keys
    assert "pattern" not in schema_keys


def test_financial_amount_requires_explicit_meaning() -> None:
    """Monetary facts distinguish assistance from downstream financing."""
    amount = FinancialAmountResearchResult(
        amount_ref="amount-001",
        project_ref="project-001",
        action_ref=None,
        program_name="Example Program",
        amount=125000,
        currency="USD",
        amount_kind="individual_technical_assistance",
        fiscal_year="FY2026",
        calendar_year=2026,
        status="approved",
        description="Technical assistance approved for project preparation.",
    )

    assert amount.amount_kind == "individual_technical_assistance"
    with pytest.raises(ValidationError):
        FinancialAmountResearchResult(
            **{
                **amount.model_dump(),
                "amount_kind": "unspecified_money",
            }
        )


def test_missing_data_allows_multinational_funder_country_to_remain_null() -> None:
    """Coverage does not equate an institution's headquarters with its country."""
    missing = find_missing_data(build_result(), request=build_request())

    assert not any("funder_country" in item for item in missing)


def test_material_paths_use_each_record_own_reference() -> None:
    """Evidence paths do not use a foreign project ref as a child identity."""
    base = build_result()
    opportunity = base.opportunity.model_copy(
        update={
            "funded_projects": [
                FundedProjectDraft(project_ref="project-001", title="Project")
            ],
            "funded_project_actions": [
                FundedProjectActionDraft(
                    action_ref="action-001",
                    project_ref="project-001",
                    description="Prepare the project.",
                )
            ],
            "funding_links": [
                FundingLinkResearchResult(
                    funding_link_ref="link-001",
                    project_ref="project-001",
                    action_ref="action-001",
                    program_name="Example Program",
                    status="completed",
                )
            ],
            "financial_amounts": [
                FinancialAmountResearchResult(
                    amount_ref="amount-001",
                    project_ref="project-001",
                    action_ref="action-001",
                    program_name="Example Program",
                    amount=125000,
                    currency="USD",
                    amount_kind="individual_technical_assistance",
                    status="approved",
                    description="Project-preparation assistance.",
                )
            ],
        }
    )
    result = base.model_copy(update={"opportunity": opportunity})

    paths = set(material_paths(convert_agent_opportunity(result)))

    assert "opportunity.funded_project_actions[action-001].description" in paths
    assert "opportunity.funding_links[link-001].status" in paths
    assert "opportunity.financial_amounts[amount-001].amount_kind" in paths


def test_service_writes_pending_review_artifacts_on_final_turn(
    tmp_path,
    monkeypatch,
) -> None:
    """A one-turn run uses seed scrapes and still emits a valid partial bundle."""
    parsed_result = build_result()

    class FakeResponses:
        """Record the final Responses API request and return parsed output."""

        def __init__(self) -> None:
            self.calls: list[dict[str, object]] = []

        def parse(self, **kwargs):
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

        def scrape(self, *, url: str):
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
    monkeypatch.setattr(
        cnb_research_service,
        "start_run",
        lambda **_kwargs: nullcontext(fake_mlflow_run),
    )
    logged_metrics: list[dict[str, float | int]] = []
    monkeypatch.setattr(
        cnb_research_service,
        "log_metrics",
        lambda metrics: logged_metrics.append(metrics),
    )
    monkeypatch.setattr(
        cnb_research_service,
        "log_json_artifact",
        lambda *_args, **_kwargs: None,
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

    assert bundle.review.status == "pending_review"
    assert bundle.opportunity.program_name == "Example Program"
    assert len(bundle.sources) == 2
    assert (run_directory / "request.json").exists()
    assert (run_directory / "research_bundle.json").exists()
    assert (run_directory / "run_metadata.json").exists()
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


def test_agent_reopens_an_incomplete_structured_checkpoint_for_next_turn() -> None:
    """An early partial object is followed by missing-data and turn context."""
    parsed_result = build_result()

    class FakeResponses:
        def __init__(self) -> None:
            self.calls: list[dict[str, object]] = []

        def parse(self, **kwargs):
            self.calls.append(kwargs)
            return SimpleNamespace(
                id=f"response-{len(self.calls):03d}",
                output=[],
                output_parsed=parsed_result,
            )

    client = SimpleNamespace(responses=FakeResponses())
    trace = []
    outcome = run_agent_loop(
        request=build_request(max_turns=2),
        seed_sources=[],
        firecrawl=SimpleNamespace(),
        trace=trace,
        openai_client=client,
        model_name="gpt-5.6-terra",
        reasoning_effort="medium",
        prompt="Research prompt",
    )

    assert outcome.turns_used == 2
    assert outcome.termination_reason == "turn_limit"
    assert len(client.responses.calls) == 2
    assert "tools" in client.responses.calls[0]
    assert "tools" not in client.responses.calls[1]
    second_input = client.responses.calls[1]["input"]
    assert isinstance(second_input, list)
    progress_message = second_input[-1]["content"]
    assert "<current_filled_object>" in progress_message
    assert "<missing_data>" in progress_message
    assert "turns_remaining_after_this: 0" in progress_message
    assert "<final_gap_audit>" in progress_message
