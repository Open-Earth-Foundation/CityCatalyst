"""Pure builders for output-plan report context and chapter inputs."""

from __future__ import annotations

from typing import Any

from app.modules.prioritizer.internal_models import (
    Action,
    ActionFinancialFeasibilityScoreRecord,
    ActionMitigationFeasibilityScoreRecord,
    ActionPolicyScoreRecord,
    CityData,
    ClimateFinanceOpportunityRecord,
    ClimateFinanceProjectRecord,
    LegalAssessmentRecord,
)
from app.modules.prioritizer.models import (
    CityActionReportApiRequest,
    PrioritizerApiCityResult,
    RankedActionResult,
)
from app.modules.prioritizer.localization import (
    chapter_terms,
    chapter_title,
    localized_source_value,
    translate_term,
)
from app.modules.prioritizer.report_models import ReportChapterInput, ReportContext
from app.modules.prioritizer.scoring_config import (
    ALIGNMENT_WEIGHT_OTHER,
    ALIGNMENT_WEIGHT_POLICY,
    ALIGNMENT_WEIGHT_SECTOR,
    ALIGNMENT_WEIGHT_TIMEFRAME,
    FEASIBILITY_WEIGHT_FINANCIAL_FEASIBILITY,
    FEASIBILITY_WEIGHT_LEGAL,
    FEASIBILITY_WEIGHT_MITIGATION_FEASIBILITY,
    IMPACT_TEXT_TO_MULTIPLIER,
    IMPACT_TIMELINE_TO_SCORE,
    IMPACT_WEIGHT_REDUCTION_SHARE,
    IMPACT_WEIGHT_TIMELINE,
)

