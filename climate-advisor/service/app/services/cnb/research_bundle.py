"""Pure functions for assembling validated CNB research bundles."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date
import re
import unicodedata

from pydantic import JsonValue

from app.models.cnb.research import (
    AgentTurn,
    FieldEvidence,
    FunderCriterionDraft,
    FunderDraft,
    FundedProjectDraft,
    FunderProfileDraft,
    FunderTemplateDraft,
    FundingOpportunityDraft,
    FundingOpportunityResearchBundle,
    FundingOpportunityResearchRequest,
    FundingOpportunityResearchResult,
    ResearchConflict,
    ResearchGap,
    ResearchRunMetadata,
    ReviewState,
    SourceDocumentAssessment,
    SourceDocumentDraft,
)
from app.tools.firecrawl import CapturedSource


_PROJECT_NAME_TOKEN_PATTERN = re.compile(r"[^\W_]+", re.UNICODE)


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
    # Defensively exclude the input project before creating review-facing rows.
    result = exclude_target_project_self_matches(request=request, result=result)

    # Convert model-facing types into the architecture-shaped review contract.
    (
        funder,
        funding_opportunities,
        funded_projects,
        funder_templates,
        funder_criteria,
    ) = convert_agent_result(result)
    conflicts = [
        ResearchConflict(
            target_path=item.target_path,
            candidate_values=item.candidate_values,
            evidence_refs=item.evidence_refs,
            explanation=item.explanation,
        )
        for item in result.conflicts
    ]
    funder, funding_opportunities = preserve_authoritative_seeds(
        request=request,
        funder=funder,
        funding_opportunities=funding_opportunities,
        conflicts=conflicts,
    )
    sources, source_gaps = build_sources(
        captured_sources=captured_sources,
        assessments=result.source_assessments,
    )

    # Retain only evidence backed by sources captured in this run.
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

    # Remove conflict links to evidence that failed provenance validation.
    conflicts, conflict_evidence_gaps = retain_conflict_evidence(
        conflicts=conflicts,
        evidence=evidence,
    )

    # Merge explicit and derived gaps before creating the pending-review envelope.
    gaps = deduplicate_gaps(
        [
            *bootstrap_gaps,
            *source_gaps,
            *evidence_gaps,
            *conflict_evidence_gaps,
            *result.gaps,
        ]
    )
    gaps = add_evidence_coverage_gaps(
        funder=funder,
        funding_opportunities=funding_opportunities,
        funded_projects=funded_projects,
        funder_templates=funder_templates,
        funder_criteria=funder_criteria,
        evidence=evidence,
        gaps=gaps,
    )
    funding_opportunities = [
        opportunity.model_copy(
            update={
                "known_gaps": scoped_gap_texts(
                    gaps,
                    f"funding_opportunities[{opportunity.funding_opportunity_ref}]",
                )
            }
        )
        for opportunity in funding_opportunities
    ]
    funded_projects = [
        project.model_copy(
            update={
                "known_gaps": scoped_gap_texts(
                    gaps,
                    f"funded_projects[{project.funded_project_ref}]",
                )
            }
        )
        for project in funded_projects
    ]
    return FundingOpportunityResearchBundle(
        schema_version="3.0",
        run_id=run_id,
        run_metadata=run_metadata,
        request=request,
        funder=funder,
        funding_opportunities=funding_opportunities,
        funded_projects=funded_projects,
        funder_templates=funder_templates,
        funder_criteria=funder_criteria,
        sources=sources,
        evidence=evidence,
        gaps=gaps,
        conflicts=conflicts,
        agent_trace=trace,
        review=ReviewState(status="pending_review"),
    )


def exclude_target_project_self_matches(
    *,
    request: FundingOpportunityResearchRequest,
    result: FundingOpportunityResearchResult,
) -> FundingOpportunityResearchResult:
    """Remove funded rows that are exact normalized copies of the input project."""
    target_project = request.target_project
    if target_project is None or target_project.project_name is None:
        return result

    target_name = _normalize_project_name(target_project.project_name)
    if not target_name:
        return result

    removed_project_refs = {
        project.funded_project_ref
        for project in result.funded_projects
        if _normalize_project_name(project.name) == target_name
    }
    if not removed_project_refs:
        return result

    # Remove record-owned evidence and paths before revalidating all references.
    removed_evidence = [
        item
        for item in result.evidence
        if item.funded_project_ref in removed_project_refs
        or _path_references_project(item.target_path, removed_project_refs)
    ]
    removed_evidence_refs = {item.evidence_ref for item in removed_evidence}
    retained_evidence = [
        item
        for item in result.evidence
        if item.evidence_ref not in removed_evidence_refs
    ]
    retained_evidence_refs = {item.evidence_ref for item in retained_evidence}
    removed_only_source_refs = {
        item.source_ref for item in removed_evidence
    } - {item.source_ref for item in retained_evidence}
    result_data = result.model_dump(mode="python")
    result_data["funded_projects"] = [
        project.model_dump(mode="python")
        for project in result.funded_projects
        if project.funded_project_ref not in removed_project_refs
    ]
    result_data["evidence"] = [
        item.model_dump(mode="python") for item in retained_evidence
    ]
    result_data["source_assessments"] = [
        item.model_dump(mode="python")
        for item in result.source_assessments
        if item.source_ref not in removed_only_source_refs
    ]
    result_data["gaps"] = [
        item.model_dump(mode="python")
        for item in result.gaps
        if not _path_references_project(item.target_path, removed_project_refs)
    ]
    result_data["conflicts"] = [
        item.model_copy(
            update={
                "evidence_refs": [
                    evidence_ref
                    for evidence_ref in item.evidence_refs
                    if evidence_ref in retained_evidence_refs
                ]
            }
        ).model_dump(mode="python")
        for item in result.conflicts
        if not _path_references_project(item.target_path, removed_project_refs)
    ]
    return FundingOpportunityResearchResult.model_validate(result_data)


def _normalize_project_name(name: str) -> str:
    """Normalize Unicode, case, punctuation, and whitespace for exact comparison."""
    normalized = unicodedata.normalize("NFKC", name).casefold()
    return " ".join(_PROJECT_NAME_TOKEN_PATTERN.findall(normalized))


def _path_references_project(path: str, project_refs: set[str]) -> bool:
    """Return whether a structured target path belongs to one removed project."""
    for project_ref in project_refs:
        row_path = f"funded_projects[{project_ref}]"
        if (
            path == row_path
            or path.startswith(f"{row_path}.")
            or path.startswith(f"{row_path}[")
        ):
            return True
    return False


def convert_agent_result(
    result: FundingOpportunityResearchResult,
) -> tuple[
    FunderDraft,
    list[FundingOpportunityDraft],
    list[FundedProjectDraft],
    list[FunderTemplateDraft],
    list[FunderCriterionDraft],
]:
    """Convert strict model types into the richer review-facing representations."""
    # Convert list-based profile facts into JSON objects without losing keys.
    profile = FunderProfileDraft(
        stated={fact.key: fact.value for fact in result.funder.profile.stated},
        derived={fact.key: fact.value for fact in result.funder.profile.derived},
    )
    funder = FunderDraft(
        **result.funder.model_dump(exclude={"profile"}),
        profile=profile,
    )

    # Preserve the table boundaries documented by the CNB architecture.
    funding_opportunities = [
        FundingOpportunityDraft(**item.model_dump())
        for item in result.funding_opportunities
    ]
    funded_projects = [
        FundedProjectDraft(**item.model_dump()) for item in result.funded_projects
    ]
    funder_templates = [
        FunderTemplateDraft(**item.model_dump()) for item in result.funder_templates
    ]
    funder_criteria = [
        FunderCriterionDraft(**item.model_dump()) for item in result.funder_criteria
    ]
    return (
        funder,
        funding_opportunities,
        funded_projects,
        funder_templates,
        funder_criteria,
    )


def scoped_gap_texts(gaps: list[ResearchGap], parent_path: str) -> list[str]:
    """Return stable reviewer-facing gaps scoped to one funding entity."""
    return [
        f"{gap.target_path}: {gap.reason}"
        for gap in gaps
        if gap.target_path == parent_path
        or gap.target_path.startswith(f"{parent_path}.")
        or gap.target_path.startswith(f"{parent_path}[")
    ]


def preserve_authoritative_seeds(
    *,
    request: FundingOpportunityResearchRequest,
    funder: FunderDraft,
    funding_opportunities: list[FundingOpportunityDraft],
    conflicts: list[ResearchConflict],
) -> tuple[FunderDraft, list[FundingOpportunityDraft]]:
    """Restore request names and retain model-proposed replacements as conflicts."""
    opportunity = funding_opportunities[0]
    checks = {
        "funder.name": (funder.name, request.funder_name),
        f"funding_opportunities[{opportunity.funding_opportunity_ref}].name": (
            opportunity.name,
            request.program_name,
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

    funder = funder.model_copy(update={"name": request.funder_name})
    funding_opportunities = [
        opportunity.model_copy(update={"name": request.program_name})
        for opportunity in funding_opportunities
    ]
    return funder, funding_opportunities


def retain_conflict_evidence(
    *,
    conflicts: list[ResearchConflict],
    evidence: list[FieldEvidence],
) -> tuple[list[ResearchConflict], list[ResearchGap]]:
    """Remove conflict links to evidence rejected by current-run provenance checks."""
    retained_refs = {item.evidence_ref for item in evidence}
    validated_conflicts: list[ResearchConflict] = []
    gaps: list[ResearchGap] = []
    for conflict in conflicts:
        valid_refs = [
            evidence_ref
            for evidence_ref in conflict.evidence_refs
            if evidence_ref in retained_refs
        ]
        missing_refs = sorted(set(conflict.evidence_refs) - retained_refs)
        if missing_refs:
            gaps.append(
                ResearchGap(
                    target_path=conflict.target_path,
                    reason=(
                        "Conflict evidence was not retained from a verified current-run "
                        f"source: {', '.join(missing_refs)}."
                    ),
                )
            )
        validated_conflicts.append(
            conflict.model_copy(update={"evidence_refs": valid_refs})
        )
    return validated_conflicts, gaps


def build_sources(
    *,
    captured_sources: list[CapturedSource],
    assessments: list[SourceDocumentAssessment],
) -> tuple[list[SourceDocumentDraft], list[ResearchGap]]:
    """Merge model classifications with code-derived source provenance."""
    # Reject assessments for sources that were not captured during this run.
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

    # Combine code-owned capture metadata with optional model classifications.
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
    funder: FunderDraft,
    funding_opportunities: list[FundingOpportunityDraft],
    funded_projects: list[FundedProjectDraft],
    funder_templates: list[FunderTemplateDraft],
    funder_criteria: list[FunderCriterionDraft],
    evidence: list[FieldEvidence],
    gaps: list[ResearchGap],
) -> list[ResearchGap]:
    """Flag populated material fields that do not have source evidence."""
    additions = [
        ResearchGap(
            target_path=path,
            reason="The populated value has no retained field-evidence record.",
        )
        for path in uncovered_material_paths(
            funder=funder,
            funding_opportunities=funding_opportunities,
            funded_projects=funded_projects,
            funder_templates=funder_templates,
            funder_criteria=funder_criteria,
            evidence=evidence,
            gaps=gaps,
        )
    ]
    return deduplicate_gaps([*gaps, *additions])


def uncovered_material_paths(
    *,
    funder: FunderDraft,
    funding_opportunities: list[FundingOpportunityDraft],
    funded_projects: list[FundedProjectDraft],
    funder_templates: list[FunderTemplateDraft],
    funder_criteria: list[FunderCriterionDraft],
    evidence: list[FieldEvidence],
    gaps: list[ResearchGap],
) -> list[str]:
    """Return populated fields that lack retained evidence or an explicit gap."""
    # Apply the same evidence boundary during agent coverage and bundle assembly.
    evidence_paths = {item.target_path for item in evidence}
    existing_gap_paths = {item.target_path for item in gaps}
    return [
        path
        for path in material_paths(
            funder=funder,
            funding_opportunities=funding_opportunities,
            funded_projects=funded_projects,
            funder_templates=funder_templates,
            funder_criteria=funder_criteria,
        )
        if path not in existing_gap_paths and not evidence_covers(path, evidence_paths)
    ]


def evidence_covers(path: str, evidence_paths: set[str]) -> bool:
    """Allow evidence on a record or collection path to cover its child leaves."""
    return any(
        path == evidence_path
        or path.startswith(f"{evidence_path}.")
        or path.startswith(f"{evidence_path}[")
        for evidence_path in evidence_paths
    )


def material_paths(
    *,
    funder: FunderDraft,
    funding_opportunities: list[FundingOpportunityDraft],
    funded_projects: list[FundedProjectDraft],
    funder_templates: list[FunderTemplateDraft],
    funder_criteria: list[FunderCriterionDraft],
) -> Iterable[str]:
    """Yield populated non-seed leaves using stable record references in paths."""
    opportunity = funding_opportunities[0]
    seed_paths = {
        "funder.name",
        f"funding_opportunities[{opportunity.funding_opportunity_ref}].name",
    }
    data: dict[str, JsonValue] = {
        "funder": funder.model_dump(mode="json"),
        "funding_opportunities": [
            item.model_dump(mode="json") for item in funding_opportunities
        ],
        "funded_projects": [
            item.model_dump(mode="json") for item in funded_projects
        ],
        "funder_templates": [item.model_dump(mode="json") for item in funder_templates],
        "funder_criteria": [item.model_dump(mode="json") for item in funder_criteria],
    }

    def walk(value: JsonValue, path: str) -> Iterable[str]:
        """Recursively yield evidence paths for populated JSON values."""
        if isinstance(value, dict):
            for key, item in value.items():
                child_path = f"{path}.{key}" if path else key
                if key.endswith("_ref"):
                    continue
                if child_path in seed_paths:
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
                    identity = next(
                        (
                            item[key]
                            for key in (
                                "template_ref",
                                "criterion_ref",
                                "chapter_ref",
                                "funding_opportunity_ref",
                                "funded_project_ref",
                                "funder_ref",
                            )
                            if item.get(key)
                        ),
                        None,
                    )
                    if identity is not None:
                        token = str(identity)
                yield from walk(item, f"{path}[{token}]")
            return

        if value is not None and value != "":
            yield path

    yield from walk(data, "")


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
