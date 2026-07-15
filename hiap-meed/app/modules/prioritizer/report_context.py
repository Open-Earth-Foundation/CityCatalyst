"""Pure builders for output-plan report context and chapter inputs."""

from __future__ import annotations

from typing import Any

from app.modules.prioritizer.internal_models import (
    Action,
    ActionFinancialFeasibilityScoreRecord,
    ActionMitigationFeasibilityScoreRecord,
    ActionPolicyScoreRecord,
    CityData,
    LegalAssessmentRecord,
)
from app.modules.prioritizer.models import (
    CityActionReportApiRequest,
    PrioritizerApiCityResult,
    RankedActionResult,
)
from app.modules.prioritizer.report_models import ReportChapterInput, ReportContext


REPORT_CHAPTERS: tuple[tuple[str, str], ...] = (
    ("snapshot", "Snapshot"),
    ("the_action", "The Action"),
    ("action_impact", "Action Impact"),
    ("city_fit", "City Fit"),
    ("policy_backing", "Policy Backing"),
    ("legal_mandate_delivery", "Legal Mandate & Delivery"),
    ("financing_precedents_pathway", "Financing, Precedents & Pathway"),
    ("sources_assumptions", "Where The Information Comes From"),
)


def validate_report_snapshot(
    request: CityActionReportApiRequest,
) -> tuple[PrioritizerApiCityResult, RankedActionResult, str]:
    """
    Validate one output-plan request against its prioritization snapshot.

    Inputs:
    - `requestData.locode` and `actionId` from the report request.
    - original `/v1/prioritize` request and response stored in the snapshot.

    Returns the matching city result, selected ranked action, and country code.
    Raises `ValueError` for malformed snapshots, city mismatches, missing actions,
    or missing city inputs.
    """
    request_data = request.requestData
    normalized_locode = _normalize_key(request_data.locode)
    normalized_action_id = _normalize_key(request_data.actionId)

    # Step 1: match the city in both original request and response snapshots.
    source_city_input = _find_source_city_input(request, normalized_locode)
    city_result = _find_city_result(request, normalized_locode)
    if _normalize_key(city_result.locode) != normalized_locode:
        raise ValueError("Prioritization snapshot city result does not match locode")

    # Step 2: confirm the selected action was actually ranked for that city.
    ranked_action = _find_ranked_action(city_result, normalized_action_id)

    return city_result, ranked_action, source_city_input.countryCode.strip().upper()


def build_report_context(
    *,
    request: CityActionReportApiRequest,
    action: Action,
    city: CityData,
    policy_score: ActionPolicyScoreRecord | None,
    legal_assessment: LegalAssessmentRecord | None,
    mitigation_feasibility: ActionMitigationFeasibilityScoreRecord | None,
    financial_feasibility: ActionFinancialFeasibilityScoreRecord | None,
    source_metadata: dict[str, Any],
) -> ReportContext:
    """
    Build normalized `ReportContext` from validated snapshot and enrichment data.

    The builder is pure: callers provide all live-enrichment records. It does
    not call external APIs.
    """
    city_result, ranked_action, country_code = validate_report_snapshot(request)
    return ReportContext(
        locode=request.requestData.locode,
        country_code=country_code,
        action_id=request.requestData.actionId,
        language=request.requestData.language.strip().lower(),
        prioritization_request=request.requestData.prioritizationSnapshot.request,
        prioritization_city_result=city_result,
        ranked_action=ranked_action,
        action=action,
        city=city,
        policy_score=policy_score,
        legal_assessment=legal_assessment,
        mitigation_feasibility=mitigation_feasibility,
        financial_feasibility=financial_feasibility,
        source_metadata=source_metadata,
        limitations=_build_report_limitations(
            request=request,
            policy_score=policy_score,
            legal_assessment=legal_assessment,
            mitigation_feasibility=mitigation_feasibility,
            financial_feasibility=financial_feasibility,
        ),
    )