AUTHORITY_SCOPE_FULL_DIRECT = "full_direct"
AUTHORITY_SCOPE_MUNICIPAL_ASSETS_ONLY = "municipal_assets_only"
AUTHORITY_SCOPE_QUALIFIED = "qualified"
AUTHORITY_SCOPE_BLOCKED = "blocked"
AUTHORITY_SCOPE_UNSPECIFIED = "unspecified"
FINANCE_MATCH_DIRECT = "direct"
FINANCE_MATCH_CONTEXTUAL = "contextual"
FINANCE_MATCH_UNKNOWN = "unknown"
_AUTHORITY_SCOPE_MUNICIPAL_LIMIT_MARKERS = (
    "private stock",
    "private building",
    "private assets",
    "private third-part",
    "third-party",
    "third party",
    "facilitator",
    "facilitation",
    "without regulatory",
    "stock privado",
    "edificios privados",
    "activos privados",
    "facilitador",
    "sin potestad regulatoria",
    "does not authorize the municipality to regulate",
    "no autoriza al municipio a regular",
    "no habilita al municipio a regular",
    "edificios de terceros",
    "terceros privados",
    "no puede imponer",
)
_AUTHORITY_SCOPE_QUALIFIED_MARKERS = (
    "not fully direct",
    "mediated",
    "no es plenamente directa",
    "no es plenamente directo",
    "mediada por",
    "mediado por",
)
_AUTHORITY_SCOPE_FULL_DIRECT_MARKERS = (
    "act directly",
    "lead directly",
    "direct and full competence",
    "direct municipal authority",
    "actuar de forma directa",
    "competencia directa",
    "competencia plena",
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
    finance_opportunities: list[ClimateFinanceOpportunityRecord] | None = None,
    comparable_projects: list[ClimateFinanceProjectRecord] | None = None,
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
        language=request.requestData.language[0],
        requested_languages=request.requestData.language,
        prioritization_request=request.requestData.prioritizationSnapshot.request,
        prioritization_city_result=city_result,
        ranked_action=ranked_action,
        action=action,
        city=city,
        policy_score=policy_score,
        legal_assessment=legal_assessment,
        mitigation_feasibility=mitigation_feasibility,
        financial_feasibility=financial_feasibility,
        finance_opportunities=finance_opportunities or [],
        comparable_projects=comparable_projects or [],
        source_metadata=source_metadata,
        limitations=_build_report_limitations(
            request=request,
            policy_score=policy_score,
            legal_assessment=legal_assessment,
            mitigation_feasibility=mitigation_feasibility,
            financial_feasibility=financial_feasibility,
            has_named_finance_opportunities=bool(finance_opportunities),
            has_comparable_projects=bool(comparable_projects),
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
    has_named_finance_opportunities: bool,
    has_comparable_projects: bool,
) -> list[str]:
    """Return report-level limitations for sparse-but-valid enrichment records."""
    limitations: list[str] = [
        "Source freshness has not been checked against the original prioritization date.",
        "A city-level emissions-reduction estimate is not available for this action.",
        "Whether permits or environmental review requirements apply has not been "
        "confirmed.",
    ]
    if not has_comparable_projects:
        limitations.append(
            "Comparable project information is not available for this action."
        )
    if not has_named_finance_opportunities:
        limitations.append(
            "Named financing opportunities are not available for this action."
        )
    requested_languages = {
        language.strip().lower()
        for language in (
            request.requestData.prioritizationSnapshot.request.requestData.requestedLanguages
        )
        if language.strip()
    }
    report_languages = set(request.requestData.language)
    if requested_languages and not report_languages.issubset(requested_languages):
        limitations.append(
            "One or more report languages differ from the languages used in the original "
            "prioritization."
        )
    if policy_score is None:
        limitations.append("Policy-backing information is not available for this action.")
    if legal_assessment is None:
        limitations.append("A legal review is not available for this action.")
    if mitigation_feasibility is None:
        limitations.append(
            "Detailed implementation-feasibility information is not available."
        )
    if financial_feasibility is None:
        limitations.append(
            "Detailed financing information is not available for this action."
        )
    return limitations


def _build_snapshot_input(context: ReportContext) -> ReportChapterInput:
    """
    Build Snapshot chapter input.

    Implements Notion Snapshot. Uses ranking score/rank from the frontend
    snapshot plus live action/city labels. Builds a prominent, defensible ask
    line from action, finance, and legal facts when available. Each signal row
    carries the evidence domains it used; chapter `source_refs` are the union
    of identity sources and those row-level references.
    """
    signals = _snapshot_signal_rows(context)
    facts = {
        "city": _city_facts(context),
        "action": _action_identity_facts(context),
        "ask": _ask_facts(context),
        "ranking": _ranking_facts(context, include_explanation=True),
        "signals": signals,
    }
    return _chapter_input(
        key="snapshot",
        title=chapter_title("snapshot", context.language),
        context=context,
        facts=facts,
        source_refs=_unique_source_refs(
            ["ranking_snapshot", "city", "action_pathways"],
            *[row.get("source_refs", []) for row in signals],
        ),
        limitations=_snapshot_limitations(context),
        notion_coverage=[
            "city and action identity",
            "one-line ask",
            "ranking position and scores",
            "one-line qualitative signal summary",
        ],
        notion_deferred=[],
        unsupported_claims=[
            "Do not state project counts beyond the supplied finance evidence.",
            "Do not claim legal authority over private or external assets when "
            "authority_scope is municipal_assets_only.",
            "Do not claim unrestricted direct authority when authority_scope "
            "is qualified or unspecified.",
            "Do not promote contextual finance candidates as confirmed action matches.",
        ],
    )


def _build_the_action_input(context: ReportContext) -> ReportChapterInput:
    """
    Build The Action chapter input.

    Implements action identity and description from live action pathway data.
    Defers richer localization if source names/descriptions are missing.
    """
    return _chapter_input(
        key="the_action",
        title=chapter_title("the_action", context.language),
        context=context,
        facts={"action": _action_facts(context)},
        source_refs=["action_pathways"],
        limitations=[
            "A detailed local implementation scope has not been defined."
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
    return _chapter_input(
        key="action_impact",
        title=chapter_title("action_impact", context.language),
        context=context,
        facts={
            "action": _action_impact_facts(context),
            "ranking": _impact_ranking_facts(context),
            "impact_evidence": _impact_evidence_facts(context),
        },
        source_refs=["ranking_snapshot", "action_pathways"],
        limitations=[
            "A city-level emissions-reduction estimate is not available for this action."
        ],
        notion_coverage=["qualitative mitigation potential", "co-benefits"],
        notion_deferred=["city-specific per-action tCO2e estimate"],
        unsupported_claims=["Do not provide quantified tCO2e unless source facts contain it."],
    )


def _build_city_fit_input(context: ReportContext) -> ReportChapterInput:
    """
    Build City Fit chapter input.

    Implements fit signal from ranking feasibility and live city/mitigation
    feasibility indicators. Supports/limits are derived only from available rows.
    """
    condition_tables = _city_fit_table_rows(context)
    return _chapter_input(
        key="city_fit",
        title=chapter_title("city_fit", context.language),
        context=context,
        facts={
            "action": _action_identity_facts(context),
            "city_context": _city_fit_city_context(
                context.mitigation_feasibility, context.city.city_context
            ),
            "mitigation_feasibility": _city_fit_mitigation_facts(
                context.mitigation_feasibility, context.language
            ),
            **condition_tables,
        },
        source_refs=["city", "mitigation_feasibility"],
        limitations=["Local implementation capacity has not been assessed."],
        notion_coverage=[
            "overall fit",
            "supporting local conditions",
            "limiting local conditions",
            "mixed local conditions when contribution signs conflict",
        ],
        notion_deferred=[],
        unsupported_claims=["Do not infer local conditions beyond available indicators."],
    )


def _build_policy_backing_input(context: ReportContext) -> ReportChapterInput:
    """
    Build Policy Backing chapter input.

    Implements policy alignment using live policy evidence. Rows without
    document, signal relation, and a usable excerpt are omitted; missing page
    numbers are kept as an explicit limitation.
    """
    return _chapter_input(
        key="policy_backing",
        title=chapter_title("policy_backing", context.language),
        context=context,
        facts={
            "action": _action_identity_facts(context),
            "ranking": _policy_ranking_facts(context),
            "policy_score": _policy_facts(context.policy_score),
        },
        source_refs=["ranking_snapshot", "policy_scores"],
        limitations=_policy_limitations(context),
        notion_coverage=[
            "policy alignment label",
            "finding and document counts",
            "document, page, signal type, and policy excerpt",
        ],
        notion_deferred=["exact verbatim page citations where upstream evidence lacks them"],
        unsupported_claims=[
            "Do not quote policy text not present in policy_evidence.",
            "Do not treat omitted or incomplete excerpts as standalone quotations.",
        ],
    )


def _build_legal_mandate_input(context: ReportContext) -> ReportChapterInput:
    """
    Build Legal Mandate & Delivery chapter input.

    Implements legal verdict, ownership, restrictions, and references from
    snapshot/live legal evidence. Permits and SEIA remain out of scope.
    """
    return _chapter_input(
        key="legal_mandate_delivery",
        title=chapter_title("legal_mandate_delivery", context.language),
        context=context,
        facts={
            "action": _action_identity_facts(context),
            "ranking": _legal_ranking_facts(context),
            "legal": _legal_facts(context),
        },
        source_refs=_legal_source_refs(context),
        limitations=_legal_limitations(context),
        notion_coverage=[
            "legal verdict",
            "ownership",
            "restrictions",
            "legal basis",
            "municipal versus external delivery roles",
            "delivery lead",
        ],
        notion_deferred=["permits", "SEIA applicability"],
        unsupported_claims=[
            "Do not soften a blocked legal verdict.",
            "Do not claim authority over private or external assets when "
            "authority_scope is municipal_assets_only.",
            "Do not claim unrestricted direct authority when authority_scope "
            "is qualified or unspecified.",
        ],
    )


def _build_financing_pathway_input(context: ReportContext) -> ReportChapterInput:
    """
    Build Financing, Precedents & Pathway chapter input.

    Implements funding route, named opportunities, comparable projects, and
    conservative next steps from live financial and legal evidence. Catalogue
    opportunities are labeled contextual; comparable projects carry upstream
    action-match rationale.
    """
    return _chapter_input(
        key="financing_precedents_pathway",
        title=chapter_title("financing_precedents_pathway", context.language),
        context=context,
        facts={
            "action": _action_identity_facts(context),
            "financial_feasibility": _financial_facts(context),
            "legal": _legal_delivery_facts(context),
            "opportunities": _finance_opportunity_facts(
                context, report_category="current"
            ),
            "opportunities_to_monitor": _finance_opportunity_facts(
                context, report_category="monitor"
            ),
            "comparable_projects": _comparable_project_facts(context),
        },
        source_refs=_finance_source_refs(context),
        limitations=_finance_limitations(context),
        notion_coverage=[
            "funding outlook",
            "funding route",
            "named finance opportunities",
            "named comparable projects",
            "suggested pathway",
        ],
        notion_deferred=[],
        unsupported_claims=[
            "Do not invent named funds or precedents.",
            "Do not describe a contextual finance candidate as a confirmed action match.",
            "Do not invent a comparable-project connection beyond match_rationale.",
        ],
    )


def _build_sources_input(context: ReportContext) -> ReportChapterInput:
    """
    Build Where The Information Comes From chapter input.

    Implements source list, analyst figures, limitations, and deferred-method
    notes. It should not expose raw debug artifacts as user-facing citations.
    """
    source_limitations = _source_chapter_limitations(context)
    return _chapter_input(
        key="sources_assumptions",
        title=chapter_title("sources_assumptions", context.language),
        context=context,
        facts={
            "source_summary": _source_summary_facts(context),
            "categorized_sources": _categorized_source_facts(context),
            "analyst_figures": _analyst_figure_facts(context),
            "limitations": source_limitations,
        },
        source_refs=[
            "ranking_snapshot",
            "city",
            "action_pathways",
            "policy_scores",
            "legal",
            "mitigation_feasibility",
            "financial_feasibility",
            "finance_catalogues",
        ],
        limitations=source_limitations,
        notion_coverage=["source list", "analyst figures", "limitations"],
        notion_deferred=[],
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
        terminology=chapter_terms(key, context.language),
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
        "name": _localized_action_value(context, "name"),
        "type": context.action.action_type,
        "description": _localized_action_value(context, "description"),
        "intervention_summary": _localized_action_value(
            context, "intervention_summary"
        ),
        "outcome_summary": _localized_action_value(context, "outcome_summary"),
        "intervention_type": context.action.intervention_type,
        "action_role": context.action.action_role,
        "investment_cost": context.action.investment_cost,
        "implementation_timeline": context.action.implementation_timeline,
        "co_benefits": _reader_co_benefit_facts(
            context.action.co_benefits, context.language
        ),
    }


def _action_identity_facts(context: ReportContext) -> dict[str, Any]:
    """Return minimal selected-action identity for chapters that need a subject."""
    return {
        "action_id": context.action.action_id,
        "name": _localized_action_value(context, "name"),
    }


def _localized_action_value(context: ReportContext, field: str) -> str | None:
    """Select one action-pathway field in the active report language."""
    localized_by_field = {
        "name": context.action.name_i18n,
        "description": context.action.description_i18n,
        "intervention_summary": context.action.intervention_summary_i18n,
        "outcome_summary": context.action.outcome_summary_i18n,
    }
    fallback_by_field = {
        "name": context.action.action_name,
        "description": context.action.description,
        "intervention_summary": context.action.intervention_summary,
        "outcome_summary": context.action.outcome_summary,
    }
    return localized_source_value(
        language=context.language,
        localized=localized_by_field[field],
        fallback=fallback_by_field[field],
    )


def _snapshot_signal_rows(context: ReportContext) -> list[dict[str, Any]]:
    """Build the six evidence rows required by the Snapshot signal table."""
    policy = _policy_facts(context.policy_score) or {}
    legal = _legal_facts(context) or {}
    ownership_description = legal.get("ownership_description") or {}
    restrictions_description = legal.get("restrictions_description") or {}
    financial = _financial_facts(context) or {}
    project_count = financial.get("comparable_project_count")
    emissions = context.action.emissions
    impact_band = emissions.get("impact_text") if isinstance(emissions, dict) else None
    localized_impact_band = translate_term(
        "score_labels", impact_band, context.language
    )
    local_fit_score = (
        context.mitigation_feasibility.action_score
        if context.mitigation_feasibility is not None
        else None
    )
    score = (
        local_fit_score
        if local_fit_score is not None
        else context.ranked_action.feasibility_score
    )
    city_fit_label = _reader_score_label(score, context.language)
    city_fit_detail = (
        f"The local feasibility assessment rates this action as "
        f"{str(city_fit_label).lower()}."
        if local_fit_score is not None and city_fit_label
        else (
            f"The combined feasibility assessment rates this action as "
            f"{str(city_fit_label).lower()}."
            if city_fit_label
            else "A city-fit rating is not available."
        )
    )
    city_fit_refs = (
        ["mitigation_feasibility"]
        if local_fit_score is not None
        else ["ranking_snapshot"]
    )
    policy_refs = ["policy_scores"] if context.policy_score is not None else []
    if context.legal_assessment is not None:
        legal_refs = ["legal"]
    elif legal:
        legal_refs = ["ranking_snapshot"]
    else:
        legal_refs = []
    funding_refs: list[str] = []
    if context.financial_feasibility is not None:
        funding_refs.append("financial_feasibility")
    elif financial:
        funding_refs.append("ranking_snapshot")
    if context.finance_opportunities:
        funding_refs.append("finance_catalogues")
    track_refs: list[str] = []
    if project_count is not None:
        track_refs.append(
            "financial_feasibility"
            if context.financial_feasibility is not None
            else "ranking_snapshot"
        )
    if context.comparable_projects:
        track_refs.append("finance_catalogues")
    # Prefer the conservative municipal-asset summary when that split is assessed.
    # Otherwise keep the localized ownership or restrictions text from the source.
    if legal.get("authority_scope") == AUTHORITY_SCOPE_MUNICIPAL_ASSETS_ONLY:
        legal_detail = legal.get("authority_scope_summary")
    else:
        legal_detail = (
            legal.get("ownership_description")
            or legal.get("restrictions_description")
            or legal.get("authority_scope_summary")
        )
    return [
        {
            "what_we_checked": translate_term(
                "signal_labels", "climate_benefit", context.language
            ),
            "reading": localized_impact_band or context.ranked_action.impact_score,
            "detail": (
                f"The prioritization rates the action's direct emissions-reduction "
                f"potential as {impact_band}."
                if impact_band
                else "A qualitative climate-benefit rating is not available."
            ),
            "source_refs": ["ranking_snapshot", "action_pathways"],
        },
        {
            "what_we_checked": translate_term(
                "signal_labels", "city_fit", context.language
            ),
            "reading": city_fit_label,
            "detail": city_fit_detail,
            "source_refs": city_fit_refs,
        },
        {
            "what_we_checked": translate_term(
                "signal_labels", "policy_backing", context.language
            ),
            "reading": translate_term(
                "score_labels", policy.get("policy_support_category"), context.language
            ) or policy.get(
                "policy_support_score"
            ),
            "detail": _policy_snapshot_detail(policy),
            "source_refs": policy_refs,
        },
        {
            "what_we_checked": translate_term(
                "signal_labels", "legal_room", context.language
            ),
            "reading": translate_term(
                "score_labels", legal.get("verdict_category"), context.language
            ),
            "detail": legal_detail,
            "source_refs": legal_refs,
        },
        {
            "what_we_checked": translate_term(
                "signal_labels", "funding", context.language
            ),
            "reading": translate_term(
                "finance_routes", financial.get("route"), context.language
            ),
            "detail": _reader_finance_detail(financial),
            "source_refs": funding_refs,
        },
        {
            "what_we_checked": translate_term(
                "signal_labels", "track_record", context.language
            ),
            "reading": project_count,
            "detail": (
                f"{project_count} comparable projects are recorded, with "
                f"{len(context.comparable_projects)} examples in the financing chapter."
                if project_count is not None and context.comparable_projects
                else None
            ),
            "source_refs": track_refs,
        },
    ]


def _policy_snapshot_detail(policy: dict[str, Any]) -> str | None:
    """Summarize policy evidence counts for one Snapshot table cell."""
    findings = policy.get("n_findings")
    documents = policy.get("n_docs")
    if findings is None and documents is None:
        return None
    return f"{findings or 0} findings across {documents or 0} documents."


def _reader_finance_detail(financial: dict[str, Any]) -> str | None:
    """Translate a finance route into a concise municipal-reader explanation."""
    route = _normalized_text(financial.get("route"))
    route_details = {
        "needs technical assistance": (
            "The main identified need is delivery capacity and technical support."
        ),
        "self-deliverable": (
            "This is considered a low-capital action the city can deliver directly."
        ),
        "own-budget feasible": (
            "The action is considered feasible within the city's budget and capacity."
        ),
    }
    return route_details.get(route) or financial.get("reason")


def _snapshot_limitations(context: ReportContext) -> list[str]:
    """Return Snapshot gaps that cannot be represented by its signal rows."""
    limitations = [
        "City-level quantified emissions reductions are not available for this action."
    ]
    if not context.comparable_projects:
        limitations.append("Named comparable projects are not available.")
    return limitations


def _ask_facts(context: ReportContext) -> dict[str, Any]:
    """Return evidence-derived inputs for the Snapshot chapter's ask line."""
    return {
        "summary": _ask_summary(context),
        "support_needed": _ask_support_needed(context),
        "action_to_take_forward": (
            _localized_action_value(context, "intervention_summary")
            or _localized_action_value(context, "outcome_summary")
            or _localized_action_value(context, "name")
        ),
        "legal_position": _ask_legal_position(context),
    }


def _ask_summary(context: ReportContext) -> str:
    """Build a one-line ask that avoids unsupported finance or legal claims."""
    action_phrase = _ask_action_phrase(context)
    support_needed = _ask_support_needed(context)
    legal_position = _ask_legal_position(context)

    ask = f"{support_needed} to {action_phrase}"
    if legal_position:
        ask = f"{ask}, {legal_position}"
    return f"{ask}."


def _ask_action_phrase(context: ReportContext) -> str:
    """Return an action phrase suitable after `to` in the ask sentence."""
    summary = (
        _localized_action_value(context, "intervention_summary")
        or _localized_action_value(context, "outcome_summary")
        or _localized_action_value(context, "name")
        or ""
    ).strip()
    lowered = summary[0].lower() + summary[1:] if summary else summary

    if lowered.startswith("the city will "):
        return lowered.removeprefix("the city will ").rstrip(".")
    if lowered.startswith("the city "):
        city_action = lowered.removeprefix("the city ")
        return _to_imperative_action_phrase(city_action).rstrip(".")
    return lowered.rstrip(".")


def _to_imperative_action_phrase(value: str) -> str:
    """Convert common third-person action summaries into ask-ready verbs."""
    verb_replacements = {
        "installs ": "install ",
        "deploys ": "deploy ",
        "implements ": "implement ",
        "upgrades ": "upgrade ",
        "develops ": "develop ",
        "creates ": "create ",
        "establishes ": "establish ",
        "promotes ": "promote ",
        "supports ": "support ",
        "enables ": "enable ",
    }
    for source, replacement in verb_replacements.items():
        if value.startswith(source):
            return f"{replacement}{value[len(source):]}"
    return value


def _ask_support_needed(context: ReportContext) -> str:
    """Map finance route evidence to a conservative support request."""
    route = _normalized_text(
        context.financial_feasibility.route if context.financial_feasibility else None
    )
    if route == "self-deliverable":
        return "Support the city"
    if route == "own-budget feasible":
        return "Support municipal delivery"
    if route == "needs technical assistance":
        return "Provide technical assistance"
    if route and "finance" in route:
        return "Provide financing support"
    return "Support the city"


def _ask_legal_position(context: ReportContext) -> str | None:
    """Return a legal qualifier only when legal facts can support it."""
    legal = _legal_facts(context)
    if legal is None:
        return None
    scope = legal.get("authority_scope")
    if legal.get("verdict_category") == "enabled":
        if scope == AUTHORITY_SCOPE_MUNICIPAL_ASSETS_ONLY:
            return (
                "an action the city can lead directly on municipal assets, while "
                "private or external assets require facilitation rather than "
                "direct authority"
            )
        if scope == AUTHORITY_SCOPE_FULL_DIRECT:
            return "an action the city is legally empowered to lead directly"
        return "an action the legal review finds the city can pursue"
    if legal.get("verdict_category") == "conditional":
        return "subject to the conditions identified in the legal review"
    if legal.get("verdict_category") == "blocked":
        return "but the legal review finds that the city cannot proceed alone"
    return None


def _normalized_text(value: str | None) -> str | None:
    """Normalize optional source labels for deterministic comparisons."""
    if value is None:
        return None
    normalized = value.strip().lower()
    return normalized or None


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
        "impact_category": (
            context.action.emissions.get("impact_text")
            if isinstance(context.action.emissions, dict)
            else None
        ),
    }


def _impact_evidence_facts(context: ReportContext) -> dict[str, Any]:
    """Return qualitative impact indicators without exposing scoring mechanics."""
    impact = context.ranked_action.evidence_summary.impact
    return {
        "inventory_relevance": (
            "The action relates to a subsector represented in the city's emissions "
            "inventory."
            if impact.matched_city_subsector_keys_count > 0
            else "No direct match to a recorded city emissions subsector was identified."
        ),
        "implementation_timeline": context.action.implementation_timeline,
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


def _action_impact_facts(context: ReportContext) -> dict[str, Any]:
    """Return action fields needed for qualitative impact prose."""
    return {
        "action_id": context.action.action_id,
        "name": _localized_action_value(context, "name"),
        "description": _localized_action_value(context, "description"),
        "intervention_summary": _localized_action_value(
            context, "intervention_summary"
        ),
        "outcome_summary": _localized_action_value(context, "outcome_summary"),
        "implementation_timeline": context.action.implementation_timeline,
        "emissions": context.action.emissions,
        "co_benefits": _reader_co_benefit_facts(
            context.action.co_benefits, context.language
        ),
    }


def _reader_co_benefit_facts(
    co_benefits: dict[str, dict[str, Any]],
    language: str,
) -> list[dict[str, Any]]:
    """Return co-benefits with stable reader labels and source-backed detail."""
    return [
        {
            "label": translate_term("co_benefits", key, language),
            "relationship": payload.get("impact_relationship"),
            "strength": translate_term(
                "score_labels", payload.get("impact_text"), language
            ),
        }
        for key, payload in co_benefits.items()
    ]


def _city_fit_mitigation_facts(
    mitigation: ActionMitigationFeasibilityScoreRecord | None,
    language: str,
) -> dict[str, Any] | None:
    """Return the dedicated local-fit result without raw indicator mappings."""
    if mitigation is None:
        return None

    return {
        "action_id": mitigation.action_id,
        "overall_fit": _reader_score_label(mitigation.action_score, language),
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
        for row in _city_fit_condition_rows(mitigation.breakdown)
        if row.get("city_indicator")
    }
    if not referenced_indicators:
        return []

    compact_rows: list[dict[str, Any]] = []
    for row in city_context:
        attribute_name = row.get("attribute_name")
        if (
            attribute_name not in referenced_indicators
            or row.get("attribute_value") is None
        ):
            continue
        compact_rows.append(
            {
                key: value
                for key, value in row.items()
                if key
                in {
                    "attribute_name",
                    "attribute_value",
                    "attribute_units",
                    "attribute_category",
                    "data_source",
                }
            }
        )
    return compact_rows


def _city_fit_condition_rows(
    breakdown: dict[str, Any],
) -> list[dict[str, Any]]:
    """Extract compact non-neutral city-indicator contribution rows."""
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
                if (
                    not isinstance(contribution, int | float)
                    or isinstance(contribution, bool)
                    or contribution == 0
                ):
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


def _city_fit_table_rows(
    context: ReportContext,
) -> dict[str, list[dict[str, Any]]]:
    """
    Group city indicators into supporting, limiting, and mixed table rows.

    Each measured city indicator appears at most once. Its implication preserves
    every distinct upstream criterion while neutral contributions are omitted.
    """
    tables: dict[str, list[dict[str, Any]]] = {
        "supporting_conditions": [],
        "limiting_conditions": [],
        "mixed_conditions": [],
    }
    mitigation = context.mitigation_feasibility
    if mitigation is None:
        return tables
    city_rows = {
        row.get("attribute_name"): row
        for row in context.city.city_context
        if row.get("attribute_name")
    }
    grouped_conditions: dict[str, list[dict[str, Any]]] = {}
    for condition in _city_fit_condition_rows(mitigation.breakdown):
        city_indicator = condition.get("city_indicator")
        if not isinstance(city_indicator, str) or not city_indicator:
            continue
        grouped_conditions.setdefault(city_indicator, []).append(condition)

    for city_indicator, conditions in grouped_conditions.items():
        city_row = city_rows.get(city_indicator, {})
        if city_row.get("attribute_value") is None:
            continue

        positive_dimensions = _city_fit_dimension_labels(
            conditions, positive=True, language=context.language
        )
        negative_dimensions = _city_fit_dimension_labels(
            conditions, positive=False, language=context.language
        )
        if positive_dimensions and negative_dimensions:
            table_key = "mixed_conditions"
        elif positive_dimensions:
            table_key = "supporting_conditions"
        else:
            table_key = "limiting_conditions"

        tables[table_key].append(
            {
                "indicator": translate_term(
                    "indicators", city_indicator, context.language
                ),
                "display_value": _city_fit_display_value(
                    indicator=city_indicator,
                    value=city_row.get("attribute_value"),
                    unit=city_row.get("attribute_units"),
                    category=city_row.get("attribute_category")
                    or conditions[0].get("category"),
                    language=context.language,
                ),
                "implication": _city_fit_implication(
                    positive_dimensions=positive_dimensions,
                    negative_dimensions=negative_dimensions,
                ),
            }
        )
    return tables


def _city_fit_display_value(
    *, indicator: Any, value: Any, unit: Any, category: Any, language: str
) -> str:
    """Format one city indicator without adding unsupported units."""
    if value is None:
        return ""
    elif isinstance(value, int) and not isinstance(value, bool):
        rendered_value = f"{value:,}"
    elif isinstance(value, float):
        if value.is_integer():
            rendered_value = f"{int(value):,}"
        else:
            rendered_value = f"{value:,.2f}".rstrip("0").rstrip(".")
    else:
        rendered_value = str(value)

    normalized_indicator = str(indicator or "").lower()
    normalized_unit = str(unit or "").strip().lower()
    if normalized_unit == "percent":
        rendered_value = f"{rendered_value}%"
    elif unit:
        rendered_value = f"{rendered_value} {unit}"
    elif value is not None and normalized_indicator.endswith(("_rate", "_share")):
        rendered_value = f"{rendered_value}%"
    elif value is not None and normalized_indicator == "home_ownership":
        rendered_value = f"{rendered_value}%"

    localized_category = translate_term("score_labels", category, language)
    return (
        f"{rendered_value} ({localized_category.lower()})"
        if localized_category
        else rendered_value
    )


def _city_fit_dimension_labels(
    conditions: list[dict[str, Any]], *, positive: bool, language: str
) -> list[str]:
    """Return distinct reader labels for one contribution sign."""
    labels: list[str] = []
    for condition in conditions:
        contribution = condition.get("contribution")
        if not isinstance(contribution, int | float) or (contribution > 0) != positive:
            continue
        label = _reader_dimension_label(
            condition.get("global_indicator") or condition.get("dimension"),
            language,
        ).lower()
        if label and label not in labels:
            labels.append(label)
    return labels


def _city_fit_implication(
    *, positive_dimensions: list[str], negative_dimensions: list[str]
) -> str:
    """Describe all supporting and limiting effects of one city indicator."""
    prefix = "In the feasibility assessment, this indicator"
    positive_text = _natural_language_list(positive_dimensions)
    negative_text = _natural_language_list(negative_dimensions)
    if positive_text and negative_text:
        return f"{prefix} strengthens {positive_text}, but weakens {negative_text}."
    if positive_text:
        return f"{prefix} strengthens {positive_text}."
    return f"{prefix} weakens {negative_text}."


def _natural_language_list(values: list[str]) -> str:
    """Join distinct labels as an English list for later report translation."""
    if len(values) < 2:
        return "".join(values)
    if len(values) == 2:
        return " and ".join(values)
    return f"{', '.join(values[:-1])}, and {values[-1]}"


def _reader_dimension_label(value: Any, language: str) -> str:
    """Return a plain-language label for a feasibility dimension."""
    return translate_term("feasibility_dimensions", value or "overall_fit", language) or ""


def _reader_score_label(score: float | None, language: str) -> str | None:
    """Translate a normalized score into a stable reader-facing strength label."""
    if score is None:
        return None
    if score >= 0.8:
        return translate_term("score_labels", "strong", language)
    if score >= 0.6:
        return translate_term("score_labels", "good", language)
    if score >= 0.4:
        return translate_term("score_labels", "moderate", language)
    if score >= 0.2:
        return translate_term("score_labels", "limited", language)
    return translate_term("score_labels", "very_limited", language)


def _policy_facts(
    policy_score: ActionPolicyScoreRecord | None,
) -> dict[str, Any] | None:
    """Return policy facts, keeping only reader-safe excerpts in the table."""
    if policy_score is None:
        return None
    selected_evidence, omitted_incomplete = _select_policy_evidence(
        policy_score.policy_evidence
    )
    return {
        "action_id": policy_score.action_id,
        "policy_support_score": policy_score.policy_support_score,
        "policy_support_category": policy_score.policy_support_category,
        "best_relevance": policy_score.best_relevance,
        "n_findings": policy_score.n_findings,
        "n_docs": policy_score.n_docs,
        "sum_strength": policy_score.sum_strength,
        "policy_evidence": selected_evidence,
        "omitted_incomplete_evidence_count": omitted_incomplete,
        "evidence_selection_note": _policy_evidence_selection_note(
            available_evidence=len(policy_score.policy_evidence),
            selected_evidence=len(selected_evidence),
            omitted_incomplete=omitted_incomplete,
        ),
    }


def _select_policy_evidence(
    evidence_rows: list[dict[str, Any]], *, limit: int = 5
) -> tuple[list[dict[str, Any]], int]:
    """Select the strongest reader-safe policy excerpts for a display table."""
    reader_safe_rows = [
        row for row in evidence_rows if _policy_evidence_has_minimum_context(row)
    ]
    omitted_incomplete = len(evidence_rows) - len(reader_safe_rows)

    def priority(row: dict[str, Any]) -> tuple[int, int, int, float, int]:
        """Rank direct commitments ahead of broader governance context."""
        evidence_rank = row.get("evidence_rank")
        return (
            0 if row.get("signal_type") == "action" else 1,
            0 if row.get("signal_relation") == "commits" else 1,
            0 if row.get("explicitness") == "explicit" else 1,
            -float(row.get("evidence_strength") or 0),
            int(evidence_rank) if isinstance(evidence_rank, int) else 10_000,
        )

    return sorted(reader_safe_rows, key=priority)[:limit], omitted_incomplete


def _policy_evidence_has_minimum_context(row: dict[str, Any]) -> bool:
    """Return whether one policy row can be shown as a structured excerpt."""
    document_name = row.get("document_name")
    signal_relation = row.get("signal_relation")
    has_document = isinstance(document_name, str) and bool(document_name.strip())
    has_signal = isinstance(signal_relation, str) and bool(signal_relation.strip())
    return has_document and has_signal and _usable_policy_excerpt(row.get("evidence_text"))


def _usable_policy_excerpt(value: Any) -> bool:
    """Return whether excerpt text has readable content beyond empty markup."""
    if not isinstance(value, str):
        return False
    stripped = (
        value.replace("<br>", " ")
        .replace("<br/>", " ")
        .replace("<br />", " ")
        .replace("<p>", " ")
        .replace("</p>", " ")
        .strip()
    )
    return bool(stripped)


def _policy_evidence_selection_note(
    *,
    available_evidence: int,
    selected_evidence: int,
    omitted_incomplete: int,
) -> str:
    """Explain how aggregate policy counts relate to the displayed excerpts."""
    omitted_note = (
        f" {omitted_incomplete} incomplete excerpts were omitted because they "
        "lacked document, signal, or quotation context."
        if omitted_incomplete
        else ""
    )
    if available_evidence - omitted_incomplete <= selected_evidence:
        return (
            f"The table presents the {selected_evidence} detailed excerpts available "
            "for review, ordered with direct commitments before broader governance "
            f"provisions.{omitted_note}"
        )
    return (
        f"The {selected_evidence} excerpts below were selected from "
        f"{available_evidence} detailed references, prioritizing direct commitments, "
        f"explicit references, and stronger evidence.{omitted_note}"
    )


def _policy_limitations(context: ReportContext) -> list[str]:
    """Return limitations relevant to the Policy Backing chapter."""
    if context.policy_score is None:
        return ["Policy-backing information is not available for this action."]
    if not context.policy_score.policy_evidence:
        return ["Detailed policy excerpts are not available for this action."]
    selected_evidence, omitted_incomplete = _select_policy_evidence(
        context.policy_score.policy_evidence
    )
    limitations: list[str] = []
    if omitted_incomplete:
        limitations.append(
            "Some policy excerpts were omitted because they lacked document, signal, "
            "or quotation context."
        )
    if not selected_evidence:
        limitations.append("Detailed policy excerpts are not available for this action.")
    elif any(row.get("page") in (None, "") for row in selected_evidence):
        limitations.append(
            "Some displayed policy excerpts do not include a page number."
        )
    return limitations


def _legal_facts(context: ReportContext) -> dict[str, Any] | None:
    """Return legal facts including a conservative authority-scope classification."""
    if context.legal_assessment is not None:
        legal = context.legal_assessment
        facts = {
            "action_id": legal.action_id,
            "country_code": legal.country_code,
            "gpc_sector": translate_term(
                "gpc_sectors", legal.gpc_sector, context.language
            ),
            "verdict_category": legal.verdict_category,
            "verdict_score": legal.verdict_score,
            "ownership_category": legal.ownership_category,
            "ownership_score": legal.ownership_score,
            "ownership_description": localized_source_value(
                language=context.language,
                localized=legal.ownership_description_i18n,
                fallback=legal.ownership_description,
            ),
            "restrictions_category": legal.restrictions_category,
            "restrictions_score": legal.restrictions_score,
            "restrictions_description": localized_source_value(
                language=context.language,
                localized=legal.restrictions_description_i18n,
                fallback=legal.restrictions_description,
            ),
            "legal_justification": localized_source_value(
                language=context.language,
                localized=legal.legal_justification_i18n,
                fallback=legal.legal_justification,
            ),
            "legal_references": legal.legal_references,
        }
        facts.update(
            _authority_scope_fields(
                facts,
                extra_source_text=_authority_scope_source_text(
                    {
                        "ownership_description": legal.ownership_description,
                        "restrictions_description": legal.restrictions_description,
                        "legal_justification": legal.legal_justification,
                    }
                ),
            )
        )
        return facts

    snapshot_legal = context.ranked_action.evidence_summary.feasibility.legal
    if not snapshot_legal.assessment_present:
        return None
    facts = {
        "verdict_category": snapshot_legal.verdict_category,
        "component_score": snapshot_legal.component_score,
        "assessment_present": snapshot_legal.assessment_present,
        "assessment_missing": snapshot_legal.assessment_missing,
    }
    facts.update(_authority_scope_fields(facts))
    return facts


def _authority_scope_fields(
    legal: dict[str, Any], extra_source_text: str = ""
) -> dict[str, Any]:
    """Return structured authority-scope fields derived from legal source text."""
    scope = _classify_authority_scope(legal, extra_source_text=extra_source_text)
    return {
        "authority_scope": scope,
        "authority_scope_summary": _authority_scope_summary(legal, scope),
    }


def _classify_authority_scope(
    legal: dict[str, Any], extra_source_text: str = ""
) -> str:
    """Classify authority from limitation semantics, not from private-actor mentions."""
    verdict = legal.get("verdict_category")
    if verdict == "blocked":
        return AUTHORITY_SCOPE_BLOCKED

    source_text = " ".join(
        part
        for part in (_authority_scope_source_text(legal), extra_source_text)
        if part.strip()
    )
    ownership_enabled = legal.get("ownership_category") == "enabled"
    if (
        verdict == "enabled"
        and ownership_enabled
        and _source_text_contains_any(
            source_text, _AUTHORITY_SCOPE_MUNICIPAL_LIMIT_MARKERS
        )
    ):
        return AUTHORITY_SCOPE_MUNICIPAL_ASSETS_ONLY
    if _source_text_contains_any(source_text, _AUTHORITY_SCOPE_QUALIFIED_MARKERS):
        return AUTHORITY_SCOPE_QUALIFIED
    if (
        verdict == "enabled"
        and ownership_enabled
        and _source_text_contains_any(source_text, _AUTHORITY_SCOPE_FULL_DIRECT_MARKERS)
    ):
        return AUTHORITY_SCOPE_FULL_DIRECT
    if verdict in {"enabled", "conditional"}:
        return AUTHORITY_SCOPE_QUALIFIED
    return AUTHORITY_SCOPE_UNSPECIFIED


def _authority_scope_source_text(legal: dict[str, Any]) -> str:
    """Join ownership, restriction, and justification text used for scope classification."""
    return " ".join(
        value
        for value in (
            legal.get("ownership_description"),
            legal.get("restrictions_description"),
            legal.get("legal_justification"),
        )
        if isinstance(value, str) and value.strip()
    )


def _source_text_contains_any(text: str, markers: tuple[str, ...]) -> bool:
    """Return whether lowercase source text contains any classification marker."""
    lowered = text.lower()
    return any(marker in lowered for marker in markers)


def _authority_scope_summary(legal: dict[str, Any], scope: str) -> str | None:
    """Return a conservative reader-facing authority-scope sentence."""
    if scope == AUTHORITY_SCOPE_MUNICIPAL_ASSETS_ONLY:
        return (
            "The legal review supports direct municipal authority over municipal "
            "assets. Private or external assets require facilitation rather than "
            "direct authority."
        )
    if scope == AUTHORITY_SCOPE_QUALIFIED:
        return (
            "The legal review finds that the city can pursue this action, but "
            "the assessed asset scope is limited or conditional."
        )
    return legal.get("ownership_description")


def _legal_delivery_facts(context: ReportContext) -> dict[str, Any] | None:
    """Return reader-ready legal delivery facts for Financing and Pathway."""
    legal = _legal_facts(context)
    if legal is None:
        return None
    verdict = legal.get("verdict_category")
    restrictions = legal.get("restrictions_description")
    scope = legal.get("authority_scope")

    if scope == AUTHORITY_SCOPE_MUNICIPAL_ASSETS_ONLY:
        delivery_position = (
            "The legal review finds that the municipality can lead delivery "
            "directly on municipal assets. For private or external assets, the "
            "city facilitates rather than exercising direct authority."
        )
    elif scope == AUTHORITY_SCOPE_FULL_DIRECT:
        delivery_position = (
            "The legal review finds that the municipality can lead delivery directly."
        )
    elif verdict == "enabled":
        delivery_position = "The legal review finds that the city can pursue this action."
    elif verdict == "conditional":
        delivery_position = (
            "The city can pursue this action subject to the conditions identified in "
            "the legal review."
        )
    elif verdict == "blocked":
        delivery_position = "The legal review finds that the city cannot proceed alone."
    else:
        delivery_position = "The city's legal delivery position is not yet confirmed."

    if scope == AUTHORITY_SCOPE_MUNICIPAL_ASSETS_ONLY:
        additional_approval = (
            "The legal review identifies no additional decision-making approval for "
            "municipal assets. Private or external assets remain outside direct "
            "municipal authority."
        )
    elif scope == AUTHORITY_SCOPE_FULL_DIRECT:
        additional_approval = (
            "The legal review identifies no additional decision-making approval."
        )
    elif restrictions:
        additional_approval = restrictions
    else:
        additional_approval = "Any required external approval is not yet confirmed."

    return {
        "delivery_position": delivery_position,
        "additional_approval": additional_approval,
        "authority_scope": scope,
        "authority_scope_summary": legal.get("authority_scope_summary"),
        "unresolved_checks": [
            "Whether permits or environmental review requirements apply has not been "
            "confirmed."
        ],
    }


def _legal_source_refs(context: ReportContext) -> list[str]:
    """Return source refs for the legal chapter based on live/fallback facts."""
    if context.legal_assessment is not None:
        return ["legal"]
    return ["ranking_snapshot"]


def _legal_limitations(context: ReportContext) -> list[str]:
    """Return limitations relevant to the Legal Mandate chapter."""
    limitations = [
        "Whether permits or environmental review requirements apply has not been "
        "confirmed."
    ]
    if context.legal_assessment is None:
        limitations.append("A legal review is not available for this action.")
    return limitations


def _financial_facts(context: ReportContext) -> dict[str, Any] | None:
    """Return financing facts needed for finance-pathway prose."""
    if context.financial_feasibility is not None:
        financial = context.financial_feasibility
        return {
            "action_id": financial.action_id,
            "sector": translate_term(
                "gpc_sectors", financial.sector, context.language
            ),
            "financial_feasibility": financial.financial_feasibility,
            "route": translate_term(
                "finance_routes", financial.route, context.language
            ),
            "reason": financial.reason,
            "comparable_project_count": financial.inputs.get("evidence", {}).get(
                "n_existing_projects"
            ),
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
        "route": translate_term(
            "finance_routes", snapshot_financial.route, context.language
        ),
        "reason": snapshot_financial.reason,
    }


def _finance_opportunity_facts(
    context: ReportContext, *, report_category: str
) -> list[dict[str, Any]]:
    """Return programme facts labeled as contextual catalogue candidates."""
    rows: list[dict[str, Any]] = []
    for opportunity in context.finance_opportunities:
        if opportunity.report_category != report_category:
            continue
        row = {
            "opportunity_name": opportunity.opportunity_name,
            "funder_name": opportunity.funder_name,
            "instrument": opportunity.instrument,
            "status": translate_term(
                "finance_statuses", opportunity.status, context.language
            ),
            "status_as_of": opportunity.status_as_of,
            "recurrence": translate_term(
                "finance_statuses", opportunity.recurrence, context.language
            ),
            "source_url": opportunity.source_url,
            "amount_note": opportunity.amount_note,
            "city_application": [
                translate_term("application_routes", route, context.language)
                for route in opportunity.city_application
            ],
            "match_class": FINANCE_MATCH_CONTEXTUAL,
            "match_label": "Contextual candidate",
        }
        if report_category == "monitor":
            row["reader_note"] = (
                "This is a contextual sector/route candidate, not a confirmed match "
                "to this action. This programme is closed but may recur. It is not "
                "currently available; eligibility should be checked if it reopens."
            )
        else:
            row["reader_note"] = (
                "This is a contextual sector/route candidate, not a confirmed match "
                "to this action. Current terms and eligibility for this action should "
                "be confirmed."
            )
        rows.append(row)
    return rows


def _comparable_project_facts(context: ReportContext) -> list[dict[str, Any]]:
    """Return named precedent rows localized to the requested language."""
    rows: list[dict[str, Any]] = []
    for project in context.comparable_projects:
        name = project.project_name_i18n.get(context.language) or project.project_name
        match_facts = _comparable_project_match_facts(
            project, selected_action_id=context.action.action_id
        )
        rows.append(
            {
                "project_name": name,
                "jurisdiction": project.jurisdiction,
                "lifecycle_stage": translate_term(
                    "lifecycle_stages", project.lifecycle_stage, context.language
                ),
                "funding_summary": _project_funding_summary(project),
                "selected_action_id": context.action.action_id,
                **match_facts,
            }
        )
    return rows


def _comparable_project_match_facts(
    project: ClimateFinanceProjectRecord, *, selected_action_id: str
) -> dict[str, Any]:
    """Derive a reader-safe match rationale from upstream action_matches only."""
    selected_matches = [
        match
        for match in project.action_matches
        if isinstance(match, dict)
        and _normalize_key(str(match.get("action_id") or ""))
        == _normalize_key(selected_action_id)
    ]
    selected_match = selected_matches[0] if selected_matches else None
    confidence_value = (
        selected_match.get("confidence") if selected_match is not None else None
    )
    confidence = (
        str(confidence_value).strip()
        if confidence_value not in (None, "")
        else None
    )
    if confidence:
        rationale = (
            f"Matched to selected action {selected_action_id} with confidence "
            f"{confidence}."
        )
        match_class = FINANCE_MATCH_DIRECT
    elif selected_match is not None:
        rationale = (
            f"Matched to selected action {selected_action_id}, but no match "
            "confidence is available."
        )
        match_class = FINANCE_MATCH_DIRECT
    else:
        rationale = (
            f"Returned for selected action {selected_action_id}, but no "
            "action-match confidence is available."
        )
        match_class = FINANCE_MATCH_UNKNOWN
    return {
        "match_class": match_class,
        "match_confidence": confidence,
        "match_rationale": rationale,
    }


def _project_funding_summary(project: ClimateFinanceProjectRecord) -> str | None:
    """Format precedent funding without displaying units when no amount exists."""
    parts: list[str] = []
    if project.funding_channel:
        parts.append(project.funding_channel.replace("_", " ").capitalize())
    for source in project.funding_sources:
        funder = source.get("funder_name") or source.get("source_label")
        cycle = source.get("cycle")
        amount = source.get("amount")
        amount_unit = source.get("amount_unit")
        source_text = str(funder) if funder else ""
        if cycle:
            source_text = f"{source_text} ({cycle})" if source_text else str(cycle)
        if amount is not None:
            rendered_amount = f"{amount:,}" if isinstance(amount, (int, float)) else str(amount)
            source_text = " ".join(
                part for part in (source_text, rendered_amount, amount_unit) if part
            )
        if source_text:
            parts.append(source_text)
    return "; ".join(parts) or None


def _finance_limitations(context: ReportContext) -> list[str]:
    """Return precise finance gaps after selected-action detail enrichment."""
    limitations: list[str] = []
    if not context.finance_opportunities:
        limitations.append("Named financing opportunities are not available.")
    else:
        limitations.append(
            "The programmes listed are contextual sector/route candidates, not "
            "confirmed matches to this action. Current terms and eligibility must "
            "still be confirmed."
        )
    if not context.comparable_projects:
        limitations.append("Named comparable projects are not available.")
    return limitations


def _finance_source_refs(context: ReportContext) -> list[str]:
    """Return source refs for the financing chapter based on live/fallback facts."""
    refs = (
        ["financial_feasibility"]
        if context.financial_feasibility is not None
        else ["ranking_snapshot"]
    )
    if context.legal_assessment is not None:
        refs.append("legal")
    if context.finance_opportunities or context.comparable_projects:
        refs.append("finance_catalogues")
    return refs


def _source_summary_facts(context: ReportContext) -> dict[str, Any]:
    """Return the report basis without exposing local diagnostic artifacts."""
    return {
        "prioritization": {
            "locode": context.locode,
            "selected_action_id": context.action_id,
            "rank": context.ranked_action.rank,
            "returned_action_count": len(
                context.prioritization_city_result.ranked_actions
            ),
        },
        "staleness_evaluated": False,
    }


def _source_chapter_limitations(context: ReportContext) -> list[str]:
    """Return evidence limitations without treating optional links as data gaps."""
    return list(context.limitations)


def _categorized_source_facts(context: ReportContext) -> list[dict[str, Any]]:
    """Build user-facing source references grouped by evidence category."""
    rows: list[dict[str, Any]] = [
        {
            "category": "Prioritization",
            "name": "City action prioritization analysis for this report",
        }
    ]
    city_metadata = context.source_metadata.get("city", {})
    for source in city_metadata.get("upstream_datasources", []):
        rows.append(
            {
                "category": "City fit",
                "name": source.get("dataset_name") or source.get("publisher_name"),
                "publisher": source.get("publisher_name"),
                "url": _public_url(
                    source.get("source_url"),
                    source.get("dataset_url"),
                    source.get("publisher_url"),
                ),
            }
        )
    if context.policy_score is not None:
        document_sources = {
            (
                evidence.get("document_name"),
                _public_url(evidence.get("link")),
            )
            for evidence in context.policy_score.policy_evidence
            if evidence.get("document_name")
        }
        rows.extend(
            {
                "category": "Policy backing",
                "name": document_name,
                "url": document_url,
            }
            for document_name, document_url in sorted(
                document_sources, key=lambda item: str(item[0])
            )
        )
    if context.legal_assessment is not None:
        rows.extend(
            {"category": "Legal mandate", "name": reference}
            for reference in context.legal_assessment.legal_references
        )
    rows.extend(
        {
            "category": "Financing",
            "name": opportunity.opportunity_name,
            "publisher": opportunity.funder_name,
            "url": opportunity.source_url,
        }
        for opportunity in context.finance_opportunities
    )
    finance_catalogues = context.source_metadata.get("finance_catalogues", {})
    for source in finance_catalogues.get("projects", {}).get("datasources", []):
        rows.append(
            {
                "category": "Precedents",
                "name": source.get("dataset_name"),
                "publisher": source.get("publisher_name"),
                "url": _public_url(
                    source.get("dataset_url"), source.get("publisher_url")
                ),
            }
        )
    return _deduplicate_source_rows(rows)


def _deduplicate_source_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop repeated source rows while preserving category order."""
    unique_rows: list[dict[str, Any]] = []
    seen: set[tuple[Any, Any, Any]] = set()
    for row in rows:
        key = (row.get("category"), row.get("name"), row.get("url"))
        if key in seen:
            continue
        seen.add(key)
        unique_rows.append(row)
    return unique_rows


def _public_url(*values: Any) -> str | None:
    """Return the first available HTTP(S) URL suitable for report rendering."""
    for value in values:
        if isinstance(value, str) and value.startswith(("https://", "http://")):
            return value
    return None


def _analyst_figure_facts(context: ReportContext) -> dict[str, Any]:
    """Expose report scores, verdict components, and scoring mappings separately."""
    policy = _policy_facts(context.policy_score) or {}
    legal = _legal_facts(context) or {}
    financial = _financial_facts(context) or {}
    emissions = context.action.emissions if isinstance(context.action.emissions, dict) else {}
    ranking_metadata = context.prioritization_city_result.metadata.model_dump(mode="json")
    return _round_reader_numbers({
        "scores": {
            **_score_facts(context),
            "policy_support_score": policy.get("policy_support_score"),
            "policy_support_category": policy.get("policy_support_category"),
            "mitigation_feasibility_score": (
                context.mitigation_feasibility.action_score
                if context.mitigation_feasibility
                else None
            ),
            "financial_feasibility_score": _first_present(
                financial.get("financial_feasibility"),
                financial.get("component_score"),
            ),
            "legal_verdict": legal.get("verdict_category"),
            "legal_verdict_score": _first_present(
                legal.get("verdict_score"), legal.get("component_score")
            ),
            "legal_ownership_score": legal.get("ownership_score"),
            "legal_restrictions_score": legal.get("restrictions_score"),
            "ghg_reduction_band": emissions.get("impact_text"),
        },
        "ranking_weights": ranking_metadata.get("weights"),
        "banding_and_component_rules": {
            "impact_band_multipliers": IMPACT_TEXT_TO_MULTIPLIER,
            "timeline_scores": IMPACT_TIMELINE_TO_SCORE,
            "impact_component_weights": {
                "emissions_reduction": IMPACT_WEIGHT_REDUCTION_SHARE,
                "timeline": IMPACT_WEIGHT_TIMELINE,
            },
            "alignment_component_weights": {
                "policy": ALIGNMENT_WEIGHT_POLICY,
                "sector": ALIGNMENT_WEIGHT_SECTOR,
                "co_benefit": ALIGNMENT_WEIGHT_OTHER,
                "timeframe": ALIGNMENT_WEIGHT_TIMEFRAME,
            },
            "feasibility_component_weights": {
                "legal": FEASIBILITY_WEIGHT_LEGAL,
                "mitigation_feasibility": FEASIBILITY_WEIGHT_MITIGATION_FEASIBILITY,
                "financial_feasibility": FEASIBILITY_WEIGHT_FINANCIAL_FEASIBILITY,
            },
        },
    })


def _round_reader_numbers(value: Any) -> Any:
    """Round report-only numeric facts while preserving source data internally."""
    if isinstance(value, dict):
        return {key: _round_reader_numbers(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_round_reader_numbers(item) for item in value]
    if isinstance(value, float):
        return round(value, 3)
    return value


def _first_present(*values: Any) -> Any:
    """Return the first non-null value while preserving valid zeroes."""
    return next((value for value in values if value is not None), None)


def _unique_source_refs(*ref_groups: list[Any]) -> list[str]:
    """Return source refs in first-seen order, skipping empty values."""
    refs: list[str] = []
    for group in ref_groups:
        for ref in group:
            if isinstance(ref, str) and ref and ref not in refs:
                refs.append(ref)
    return refs


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
