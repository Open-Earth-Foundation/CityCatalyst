"""Build local similar-project inputs from reviewed CNB research artifacts."""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID, uuid5

from app.models.cnb_research import FundingOpportunityResearchBundle, FundingRecordDraft
from app.models.cnb_similar_projects import (
    CnbSimilarProjectCandidate,
    CnbSimilarProjectEvidence,
    CnbSimilarProjectReviewRunInput,
    CnbSimilarProjectReviewSource,
    CnbSimilarProjectSearchRequest,
)
from app.services.cnb_review_import import (
    ReviewedFundedProjectImport,
    ReviewedReferenceDataArtifact,
    prepare_reviewed_reference_import,
)

LOCAL_REVIEW_ID_NAMESPACE = UUID("a5321519-d7fb-4ac3-b8c1-68c8f667eb2f")
_CandidateEntry = tuple[CnbSimilarProjectCandidate, str, str]


def _normalize_text(value: str | None) -> str:
    """Normalize optional text for deterministic deduplication keys."""
    return (value or "").strip().casefold()


def _normalize_decimal(value: Decimal | None) -> str:
    """Render decimals deterministically without preserving trailing zeros."""
    if value is None:
        return ""
    text = format(value, "f")
    if "." not in text:
        return text
    return text.rstrip("0").rstrip(".")


def _humanize_gap_field(target_path: str, funding_record_ref: str) -> str | None:
    """Return a simple field label for one project-scoped gap path."""
    prefix = f"funding_records[{funding_record_ref}]"
    if not target_path.startswith(f"{prefix}."):
        return None
    field_path = target_path[len(prefix) + 1 :]
    field_tokens = [
        token.replace("_", " ").strip()
        for token in field_path.split(".")
        if token.strip()
    ]
    if not field_tokens:
        return None
    return " ".join(field_tokens).title()


def _record_gap_texts(
    research: FundingOpportunityResearchBundle,
    funding_record_ref: str,
) -> list[str]:
    """Retain project-scoped gap reasons as prompt-facing caveat text."""
    prefix = f"funding_records[{funding_record_ref}]"
    gap_texts: list[str] = []
    seen: set[str] = set()
    for gap in research.gaps:
        if gap.target_path != prefix and not gap.target_path.startswith(f"{prefix}."):
            continue
        label = _humanize_gap_field(gap.target_path, funding_record_ref)
        gap_text = f"{label}: {gap.reason}" if label else gap.reason
        if gap_text in seen:
            continue
        seen.add(gap_text)
        gap_texts.append(gap_text)
    return gap_texts


def _candidate_funder_name(record: FundingRecordDraft) -> str | None:
    """Return the reviewed canonical funder name for one funded project."""
    if record.selected_funder_id is None:
        return record.reported_funder_name
    for candidate in record.candidate_funders:
        if candidate.funder_id == record.selected_funder_id:
            return candidate.name
    return record.reported_funder_name


def _local_ref(*, run_id: str, reference: str) -> str:
    """Namespace a reviewed reference so merged snapshots remain unique."""
    return f"{run_id}:{reference}"


def _candidate_identity_key(record: FundingRecordDraft) -> str:
    """Build the semantic key used for local reviewed-project deduplication."""
    return "|".join(
        (
            str(record.selected_funder_id),
            _normalize_text(record.name),
            _normalize_text(record.applicant_name),
            _normalize_text(record.city),
            _normalize_text(record.state_region),
            _normalize_text(record.country),
            str(record.award_year or ""),
            _normalize_decimal(record.award_amount),
            _normalize_text(record.currency),
        )
    )


def _candidate_funding_record_id(record: FundingRecordDraft) -> UUID:
    """Derive one deterministic local UUID from the semantic candidate key."""
    return uuid5(LOCAL_REVIEW_ID_NAMESPACE, _candidate_identity_key(record))


def _candidate_scalar_score(candidate: CnbSimilarProjectCandidate) -> int:
    """Prefer the candidate carrying the richest reviewed scalar coverage."""
    scalar_values = (
        candidate.funder_name,
        candidate.award_status,
        candidate.award_amount,
        candidate.currency,
        candidate.award_year,
        candidate.name,
        candidate.applicant_name,
        candidate.applicant_type,
        candidate.city,
        candidate.state_region,
        candidate.country,
        candidate.category,
        candidate.sector,
        candidate.finance_route,
        candidate.instrument_type,
        candidate.region_scope,
        candidate.summary,
    )
    return sum(value is not None and value != "" for value in scalar_values)


def _ordered_unique_strings(values: list[str]) -> list[str]:
    """Deduplicate string lists while preserving their first observed order."""
    unique_values: list[str] = []
    seen: set[str] = set()
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        unique_values.append(value)
    return unique_values


def _deduplicate_sources(
    sources: list[CnbSimilarProjectReviewSource],
) -> list[CnbSimilarProjectReviewSource]:
    """Deduplicate namespaced sources while preserving first-seen order."""
    merged: list[CnbSimilarProjectReviewSource] = []
    seen: set[str] = set()
    for source in sources:
        if source.source_ref in seen:
            continue
        seen.add(source.source_ref)
        merged.append(source)
    return merged


def _deduplicate_evidence(
    evidence_items: list[CnbSimilarProjectEvidence],
) -> list[CnbSimilarProjectEvidence]:
    """Deduplicate namespaced evidence while preserving first-seen order."""
    merged: list[CnbSimilarProjectEvidence] = []
    seen: set[str] = set()
    for evidence in evidence_items:
        if evidence.evidence_ref in seen:
            continue
        seen.add(evidence.evidence_ref)
        merged.append(evidence)
    return merged


