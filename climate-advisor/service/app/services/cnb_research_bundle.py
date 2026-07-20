"""Pure functions for assembling validated CNB research bundles."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date

from pydantic import JsonValue

from app.models.cnb_research import (
    AgentTurn,
    FieldEvidence,
    FinancialAmountDraft,
    FunderCriterionDraft,
    FunderProfileDraft,
    FunderTemplateDraft,
    FundingLinkDraft,
    FundingOpportunityResearchBundle,
    FundingOpportunityResearchDraft,
    FundingOpportunityResearchRequest,
    FundingOpportunityResearchResult,
    FundingPipelineEntryDraft,
    ResearchConflict,
    ResearchGap,
    ResearchRunMetadata,
    ReviewState,
    SourceDocumentAssessment,
    SourceDocumentDraft,
)
from app.tools.firecrawl import CapturedSource


def build_research_bundle(
    *,
    run_id: str,
    run_metadata: ResearchRunMetadata,
    request: FundingOpportunityResearchRequest,
    result: FundingOpportunityResearchResult,
    captured_sources: list[CapturedSource],
    trace: list[AgentTurn],
    bootstrap_gaps: list[ResearchGap],
) -> FundingOpportunityResearchBundle:
    """Assemble the code-owned bundle envelope and enforce provenance rules."""
    opportunity = convert_agent_opportunity(result)
    conflicts = [
        ResearchConflict(
            target_path=item.target_path,
            candidate_values=item.candidate_values,
            evidence_refs=item.evidence_refs,
            explanation=item.explanation,
        )
        for item in result.conflicts
    ]
    opportunity = preserve_authoritative_seeds(
        request=request,
        opportunity=opportunity,
        conflicts=conflicts,
    )
    sources, source_gaps = build_sources(
        captured_sources=captured_sources,
        assessments=result.source_assessments,
    )

    source_refs = {source.source_ref for source in sources}
    evidence: list[FieldEvidence] = []
    evidence_gaps: list[ResearchGap] = []
    for item in result.evidence:
        if item.source_ref in source_refs:
            evidence.append(item)
            continue
        evidence_gaps.append(
            ResearchGap(
                target_path=item.target_path,
                reason=(
                    f"Evidence {item.evidence_ref} referenced unknown source "
                    f"{item.source_ref}."
                ),
            )
        )

    gaps = deduplicate_gaps(
        [*bootstrap_gaps, *source_gaps, *evidence_gaps, *result.gaps]
    )
    gaps = add_evidence_coverage_gaps(
        opportunity=opportunity,
        evidence=evidence,
        gaps=gaps,
    )
    return FundingOpportunityResearchBundle(
        schema_version="1.2",
        run_id=run_id,
        run_metadata=run_metadata,
        request=request,
        opportunity=opportunity,
        sources=sources,
        evidence=evidence,
        gaps=gaps,
        conflicts=conflicts,
        agent_trace=trace,
        review=ReviewState(status="pending_review"),
    )


def convert_agent_opportunity(
    result: FundingOpportunityResearchResult,
) -> FundingOpportunityResearchDraft:
    """Convert strict model types into the richer architecture bundle types."""
    agent_opportunity = result.opportunity
    opportunity_data = agent_opportunity.model_dump(
        exclude={
            "funder_profile",
            "criteria",
            "application_template",
            "funding_links",
            "financial_amounts",
            "pipeline_entries",
        }
    )
    profile = FunderProfileDraft(
        stated={fact.key: fact.value for fact in agent_opportunity.funder_profile.stated},
        derived={fact.key: fact.value for fact in agent_opportunity.funder_profile.derived},
    )
    criteria = [
        FunderCriterionDraft(**criterion.model_dump())
        for criterion in agent_opportunity.criteria
    ]
    template = (
        FunderTemplateDraft(**agent_opportunity.application_template.model_dump())
        if agent_opportunity.application_template is not None
        else None
    )
    funding_links = [
        FundingLinkDraft(**item.model_dump()) for item in agent_opportunity.funding_links
    ]
    financial_amounts = [
        FinancialAmountDraft(**item.model_dump())
        for item in agent_opportunity.financial_amounts
    ]
    pipeline_entries = [
        FundingPipelineEntryDraft(**item.model_dump())
        for item in agent_opportunity.pipeline_entries
    ]
    return FundingOpportunityResearchDraft(
        **opportunity_data,
        funder_profile=profile,
        criteria=criteria,
        application_template=template,
        funding_links=funding_links,
        financial_amounts=financial_amounts,
        pipeline_entries=pipeline_entries,
    )


def preserve_authoritative_seeds(
    *,
    request: FundingOpportunityResearchRequest,
    opportunity: FundingOpportunityResearchDraft,
    conflicts: list[ResearchConflict],
) -> FundingOpportunityResearchDraft:
    """Restore request seeds and retain model-proposed replacements as conflicts."""
    checks = {
        "opportunity.funder_name": (opportunity.funder_name, request.funder_name),
        "opportunity.funder_url": (
            str(opportunity.funder_url),
            str(request.funder_url),
        ),
        "opportunity.program_name": (opportunity.program_name, request.program_name),
        "opportunity.program_url": (
            str(opportunity.program_url),
            str(request.program_url),
        ),
    }
    for target_path, (candidate, seed) in checks.items():
        if candidate == seed:
            continue
        conflicts.append(
            ResearchConflict(
                target_path=target_path,
                candidate_values=[seed, candidate],
                evidence_refs=[],
                explanation=(
                    "The model proposed a value different from the authoritative "
                    "request seed. The seed was preserved for review."
                ),
            )
        )

    return opportunity.model_copy(
        update={
            "funder_name": request.funder_name,
            "funder_url": request.funder_url,
            "program_name": request.program_name,
            "program_url": request.program_url,
        }
    )


def build_sources(
    *,
    captured_sources: list[CapturedSource],
    assessments: list[SourceDocumentAssessment],
) -> tuple[list[SourceDocumentDraft], list[ResearchGap]]:
    """Merge model classifications with code-derived source provenance."""
    assessment_by_ref = {item.source_ref: item for item in assessments}
    captured_refs = {item.source_ref for item in captured_sources}
    gaps = [
        ResearchGap(
            target_path=f"sources[{assessment.source_ref}]",
            reason="The model assessed a source that was not captured by Firecrawl.",
        )
        for assessment in assessments
        if assessment.source_ref not in captured_refs
    ]

    sources: list[SourceDocumentDraft] = []
    for captured in captured_sources:
        assessment = assessment_by_ref.get(captured.source_ref)
        publication_date = parse_publication_date(
            source_ref=captured.source_ref,
            assessment=assessment,
            gaps=gaps,
        )
        sources.append(
            SourceDocumentDraft(
                source_ref=captured.source_ref,
                source_type=assessment.source_type if assessment else "web_page",
                url=captured.url,
                title=captured.title,
                publication_date=publication_date,
                license_status=assessment.license_status if assessment else None,
                content_hash=captured.content_hash,
                fetched_at=captured.fetched_at,
                local_snapshot_path=captured.local_snapshot_path,
            )
        )
    return sources, gaps


def parse_publication_date(
    *,
    source_ref: str,
    assessment: SourceDocumentAssessment | None,
    gaps: list[ResearchGap],
) -> date | None:
    """Parse model-facing ISO dates without rejecting the full research result."""
    if assessment is None or assessment.publication_date is None:
        return None
    try:
        return date.fromisoformat(assessment.publication_date)
    except ValueError:
        gaps.append(
            ResearchGap(
                target_path=f"sources[{source_ref}].publication_date",
                reason=(
                    "The model returned a publication date that was not an ISO "
                    "calendar date."
                ),
            )
        )
        return None


def add_evidence_coverage_gaps(
    *,
    opportunity: FundingOpportunityResearchDraft,
    evidence: list[FieldEvidence],
    gaps: list[ResearchGap],
) -> list[ResearchGap]:
    """Flag populated material fields that do not have source evidence."""
    evidence_paths = {item.target_path for item in evidence}
    existing_gap_paths = {item.target_path for item in gaps}
    additions = [
        ResearchGap(
            target_path=path,
            reason="The populated value has no retained field-evidence record.",
        )
        for path in material_paths(opportunity)
        if path not in existing_gap_paths and not evidence_covers(path, evidence_paths)
    ]
    return deduplicate_gaps([*gaps, *additions])


def evidence_covers(path: str, evidence_paths: set[str]) -> bool:
    """Allow evidence on a record or collection path to cover its child leaves."""
    return any(
        path == evidence_path
        or path.startswith(f"{evidence_path}.")
        or path.startswith(f"{evidence_path}[")
        for evidence_path in evidence_paths
    )


def material_paths(
    opportunity: FundingOpportunityResearchDraft,
) -> Iterable[str]:
    """Yield populated non-seed leaf paths using stable temporary references."""
    seed_paths = {
        "opportunity.funder_name",
        "opportunity.funder_url",
        "opportunity.program_name",
        "opportunity.program_url",
    }
    identity_fields = (
        "criterion_ref",
        "template_ref",
        "chapter_ref",
        "funding_link_ref",
        "amount_ref",
        "entry_ref",
        "action_ref",
        "project_ref",
    )

    def walk(value: JsonValue, path: str) -> Iterable[str]:
        """Recursively yield evidence paths for populated JSON values."""
        if isinstance(value, dict):
            for key, item in value.items():
                child_path = f"{path}.{key}"
                if key.endswith("_ref") or child_path in seed_paths:
                    continue
                yield from walk(item, child_path)
            return
        if isinstance(value, list):
            if not value:
                return
            if all(not isinstance(item, (dict, list)) for item in value):
                yield path
                return
            for index, item in enumerate(value):
                token = str(index)
                if isinstance(item, dict):
                    for identity_field in identity_fields:
                        identity = item.get(identity_field)
                        if identity:
                            token = str(identity)
                            break
                yield from walk(item, f"{path}[{token}]")
            return
        if value is not None and value != "":
            yield path

    data = opportunity.model_dump(mode="json")
    yield from walk(data, "opportunity")


def deduplicate_gaps(gaps: list[ResearchGap]) -> list[ResearchGap]:
    """Keep the first explanation for each exact target and reason pair."""
    seen: set[tuple[str, str]] = set()
    result: list[ResearchGap] = []
    for gap in gaps:
        key = (gap.target_path, gap.reason)
        if key in seen:
            continue
        seen.add(key)
        result.append(gap)
    return result