def build_chapter_inputs(context: ReportContext) -> list[ReportChapterInput]:
    """
    Build curated chapter inputs from `ReportContext`.

    Each builder maps one Notion template section. It lists covered fields,
    deferred fields, and unsupported claims so prompts stay constrained.
    """
    return [
        _build_snapshot_input(context),
        _build_the_action_input(context),
        _build_action_impact_input(context),
        _build_city_fit_input(context),
        _build_policy_backing_input(context),
        _build_legal_mandate_input(context),
        _build_financing_pathway_input(context),
        _build_sources_input(context),
    ]


def _find_source_city_input(
    request: CityActionReportApiRequest, normalized_locode: str
):
    """Return the source city input that matches the report locode."""
    for city_input in request.requestData.prioritizationSnapshot.request.requestData.cityDataList:
        if _normalize_key(city_input.locode) == normalized_locode:
            return city_input
    raise ValueError("Report locode was not found in prioritizationSnapshot.request")


def _find_city_result(
    request: CityActionReportApiRequest, normalized_locode: str
) -> PrioritizerApiCityResult:
    """Return the prioritization city result that matches the report locode."""
    for city_result in request.requestData.prioritizationSnapshot.response.results:
        if _normalize_key(city_result.locode) == normalized_locode:
            return city_result
    raise ValueError("Report locode was not found in prioritizationSnapshot.response")


def _find_ranked_action(
    city_result: PrioritizerApiCityResult, normalized_action_id: str
) -> RankedActionResult:
    """Return the selected ranked action from the city result."""
    for ranked_action in city_result.ranked_actions:
        if _normalize_key(ranked_action.action_id) == normalized_action_id:
            return ranked_action
    raise ValueError("Report actionId was not found in the supplied ranked actions")


def _build_report_limitations(
    *,
    request: CityActionReportApiRequest,
    policy_score: ActionPolicyScoreRecord | None,
    legal_assessment: LegalAssessmentRecord | None,
    mitigation_feasibility: ActionMitigationFeasibilityScoreRecord | None,
    financial_feasibility: ActionFinancialFeasibilityScoreRecord | None,
) -> list[str]:
    """Return report-level limitations for sparse-but-valid enrichment records."""
    limitations: list[str] = [
        "Snapshot-to-live source staleness was not evaluated for this report.",
        "Comparable project evidence is not available in the supplied context.",
        "City-level quantified emissions reductions are not available for this action in the supplied context.",
        "Permit and SEIA applicability are not available in the supplied legal context.",
    ]
    requested_languages = {
        language.strip().lower()
        for language in request.requestData.prioritizationSnapshot.request.requestData.requestedLanguages
        if language.strip()
    }
    report_language = request.requestData.language.strip().lower()
    if requested_languages and report_language not in requested_languages:
        limitations.append(
            "The requested report language was not part of the source prioritization languages; the report is generated directly in the requested language from the supplied snapshot and live enrichment context."
        )
    if policy_score is None:
        limitations.append("No live policy score row was available for the selected action.")
    if legal_assessment is None:
        limitations.append("No live legal assessment row was available for the selected action.")
    if mitigation_feasibility is None:
        limitations.append(
            "No live mitigation feasibility score row was available for the selected action."
        )
    if financial_feasibility is None:
        limitations.append(
            "No live financial feasibility score row was available for the selected action."
        )
    return limitations


def _build_snapshot_input(context: ReportContext) -> ReportChapterInput:
    """
    Build Snapshot chapter input.

    Implements Notion Snapshot. Uses ranking score/rank from the frontend
    snapshot plus live action/city labels. Defers comparable-project track
    record and exact product wording for "the ask".
    """
    facts = {
        "city": _city_facts(context),
        "action": _action_facts(context),
        "rank": context.ranked_action.rank,
        "scores": _score_facts(context),
        "explanation": context.ranked_action.explanations.get(context.language)
        or context.ranked_action.explanations.get("en"),
    }
    return _chapter_input(
        key="snapshot",
        title="Snapshot",
        context=context,
        facts=facts,
        notion_coverage=[
            "city and action identity",
            "ranking position and scores",
            "one-line qualitative signal summary",
        ],
        notion_deferred=["track record", "product-approved wording for the ask"],
        unsupported_claims=["Do not state comparable project counts."],
    )


