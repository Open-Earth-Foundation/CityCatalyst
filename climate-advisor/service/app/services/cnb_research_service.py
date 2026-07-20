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
from app.tools.firecrawl import FirecrawlClient
from app.utils.mlflow_logging import (
    climate_advisor_experiment_name,
    log_json_artifact,
    log_metrics,
    log_text_artifact,
    start_run,
)

logger = logging.getLogger(__name__)
PIPELINE_VERSION = "1.2"


def run_funding_opportunity_research(
    request: FundingOpportunityResearchRequest,
    *,
    output_root: Path,
    openai_client: OpenAI | None = None,
) -> FundingOpportunityResearchBundle:
    """Run one bounded research workflow and write its local review artifacts."""
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

    openai_config = settings.llm.api.openai
    owns_openai_client = openai_client is None
    research_client = openai_client or OpenAI(
        api_key=settings.openai_api_key,
        base_url=openai_config.base_url,
    )
    firecrawl: FirecrawlClient | None = None

    try:
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
            firecrawl_config = settings.llm.tools.firecrawl
            firecrawl = FirecrawlClient(
                api_key=settings.firecrawl_api_key,
                run_directory=run_directory,
                base_url=firecrawl_config.base_url,
                timeout_seconds=firecrawl_config.timeout_seconds,
            )
            trace: list[AgentTurn] = []
            bootstrap_gaps: list[ResearchGap] = []

            seed_sources = scrape_seed_sources(
                request=request,
                firecrawl=firecrawl,
                trace=trace,
                gaps=bootstrap_gaps,
            )
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
            log_run_artifacts(bundle)
            logger.info(
                "Completed CNB research run %s in %.2fs with %s turns (%s)",
                run_id,
                run_metadata.duration_seconds,
                run_metadata.turns_used,
                run_metadata.termination_reason,
            )
            return bundle
    finally:
        if firecrawl is not None:
            firecrawl.close()
        if owns_openai_client:
            research_client.close()


def validate_credentials(settings: Settings) -> None:
    """Fail before creating clients when either required provider key is absent."""
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY must be set")
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


def log_run_artifacts(bundle: FundingOpportunityResearchBundle) -> None:
    """Record the review bundle and trace in the active best-effort MLflow run."""
    opportunity = bundle.opportunity
    log_metrics(
        {
            "duration_seconds": bundle.run_metadata.duration_seconds,
            "turns_used": bundle.run_metadata.turns_used,
            "sources": len(bundle.sources),
            "evidence_records": len(bundle.evidence),
            "criteria": len(opportunity.criteria),
            "funded_projects": len(opportunity.funded_projects),
            "funded_project_actions": len(opportunity.funded_project_actions),
            "funding_links": len(opportunity.funding_links),
            "financial_amounts": len(opportunity.financial_amounts),
            "gaps": len(bundle.gaps),
            "conflicts": len(bundle.conflicts),
            "trace_entries": len(bundle.agent_trace),
        }
    )
    log_json_artifact("research_bundle.json", bundle.model_dump(mode="json"))
    log_text_artifact("review.md", render_review(bundle))
    log_text_artifact(
        "agent_trace.jsonl",
        "".join(
            f"{turn.model_dump_json()}\n" for turn in bundle.agent_trace
        ),
    )
