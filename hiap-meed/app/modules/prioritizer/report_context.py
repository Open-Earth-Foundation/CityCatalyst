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
        "City-level quantified emissions reductions are not available for this "
        "action in the supplied context.",
        "Permit and SEIA applicability are not available in the supplied legal context.",
    ]
    requested_languages = {
        language.strip().lower()
        for language in (
            request.requestData.prioritizationSnapshot.request.requestData.requestedLanguages
        )
        if language.strip()
    }
    report_language = request.requestData.language.strip().lower()
    if requested_languages and report_language not in requested_languages:
        limitations.append(
            "The requested report language was not part of the source "
            "prioritization languages; the report is generated directly in the "
            "requested language from the supplied snapshot and live enrichment "
            "context."
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
        "action": _action_identity_facts(context),
        "ranking": _ranking_facts(context, include_explanation=True),
    }
    return _chapter_input(
        key="snapshot",
        title="Snapshot",
        context=context,
        facts=facts,
        source_refs=["ranking_snapshot", "city", "action_pathways"],
        limitations=[
            "Comparable project evidence is not available in the supplied context.",
            "City-level quantified emissions reductions are not available for "
            "this action in the supplied context.",
        ],
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
        source_refs=["action_pathways"],
        limitations=[
            "Detailed local implementation scope is not available in the supplied context."
        ],
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
            "action": _action_impact_facts(context),
            "ranking": _impact_ranking_facts(context),
            "impact_evidence": evidence,
        },
        source_refs=["ranking_snapshot", "action_pathways"],
        limitations=[
            "City-level quantified emissions reductions are not available for "
            "this action in the supplied context."
        ],
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
    return _chapter_input(
        key="city_fit",
        title="City Fit",
        context=context,
        facts={
            "action": _action_identity_facts(context),
            "ranking": _city_fit_ranking_facts(context),
            "city_context": _city_fit_city_context(
                context.mitigation_feasibility, context.city.city_context
            ),
            "mitigation_feasibility": _city_fit_mitigation_facts(
                context.mitigation_feasibility
            ),
        },
        source_refs=["ranking_snapshot", "city", "mitigation_feasibility"],
        limitations=["Local implementation capacity is not available in the supplied context."],
        notion_coverage=[
            "overall fit",
            "supporting local conditions",
            "limiting local conditions",
        ],
        notion_deferred=["deterministic support/limit taxonomy if upstream rows are sparse"],
        unsupported_claims=["Do not infer local conditions beyond provided indicators."],
    )