def _build_the_action_input(context: ReportContext) -> ReportChapterInput:
    """
    Build The Action chapter input.

    Implements action identity and description from live action pathway data.
    Defers richer localization if source names/descriptions are missing.
    """
    return _chapter_input(
        key="the_action",
        title="The Action",
        context=context,
        facts={"action": _action_facts(context)},
        notion_coverage=[
            "name and ID",
            "type",
            "description",
            "investment cost",
            "implementation timeline",
        ],
        notion_deferred=["localized action copy when not present in source data"],
        unsupported_claims=["Do not invent action details absent from live action data."],
    )


def _build_action_impact_input(context: ReportContext) -> ReportChapterInput:
    """
    Build Action Impact chapter input.

    Implements qualitative impact from ranking impact evidence and action
    co-benefits. City-level per-action tCO2e is intentionally deferred.
    """
    evidence = context.ranked_action.evidence_summary.impact.model_dump(mode="json")
    return _chapter_input(
        key="action_impact",
        title="Action Impact",
        context=context,
        facts={
            "impact_score": context.ranked_action.impact_score,
            "impact_evidence": evidence,
            "co_benefits": context.action.co_benefits,
            "emissions": context.action.emissions,
        },
        notion_coverage=["qualitative mitigation potential", "co-benefits"],
        notion_deferred=["city-specific per-action tCO2e estimate"],
        unsupported_claims=["Do not provide quantified tCO2e unless source facts contain it."],
    )


def _build_city_fit_input(context: ReportContext) -> ReportChapterInput:
    """
    Build City Fit chapter input.

    Implements fit signal from ranking feasibility and live city/mitigation
    feasibility indicators. Supports/limits are derived only from supplied rows.
    """
    mitigation = (
        context.mitigation_feasibility.model_dump(mode="json")
        if context.mitigation_feasibility is not None
        else None
    )
    return _chapter_input(
        key="city_fit",
        title="City Fit",
        context=context,
        facts={
            "feasibility_score": context.ranked_action.feasibility_score,
            "city_context": context.city.city_context,
            "mitigation_feasibility": mitigation,
        },
        notion_coverage=["overall fit", "supporting local conditions", "limiting local conditions"],
        notion_deferred=["deterministic support/limit taxonomy if upstream rows are sparse"],
        unsupported_claims=["Do not infer local conditions beyond provided indicators."],
    )


def _build_policy_backing_input(context: ReportContext) -> ReportChapterInput:
    """
    Build Policy Backing chapter input.

    Implements policy alignment using live policy evidence. Page/quote quality is
    limited to upstream policy evidence fields.
    """
    policy = (
        context.policy_score.model_dump(mode="json")
        if context.policy_score is not None
        else None
    )
    return _chapter_input(
        key="policy_backing",
        title="Policy Backing",
        context=context,
        facts={
            "alignment_score": context.ranked_action.alignment_score,
            "policy_score": policy,
        },
        notion_coverage=["policy alignment label", "finding and document counts"],
        notion_deferred=["exact verbatim page citations where upstream evidence lacks them"],
        unsupported_claims=["Do not quote policy text not present in policy_evidence."],
    )


def _build_legal_mandate_input(context: ReportContext) -> ReportChapterInput:
    """
    Build Legal Mandate & Delivery chapter input.

    Implements legal verdict, ownership, restrictions, and references from
    snapshot/live legal evidence. Permits and SEIA remain out of scope.
    """
    legal = (
        context.legal_assessment.model_dump(mode="json")
        if context.legal_assessment is not None
        else context.ranked_action.evidence_summary.feasibility.legal.model_dump(mode="json")
    )
    return _chapter_input(
        key="legal_mandate_delivery",
        title="Legal Mandate & Delivery",
        context=context,
        facts={"legal": legal},
        notion_coverage=["legal verdict", "ownership", "restrictions", "legal basis"],
        notion_deferred=["permits", "SEIA applicability", "approved delivery actor taxonomy"],
        unsupported_claims=["Do not soften a blocked legal verdict."],
    )