def _build_reviewed_candidate(
    *,
    reviewed_project: ReviewedFundedProjectImport,
    research: FundingOpportunityResearchBundle,
) -> tuple[CnbSimilarProjectCandidate, list[CnbSimilarProjectReviewSource]]:
    """Convert one validated reviewed project import into a local candidate."""
    # Namespace retained evidence and collapse repeated source metadata.
    evidence_items: list[CnbSimilarProjectEvidence] = []
    sources_by_ref: dict[str, CnbSimilarProjectReviewSource] = {}
    for retained in reviewed_project.evidence:
        source_ref = _local_ref(
            run_id=research.run_id,
            reference=retained.source.source_ref,
        )
        evidence_items.append(
            CnbSimilarProjectEvidence(
                evidence_ref=_local_ref(
                    run_id=research.run_id,
                    reference=retained.evidence.evidence_ref,
                ),
                source_ref=source_ref,
                target_path=retained.evidence.target_path,
                source_location=retained.evidence.source_location,
                quote_or_summary=retained.evidence.quote_or_summary,
            )
        )
        if source_ref not in sources_by_ref:
            sources_by_ref[source_ref] = CnbSimilarProjectReviewSource(
                source_ref=source_ref,
                url=retained.source.url,
                title=retained.source.title,
            )

    # Preserve reviewed project fields and expose research gaps as caveats.
    record = reviewed_project.record
    candidate = CnbSimilarProjectCandidate(
        funding_record_id=_candidate_funding_record_id(record),
        funder_id=record.selected_funder_id,
        funder_name=_candidate_funder_name(record),
        is_opportunity=False,
        is_funded_award=True,
        award_status=record.status,
        award_amount=record.award_amount,
        currency=record.currency,
        award_year=record.award_year,
        name=record.name,
        applicant_name=record.applicant_name,
        applicant_type=None,
        city=record.city,
        state_region=record.state_region,
        country=record.country,
        category=record.category,
        sector=None,
        hazards=list(record.hazards),
        interventions=list(record.interventions),
        finance_route=record.finance_route,
        instrument_type=record.instrument_type,
        region_scope=record.region_scope,
        summary=record.summary,
        project_tags=list(record.project_tags),
        known_gaps=_record_gap_texts(research, record.funding_record_ref),
        evidence=evidence_items,
    )
    return candidate, list(sources_by_ref.values())


def _merge_candidate_entries(
    entries: list[_CandidateEntry],
) -> CnbSimilarProjectCandidate:
    """Merge equivalent candidates while retaining the richest scalar record."""
    # Select the stable scalar base before combining repeatable reviewed fields.
    best_candidate, _, _ = min(
        entries,
        key=lambda item: (
            -_candidate_scalar_score(item[0]),
            -len(item[0].evidence),
            item[1],
            item[2],
        ),
    )
    candidates = [candidate for candidate, _, _ in entries]

    # Preserve first-seen list ordering across every equivalent review record.
    return best_candidate.model_copy(
        update={
            "hazards": _ordered_unique_strings(
                [value for candidate in candidates for value in candidate.hazards]
            ),
            "interventions": _ordered_unique_strings(
                [
                    value
                    for candidate in candidates
                    for value in candidate.interventions
                ]
            ),
            "project_tags": _ordered_unique_strings(
                [
                    value
                    for candidate in candidates
                    for value in candidate.project_tags
                ]
            ),
            "known_gaps": _ordered_unique_strings(
                [value for candidate in candidates for value in candidate.known_gaps]
            ),
            "evidence": _deduplicate_evidence(
                [value for candidate in candidates for value in candidate.evidence]
            ),
        }
    )


def build_run_input_from_reviewed_pairs(
    *,
    search_request: CnbSimilarProjectSearchRequest,
    research_review_pairs: list[
        tuple[FundingOpportunityResearchBundle, ReviewedReferenceDataArtifact]
    ],
    known_funder_ids: set[UUID],
) -> CnbSimilarProjectReviewRunInput:
    """Build one local runner input from approved reviewed research pairs."""
    # Validate each review pair and group semantically equivalent projects.
    grouped_candidates: dict[UUID, list[_CandidateEntry]] = {}
    all_sources: list[CnbSimilarProjectReviewSource] = []
    for research, review in research_review_pairs:
        reviewed_import = prepare_reviewed_reference_import(
            research=research,
            review=review,
            known_funder_ids=known_funder_ids,
        )
        for project in reviewed_import.projects:
            candidate, sources = _build_reviewed_candidate(
                reviewed_project=project,
                research=research,
            )
            grouped_candidates.setdefault(candidate.funding_record_id, []).append(
                (candidate, research.run_id, project.record.funding_record_ref)
            )
            all_sources.extend(sources)

    # Merge duplicate candidates while preferring the richest scalar record.
    merged_candidates = []
    for funding_record_id, entries in grouped_candidates.items():
        merged_candidate = _merge_candidate_entries(entries)
        assert merged_candidate.funding_record_id == funding_record_id
        merged_candidates.append(merged_candidate)

    # Keep output stable for review diffs and reproducible local artifacts.
    merged_candidates.sort(
        key=lambda candidate: (
            candidate.name.casefold(),
            str(candidate.funder_id),
            str(candidate.funding_record_id),
        )
    )
    return CnbSimilarProjectReviewRunInput(
        search_request=search_request,
        candidates=merged_candidates,
        sources=_deduplicate_sources(all_sources),
    )