def _build_policy_backing_input(context: ReportContext) -> ReportChapterInput:
    """
    Build Policy Backing chapter input.

    Implements policy alignment using live policy evidence. Page/quote quality is
    limited to upstream policy evidence fields.
    """
    return _chapter_input(
        key="policy_backing",
        title="Policy Backing",
        context=context,
        facts={
            "action": _action_identity_facts(context),
            "ranking": _policy_ranking_facts(context),
            "policy_score": _policy_facts(context.policy_score),
        },
        source_refs=["ranking_snapshot", "policy_scores"],
        limitations=_policy_limitations(context),
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
    return _chapter_input(
        key="legal_mandate_delivery",
        title="Legal Mandate & Delivery",
        context=context,
        facts={
            "action": _action_identity_facts(context),
            "ranking": _legal_ranking_facts(context),
            "legal": _legal_facts(context),
        },
        source_refs=_legal_source_refs(context),
        limitations=_legal_limitations(context),
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
    return _chapter_input(
        key="financing_precedents_pathway",
        title="Financing, Precedents & Pathway",
        context=context,
        facts={
            "action": _action_identity_facts(context),
            "ranking": _finance_ranking_facts(context),
            "financial_feasibility": _financial_facts(context),
            "legal": _legal_delivery_facts(context),
        },
        source_refs=_finance_source_refs(context),
        limitations=[
            "Comparable project and track-record data are not available in the supplied context.",
            "Named financing opportunities are not available in the supplied context.",
        ],
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
            "source_summary": _source_summary_facts(context),
            "limitations": context.limitations,
        },
        source_refs=[
            "ranking_snapshot",
            "city",
            "action_pathways",
            "policy_scores",
            "legal",
            "mitigation_feasibility",
            "financial_feasibility",
        ],
        limitations=context.limitations,
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
    source_refs: list[str],
    limitations: list[str],
    notion_coverage: list[str],
    notion_deferred: list[str],
    unsupported_claims: list[str],
) -> ReportChapterInput:
    """Build one `ReportChapterInput` with shared source metadata."""
    return ReportChapterInput(
        key=key,  # type: ignore[arg-type]
        title=title,
        language=context.language,
        facts=_drop_empty_values(facts),
        source_refs=list(dict.fromkeys(source_refs)),
        limitations=list(dict.fromkeys(limitations)),
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
        "intervention_summary": context.action.intervention_summary,
        "outcome_summary": context.action.outcome_summary,
        "intervention_type": context.action.intervention_type,
        "action_role": context.action.action_role,
        "investment_cost": context.action.investment_cost,
        "implementation_timeline": context.action.implementation_timeline,
        "co_benefits": context.action.co_benefits,
    }


def _action_identity_facts(context: ReportContext) -> dict[str, Any]:
    """Return minimal selected-action identity for chapters that need a subject."""
    return {
        "action_id": context.action.action_id,
        "name": context.action.action_name,
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


def _ranking_facts(
    context: ReportContext, *, include_explanation: bool = False
) -> dict[str, Any]:
    """Return selected-action ranking facts without other ranked actions."""
    facts = _score_facts(context)
    facts["returned_action_count"] = len(
        context.prioritization_city_result.ranked_actions
    )
    facts["explanation_language"] = context.language
    if include_explanation:
        facts["explanation"] = context.ranked_action.explanations.get(
            context.language
        ) or context.ranked_action.explanations.get("en")
    return facts


def _impact_ranking_facts(context: ReportContext) -> dict[str, Any]:
    """Return selected-action ranking facts needed for Action Impact."""
    return {
        "rank": context.ranked_action.rank,
        "returned_action_count": len(
            context.prioritization_city_result.ranked_actions
        ),
        "impact_score": context.ranked_action.impact_score,
        "final_score": context.ranked_action.final_score,
    }


def _city_fit_ranking_facts(context: ReportContext) -> dict[str, Any]:
    """Return selected-action ranking facts needed for City Fit."""
    return {
        "rank": context.ranked_action.rank,
        "returned_action_count": len(
            context.prioritization_city_result.ranked_actions
        ),
        "feasibility_score": context.ranked_action.feasibility_score,
    }


def _policy_ranking_facts(context: ReportContext) -> dict[str, Any]:
    """Return selected-action ranking facts needed for Policy Backing."""
    return {
        "rank": context.ranked_action.rank,
        "returned_action_count": len(
            context.prioritization_city_result.ranked_actions
        ),
        "alignment_score": context.ranked_action.alignment_score,
    }


def _legal_ranking_facts(context: ReportContext) -> dict[str, Any]:
    """Return selected-action ranking facts needed for Legal Mandate."""
    legal = context.ranked_action.evidence_summary.feasibility.legal
    return {
        "feasibility_score": context.ranked_action.feasibility_score,
        "legal_component_score": legal.component_score,
        "legal_verdict_category": legal.verdict_category,
        "legal_assessment_present": legal.assessment_present,
    }


def _finance_ranking_facts(context: ReportContext) -> dict[str, Any]:
    """Return selected-action ranking facts needed for Financing."""
    financial = context.ranked_action.evidence_summary.feasibility.financial_feasibility
    return {
        "feasibility_score": context.ranked_action.feasibility_score,
        "financial_component_score": financial.component_score,
        "financial_score_present": financial.score_present,
    }


def _action_impact_facts(context: ReportContext) -> dict[str, Any]:
    """Return action fields needed for qualitative impact prose."""
    return {
        "action_id": context.action.action_id,
        "name": context.action.action_name,
        "description": context.action.description,
        "intervention_summary": context.action.intervention_summary,
        "outcome_summary": context.action.outcome_summary,
        "implementation_timeline": context.action.implementation_timeline,
        "emissions": context.action.emissions,
        "co_benefits": context.action.co_benefits,
    }


def _city_fit_mitigation_facts(
    mitigation: ActionMitigationFeasibilityScoreRecord | None,
) -> dict[str, Any] | None:
    """Return only City Fit fields that can support local fit prose."""
    if mitigation is None:
        return None

    return {
        "action_id": mitigation.action_id,
        "action_mapping_strength": mitigation.action_mapping_strength,
        "action_score": mitigation.action_score,
        "rank_within_city": mitigation.rank_within_city,
        "dimension_scores": mitigation.dimension_scores,
        "supporting_local_conditions": _city_fit_condition_rows(
            mitigation.breakdown, keep_positive=True
        ),
        "limiting_local_conditions": _city_fit_condition_rows(
            mitigation.breakdown, keep_positive=False
        ),
    }


def _city_fit_city_context(
    mitigation: ActionMitigationFeasibilityScoreRecord | None,
    city_context: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Return only city indicators referenced by selected-action fit rows."""
    if mitigation is None:
        return []

    referenced_indicators = {
        row["city_indicator"]
        for row in (
            _city_fit_condition_rows(mitigation.breakdown, keep_positive=True)
            + _city_fit_condition_rows(mitigation.breakdown, keep_positive=False)
        )
        if row.get("city_indicator")
    }
    if not referenced_indicators:
        return []

    compact_rows: list[dict[str, Any]] = []
    for row in city_context:
        attribute_name = row.get("attribute_name")
        if attribute_name not in referenced_indicators:
            continue
        compact_rows.append(
            {
                key: value
                for key, value in row.items()
                if key
                in {
                    "attribute_name",
                    "attribute_value",
                    "attribute_unit",
                    "attribute_category",
                    "data_source",
                }
            }
        )
    return compact_rows


def _city_fit_condition_rows(
    breakdown: dict[str, Any],
    *,
    keep_positive: bool,
) -> list[dict[str, Any]]:
    """Extract compact supporting or limiting city-indicator rows."""
    rows: list[dict[str, Any]] = []
    for dimension_name, dimension_payload in breakdown.items():
        if not isinstance(dimension_payload, dict):
            continue
        global_indicators = dimension_payload.get("global_indicators", [])
        if not isinstance(global_indicators, list):
            continue
        for global_indicator in global_indicators:
            if not isinstance(global_indicator, dict):
                continue
            city_indicators = global_indicator.get("city_indicators", [])
            if not isinstance(city_indicators, list):
                continue
            for city_indicator in city_indicators:
                if not isinstance(city_indicator, dict):
                    continue
                contribution = city_indicator.get("contribution")
                if not isinstance(contribution, int | float):
                    continue
                if keep_positive != (contribution > 0):
                    continue
                rows.append(
                    {
                        "dimension": dimension_name,
                        "global_indicator": global_indicator.get("global_indicator"),
                        "city_indicator": city_indicator.get("city_indicator"),
                        "category": city_indicator.get("category"),
                        "direction": city_indicator.get("direction"),
                        "capacity": city_indicator.get("capacity"),
                        "contribution": contribution,
                    }
                )

    rows.sort(key=lambda row: abs(float(row["contribution"])), reverse=True)
    return rows


def _policy_facts(
    policy_score: ActionPolicyScoreRecord | None,
) -> dict[str, Any] | None:
    """Return policy facts needed for policy-backing prose."""
    if policy_score is None:
        return None
    return {
        "action_id": policy_score.action_id,
        "policy_support_score": policy_score.policy_support_score,
        "policy_support_category": policy_score.policy_support_category,
        "best_relevance": policy_score.best_relevance,
        "n_findings": policy_score.n_findings,
        "n_docs": policy_score.n_docs,
        "sum_strength": policy_score.sum_strength,
        "policy_evidence": policy_score.policy_evidence,
    }


def _policy_limitations(context: ReportContext) -> list[str]:
    """Return limitations relevant to the Policy Backing chapter."""
    if context.policy_score is None:
        return ["No live policy score row was available for the selected action."]
    if not context.policy_score.policy_evidence:
        return ["Detailed policy evidence text is not available in the supplied context."]
    return []


def _legal_facts(context: ReportContext) -> dict[str, Any] | None:
    """Return legal facts needed for legal-mandate prose."""
    if context.legal_assessment is not None:
        legal = context.legal_assessment
        return {
            "action_id": legal.action_id,
            "country_code": legal.country_code,
            "gpc_sector": legal.gpc_sector,
            "verdict_category": legal.verdict_category,
            "verdict_score": legal.verdict_score,
            "ownership_category": legal.ownership_category,
            "ownership_score": legal.ownership_score,
            "ownership_description": legal.ownership_description,
            "restrictions_category": legal.restrictions_category,
            "restrictions_score": legal.restrictions_score,
            "restrictions_description": legal.restrictions_description,
            "legal_justification": legal.legal_justification,
            "legal_references": legal.legal_references,
        }

    snapshot_legal = context.ranked_action.evidence_summary.feasibility.legal
    if not snapshot_legal.assessment_present:
        return None
    return {
        "verdict_category": snapshot_legal.verdict_category,
        "component_score": snapshot_legal.component_score,
        "assessment_present": snapshot_legal.assessment_present,
        "assessment_missing": snapshot_legal.assessment_missing,
    }


def _legal_delivery_facts(context: ReportContext) -> dict[str, Any] | None:
    """Return the small legal subset needed by Financing and Pathway."""
    legal = _legal_facts(context)
    if legal is None:
        return None
    return {
        key: legal.get(key)
        for key in (
            "verdict_category",
            "ownership_category",
            "restrictions_category",
            "restrictions_description",
        )
    }


def _legal_source_refs(context: ReportContext) -> list[str]:
    """Return source refs for the legal chapter based on live/fallback facts."""
    if context.legal_assessment is not None:
        return ["legal"]
    return ["ranking_snapshot"]


def _legal_limitations(context: ReportContext) -> list[str]:
    """Return limitations relevant to the Legal Mandate chapter."""
    limitations = [
        "Permit and SEIA applicability are not available in the supplied legal context."
    ]
    if context.legal_assessment is None:
        limitations.append(
            "No live legal assessment row was available for the selected action."
        )
    return limitations


def _financial_facts(context: ReportContext) -> dict[str, Any] | None:
    """Return financing facts needed for finance-pathway prose."""
    if context.financial_feasibility is not None:
        financial = context.financial_feasibility
        return {
            "action_id": financial.action_id,
            "sector": financial.sector,
            "financial_feasibility": financial.financial_feasibility,
            "route": financial.route,
            "reason": financial.reason,
            "inputs": financial.inputs,
        }

    snapshot_financial = (
        context.ranked_action.evidence_summary.feasibility.financial_feasibility
    )
    if not snapshot_financial.score_present:
        return None
    return {
        "component_score": snapshot_financial.component_score,
        "score_present": snapshot_financial.score_present,
        "score_missing": snapshot_financial.score_missing,
        "route": snapshot_financial.route,
        "reason": snapshot_financial.reason,
    }


def _finance_source_refs(context: ReportContext) -> list[str]:
    """Return source refs for the financing chapter based on live/fallback facts."""
    refs = (
        ["financial_feasibility"]
        if context.financial_feasibility is not None
        else ["ranking_snapshot"]
    )
    if context.legal_assessment is not None:
        refs.append("legal")
    return refs


def _source_summary_facts(context: ReportContext) -> dict[str, Any]:
    """Return source categories without diagnostic paths, URLs, or raw payloads."""
    return {
        "ranking_snapshot": {
            "locode": context.locode,
            "selected_action_id": context.action_id,
            "rank": context.ranked_action.rank,
            "returned_action_count": len(
                context.prioritization_city_result.ranked_actions
            ),
            "requested_languages": (
                context.prioritization_request.requestData.requestedLanguages
            ),
        },
        "live_enrichment_sources": [
            {
                "source_ref": source_ref,
                "available": source_ref in context.source_metadata,
            }
            for source_ref in (
                "city",
                "action_pathways",
                "policy_scores",
                "legal",
                "mitigation_feasibility",
                "financial_feasibility",
            )
        ],
        "staleness_evaluated": False,
    }


def _drop_empty_values(value: Any) -> Any:
    """Recursively drop empty values from chapter facts without dropping zeroes."""
    if isinstance(value, dict):
        cleaned = {
            key: _drop_empty_values(item)
            for key, item in value.items()
            if item is not None and item != "" and item != [] and item != {}
        }
        return {
            key: item
            for key, item in cleaned.items()
            if item is not None and item != "" and item != [] and item != {}
        }
    if isinstance(value, list):
        return [
            item
            for item in (_drop_empty_values(item) for item in value)
            if item is not None and item != "" and item != [] and item != {}
        ]
    return value


def _normalize_key(value: str) -> str:
    """Normalize action IDs and locodes for equality checks."""
    return value.strip().upper()