def _build_financing_pathway_input(context: ReportContext) -> ReportChapterInput:
    """
    Build Financing, Precedents & Pathway chapter input.

    Implements funding route and conservative next steps from live financial and
    legal evidence. Comparable actions/projects are deferred.
    """
    financial = (
        context.financial_feasibility.model_dump(mode="json")
        if context.financial_feasibility is not None
        else context.ranked_action.evidence_summary.feasibility.financial_feasibility.model_dump(
            mode="json"
        )
    )
    return _chapter_input(
        key="financing_precedents_pathway",
        title="Financing, Precedents & Pathway",
        context=context,
        facts={"financial": financial, "legal": _optional_legal_facts(context)},
        notion_coverage=["funding outlook", "funding route", "suggested pathway"],
        notion_deferred=["comparable project evidence", "named reachable funds when absent"],
        unsupported_claims=["Do not invent named funds or precedents."],
    )


def _build_sources_input(context: ReportContext) -> ReportChapterInput:
    """
    Build Where The Information Comes From chapter input.

    Implements source list, analyst figures, limitations, and deferred-method
    notes. It should not expose raw debug artifacts as user-facing citations.
    """
    return _chapter_input(
        key="sources_assumptions",
        title="Where The Information Comes From",
        context=context,
        facts={
            "source_metadata": context.source_metadata,
            "scores": _score_facts(context),
            "limitations": context.limitations,
        },
        notion_coverage=["source list", "analyst figures", "limitations"],
        notion_deferred=["final citation formatting"],
        unsupported_claims=["Do not treat MLflow/local artifacts as user-facing sources."],
    )


def _chapter_input(
    *,
    key: str,
    title: str,
    context: ReportContext,
    facts: dict[str, Any],
    notion_coverage: list[str],
    notion_deferred: list[str],
    unsupported_claims: list[str],
) -> ReportChapterInput:
    """Build one `ReportChapterInput` with shared source metadata."""
    source_refs = sorted(context.source_metadata.keys())
    return ReportChapterInput(
        key=key,  # type: ignore[arg-type]
        title=title,
        language=context.language,
        facts=facts,
        source_refs=source_refs,
        limitations=list(context.limitations),
        notion_coverage=notion_coverage,
        notion_deferred=notion_deferred,
        unsupported_claims=unsupported_claims,
    )


def _city_facts(context: ReportContext) -> dict[str, Any]:
    """Return display-friendly city facts."""
    return {
        "locode": context.locode,
        "name": context.city.city_name,
        "region": context.city.region_name,
        "country_code": context.country_code,
        "population_size": context.city.population_size,
    }


def _action_facts(context: ReportContext) -> dict[str, Any]:
    """Return display-friendly selected action facts."""
    return {
        "action_id": context.action.action_id,
        "name": context.action.action_name,
        "type": context.action.action_type,
        "description": context.action.description,
        "investment_cost": context.action.investment_cost,
        "implementation_timeline": context.action.implementation_timeline,
        "co_benefits": context.action.co_benefits,
    }


def _score_facts(context: ReportContext) -> dict[str, Any]:
    """Return report-ready ranking score facts."""
    return {
        "rank": context.ranked_action.rank,
        "final_score": context.ranked_action.final_score,
        "impact_score": context.ranked_action.impact_score,
        "alignment_score": context.ranked_action.alignment_score,
        "feasibility_score": context.ranked_action.feasibility_score,
    }


def _optional_legal_facts(context: ReportContext) -> dict[str, Any] | None:
    """Return live legal facts when available, otherwise snapshot legal evidence."""
    if context.legal_assessment is not None:
        return context.legal_assessment.model_dump(mode="json")
    return context.ranked_action.evidence_summary.feasibility.legal.model_dump(mode="json")


def _normalize_key(value: str) -> str:
    """Normalize action IDs and locodes for equality checks."""
    return value.strip().upper()
