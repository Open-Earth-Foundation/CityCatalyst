from __future__ import annotations

from uuid import uuid4

from ..models.draft_review import (
    CoverageLevel,
    DraftProposalStatus,
    DraftRecommendation,
    DraftSourceCandidate,
    GeographyMatch,
    SectorDraftLLMOutput,
    SectorDraftRequest,
    SubsectorDraftProposal,
)


def _candidate_score(candidate: DraftSourceCandidate, target_year: int) -> float:
    geography_weight = {
        GeographyMatch.CITY_DIRECT: 4.0,
        GeographyMatch.CITY_PROXY: 3.0,
        GeographyMatch.REGIONAL_PROXY: 2.0,
        GeographyMatch.COUNTRY_PROXY: 1.0,
    }
    coverage_weight = {
        CoverageLevel.COMPLETE: 2.0,
        CoverageLevel.PARTIAL: 1.0,
        CoverageLevel.MISSING: -2.0,
    }

    score = geography_weight.get(candidate.geography_match, 0.0)
    score += coverage_weight.get(candidate.coverage, 0.0)
    score += candidate.confidence or 0.0

    if candidate.tier is not None:
        score += (4 - candidate.tier) * 0.25

    if candidate.year is not None:
        score -= min(abs(target_year - candidate.year), 10) * 0.05

    return score


def _to_recommendation(candidate: DraftSourceCandidate) -> DraftRecommendation:
    return DraftRecommendation(
        source_id=candidate.source_id,
        value=candidate.value or 0,
        unit=candidate.unit or "unknown",
        source_name=candidate.source_name,
        source_year=candidate.year,
        source_tier=candidate.tier,
        method=candidate.method,
        confidence=candidate.confidence,
        citation=candidate.citation,
    )


def generate_stationary_energy_draft(
    request: SectorDraftRequest,
) -> SectorDraftLLMOutput:
    """Rank pre-normalized city-scoped candidates for the Bulk Filler UI.

    This is intentionally bounded: CA does not search external sources here.
    The CityCatalyst app supplies the city, inventory, subsectors, current
    state, and allowed source candidates.
    """

    target_year = request.inventory.year
    allowed_sources = {source.lower() for source in request.policy.allowed_sources}
    current_state = {
        state.subsector_code: state for state in request.current_state
    }
    candidate_sets = {
        candidate_set.subsector_code: candidate_set
        for candidate_set in request.candidates
    }

    proposals: list[SubsectorDraftProposal] = []

    for subsector in request.sector.subsectors:
        state = current_state.get(subsector.code)
        if state and state.is_locked:
            proposals.append(
                SubsectorDraftProposal(
                    proposal_id=str(uuid4()),
                    subsector_code=subsector.code,
                    status=DraftProposalStatus.GAP,
                    rationale="The row already has a locked value, so no draft was proposed.",
                    ui_message=f"{subsector.code} is already locked for {request.inventory.city_name}.",
                    needs_user_choice=False,
                )
            )
            continue

        candidate_set = candidate_sets.get(subsector.code)
        candidates = list(candidate_set.options) if candidate_set else []
        candidates = [
            candidate
            for candidate in candidates
            if candidate.value is not None
            and candidate.unit is not None
            and candidate.coverage != CoverageLevel.MISSING
            and (
                not allowed_sources
                or candidate.source_name.lower() in allowed_sources
                or (candidate.source_id or "").lower() in allowed_sources
            )
        ]

        if not candidates:
            proposals.append(
                SubsectorDraftProposal(
                    proposal_id=str(uuid4()),
                    subsector_code=subsector.code,
                    status=DraftProposalStatus.GAP,
                    rationale="No approved source candidate with usable data was supplied for this city inventory.",
                    ui_message=(
                        f"{subsector.code} has no third-party data for "
                        f"{request.inventory.city_name}, {target_year}."
                    ),
                    needs_user_choice=False,
                )
            )
            continue

        ranked = sorted(
            candidates,
            key=lambda candidate: _candidate_score(candidate, target_year),
            reverse=True,
        )
        best = ranked[0]
        alternatives = ranked[1:]
        status = DraftProposalStatus.READY
        needs_user_choice = False

        if alternatives:
            second = alternatives[0]
            denominator = max(abs(best.value or 0), 1.0)
            variance = abs((best.value or 0) - (second.value or 0)) / denominator
            if variance >= request.policy.conflict_variance_threshold:
                status = DraftProposalStatus.CONFLICT
                needs_user_choice = True

        source_label = best.source_name
        rationale = (
            f"{source_label} is the strongest supplied candidate for "
            f"{request.inventory.city_name}, {target_year}: "
            f"{best.geography_match.value}, {best.coverage.value} coverage."
        )
        if best.rationale_notes:
            rationale = f"{rationale} {' '.join(best.rationale_notes)}"

        proposals.append(
            SubsectorDraftProposal(
                proposal_id=str(uuid4()),
                subsector_code=subsector.code,
                status=status,
                recommended=_to_recommendation(best),
                alternatives=alternatives,
                rationale=rationale,
                ui_message=(
                    f"I drafted {subsector.code} from {source_label}. "
                    f"Review the source before saving."
                ),
                needs_user_choice=needs_user_choice,
            )
        )

    return SectorDraftLLMOutput(
        run_id=str(uuid4()),
        inventory_id=request.inventory.inventory_id,
        city_id=request.inventory.city_id,
        city_name=request.inventory.city_name,
        locode=request.inventory.locode,
        sector_code=request.sector.code,
        locale=request.inventory.locale,
        proposals=proposals,
    )
