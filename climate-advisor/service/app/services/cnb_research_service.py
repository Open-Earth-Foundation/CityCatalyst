"""Orchestrate one offline, source-grounded CNB funding research run."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import logging
from pathlib import Path
import time
from uuid import uuid4

from openai import OpenAI

from app.config import Settings, get_settings
from app.models.cnb_research import (
    AgentTurn,
    FundingOpportunityResearchBundle,
    FundingOpportunityResearchRequest,
    ResearchGap,
    ResearchRunMetadata,
)
from app.services.cnb_research_agent import AgentLoopOutcome, run_agent_loop
from app.services.cnb_research_agent import scrape_seed_sources
from app.services.cnb_research_artifacts import (
    render_review,
    write_research_artifacts,
)
from app.services.cnb_research_bundle import build_research_bundle
from app.services.openrouter_client import build_openrouter_client_options
from app.tools.firecrawl import FirecrawlClient
from app.utils.mlflow_logging import (
    climate_advisor_experiment_name,
    log_directory_artifacts,
    log_json_artifact,
    log_metrics,
    log_text_artifact,
    set_span_outputs,
    start_run,
    start_trace_span,
    update_current_trace_context,
)

logger = logging.getLogger(__name__)
PIPELINE_VERSION = "2.0"


def run_funding_opportunity_research(
    request: FundingOpportunityResearchRequest,
    *,
    output_root: Path,
    openai_client: OpenAI | None = None,
) -> FundingOpportunityResearchBundle:
    """Run one bounded research workflow and write its local review artifacts."""
    # Prepare validated configuration, run identity, and reproducibility metadata.
    settings = get_settings()
    validate_credentials(settings)

    run_id = str(uuid4())
    run_directory = output_root / run_id
    run_directory.mkdir(parents=True, exist_ok=False)

    model_config = settings.llm.models.funding_research
    prompt = settings.llm.prompts.get_prompt("cnb_funding_opportunity_research")
    prompt_sha256 = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
    started_at = datetime.now(timezone.utc)
    started_clock = time.monotonic()

    # Create the OpenRouter client once and track whether this function owns it.
    owns_openai_client = openai_client is None
    if openai_client is None:
        client_options = build_openrouter_client_options(
            settings,
            missing_api_key_message=(
                "OpenRouter API key (OPENROUTER_API_KEY) must be set"
            ),
        )
        research_client = OpenAI(**client_options.kwargs)
    else:
        research_client = openai_client
    firecrawl: FirecrawlClient | None = None

    try:
        # Record the full workflow under one best-effort observability run.
        with start_run(
            run_name=f"cnb-funding-research-{run_id}",
            experiment_name=climate_advisor_experiment_name(),
            tags={
                "module": "concept_note_builder",
                "workflow": "cnb_funding_opportunity_research",
                "run_id": run_id,
                "review_status": "pending_review",
            },
            params={
                "pipeline_version": PIPELINE_VERSION,
                "model_name": model_config.name,
                "reasoning_effort": model_config.reasoning_effort,
                "prompt_sha256": prompt_sha256,
                "max_turns": request.max_turns,
                "funder_name": request.funder_name,
                "program_name": request.program_name,
            },
        ) as mlflow_run:
            with start_trace_span(
                name="cnb_funding_opportunity_research",
                span_type="CHAIN",
                inputs={
                    "run_id": run_id,
                    "funder_name": request.funder_name,
                    "program_name": request.program_name,
                    "max_turns": request.max_turns,
                },
            ) as workflow_span:
                update_current_trace_context(
                    session_id=run_id,
                    client_request_id=run_id,
                    tags={
                        "workflow": "cnb_funding_opportunity_research",
                        "trace_category": "cnb_funding_research",
                    },
                    metadata={"run_id": run_id},
                )
                firecrawl_config = settings.llm.tools.firecrawl
                firecrawl = FirecrawlClient(
                    api_key=settings.firecrawl_api_key,
                    run_directory=run_directory,
                    base_url=firecrawl_config.base_url,
                    timeout_seconds=firecrawl_config.timeout_seconds,
                )
                trace: list[AgentTurn] = []
                bootstrap_gaps: list[ResearchGap] = []

                # Capture authoritative seeds before allowing model-selected discovery.
                seed_sources = scrape_seed_sources(
                    request=request,
                    firecrawl=firecrawl,
                    trace=trace,
                    gaps=bootstrap_gaps,
                )

                # Execute the bounded model/tool loop using the configured prompt contract.
                outcome = run_agent_loop(
                    request=request,
                    seed_sources=seed_sources,
                    firecrawl=firecrawl,
                    trace=trace,
                    openai_client=research_client,
                    model_name=model_config.name,
                    reasoning_effort=model_config.reasoning_effort,
                    prompt=prompt,
                )

                # Assemble provenance, persist review artifacts, and emit run metrics.
                run_metadata = build_run_metadata(
                    request=request,
                    outcome=outcome,
                    model_name=model_config.name,
                    reasoning_effort=model_config.reasoning_effort,
                    prompt_sha256=prompt_sha256,
                    started_at=started_at,
                    duration_seconds=time.monotonic() - started_clock,
                    mlflow_run=mlflow_run,
                )
                bundle = build_research_bundle(
                    run_id=run_id,
                    run_metadata=run_metadata,
                    request=request,
                    result=outcome.result,
                    captured_sources=firecrawl.captured_sources,
                    trace=trace,
                    bootstrap_gaps=bootstrap_gaps,
                )
                write_research_artifacts(run_directory=run_directory, bundle=bundle)
                log_run_artifacts(bundle, run_directory=run_directory)
                set_span_outputs(
                    workflow_span,
                    {
                        "run_id": run_id,
                        "turns_used": run_metadata.turns_used,
                        "termination_reason": run_metadata.termination_reason,
                        "sources": len(bundle.sources),
                        "evidence_records": len(bundle.evidence),
                        "gaps": len(bundle.gaps),
                        "review_status": bundle.review.status,
                    },
                )
                logger.info(
                    "Completed CNB research run %s in %.2fs with %s turns (%s)",
                    run_id,
                    run_metadata.duration_seconds,
                    run_metadata.turns_used,
                    run_metadata.termination_reason,
                )
                return bundle
    finally:
        # Close only provider clients owned by this workflow.
        if firecrawl is not None:
            firecrawl.close()
        if owns_openai_client:
            research_client.close()


def validate_credentials(settings: Settings) -> None:
    """Fail before creating clients when either required provider key is absent."""
    if not settings.openrouter_api_key:
        raise ValueError("OPENROUTER_API_KEY must be set")
    if not settings.firecrawl_api_key:
        raise ValueError("FIRECRAWL_API_KEY must be set")


def build_run_metadata(
    *,
    request: FundingOpportunityResearchRequest,
    outcome: AgentLoopOutcome,
    model_name: str,
    reasoning_effort: str,
    prompt_sha256: str,
    started_at: datetime,
    duration_seconds: float,
    mlflow_run: object | None,
) -> ResearchRunMetadata:
    """Create reproducibility metadata from code-owned runtime facts."""
    run_info = getattr(mlflow_run, "info", None)
    mlflow_run_id = getattr(run_info, "run_id", None)
    return ResearchRunMetadata(
        pipeline_version=PIPELINE_VERSION,
        model_name=model_name,
        reasoning_effort=reasoning_effort,
        prompt_sha256=prompt_sha256,
        started_at=started_at,
        completed_at=datetime.now(timezone.utc),
        duration_seconds=duration_seconds,
        max_turns=request.max_turns,
        turns_used=outcome.turns_used,
        termination_reason=outcome.termination_reason,
        mlflow_run_id=str(mlflow_run_id) if mlflow_run_id else None,
    )


def log_run_artifacts(
    bundle: FundingOpportunityResearchBundle,
    *,
    run_directory: Path,
) -> None:
    """Record the review bundle and trace in the active best-effort MLflow run."""
    funded_projects = [
        record for record in bundle.funding_records if not record.is_opportunity
    ]
    log_metrics(
        {
            "duration_seconds": bundle.run_metadata.duration_seconds,
            "turns_used": bundle.run_metadata.turns_used,
            "sources": len(bundle.sources),
            "evidence_records": len(bundle.evidence),
            "funding_records": len(bundle.funding_records),
            "criteria": len(bundle.funder_criteria),
            "templates": len(bundle.funder_templates),
            "funded_projects": len(funded_projects),
            "funded_project_awards": sum(
                record.award_amount is not None for record in funded_projects
            ),
            "gaps": len(bundle.gaps),
            "conflicts": len(bundle.conflicts),
            "trace_entries": len(bundle.agent_trace),
        }
    )
    log_json_artifact("research_bundle.json", bundle.model_dump(mode="json"))
    log_text_artifact("review.md", render_review(bundle))
    log_text_artifact(
        "agent_trace.jsonl",
        "".join(f"{turn.model_dump_json()}\n" for turn in bundle.agent_trace),
    )
    log_directory_artifacts(run_directory / "sources", artifact_path="sources")
