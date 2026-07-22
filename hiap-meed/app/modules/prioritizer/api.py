"""FastAPI routes for MEED prioritization."""

from __future__ import annotations

import logging
import os
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from app.modules.prioritizer.scoring_config import resolve_top_n
from app.modules.prioritizer.internal_models import CityActivityRow, CityEmissionsContext
from app.modules.prioritizer.models import (
    CityActionReportApiRequest,
    CityActionReportApiResponse,
    CityActionReportMetadata,
    CityActionReportSourceContext,
    ExplanationTranslationApiRequest,
    ExplanationTranslationApiResponse,
    ExplanationTranslationResult,
    ExclusionPreviewApiRequest,
    ExclusionPreviewApiResponse,
    ExclusionPreviewCityResult,
    FrontendCityInput,
    PrioritizationResponse,
    PrioritizerApiCityResult,
    PrioritizerApiRequest,
    PrioritizerApiResponse,
)
from app.modules.prioritizer.orchestrator import run_prioritization
from app.modules.prioritizer.report_artifacts import (
    write_city_action_report_error_artifacts,
    write_output_plan_llm_artifacts,
    write_output_plan_markdown_artifact,
)
from app.modules.prioritizer.report_context import build_chapter_inputs
from app.modules.prioritizer.services.report_context_enrichment import (
    build_report_context_with_live_enrichment,
)
from app.modules.prioritizer.services.report_generation import (
    aggregate_localized_chapters,
    generate_output_plan_chapters,
)
from app.modules.prioritizer.utils.subsector_mapping import (
    normalize_gpc_reference_to_subsector_key,
)
from app.modules.prioritizer.services.exclusion_resolution import (
    resolve_exclusion_preview_with_diagnostics,
)
from app.modules.prioritizer.services.translation import translate_explanations
from app.services.data_clients import (
    ApiActionFinancialFeasibilityScoresDataApiClient,
    ApiActionPathwaysDataApiClient,
    ApiActionMitigationFeasibilityScoresDataApiClient,
    ApiCityDataApiClient,
    ApiLegalDataApiClient,
    S3LegalDataApiClient,
    ApiActionPolicyScoresDataApiClient,
    MockActionFinancialFeasibilityScoresDataApiClient,
    MockActionPathwaysDataApiClient,
    MockActionMitigationFeasibilityScoresDataApiClient,
    MockCityDataApiClient,
    MockLegalDataApiClient,
    MockActionPolicyScoresDataApiClient,
    get_action_financial_feasibility_scores_data_api_client,
    get_action_mitigation_feasibility_scores_data_api_client,
    get_action_pathways_data_api_client,
    get_city_data_api_client,
    get_legal_data_api_client,
    get_action_policy_scores_data_api_client,
)
from app.services.http_client import UpstreamApiError
from app.utils.artifacts import ArtifactWriter
from app.utils.mlflow_logging import (
    log_metrics,
    log_params,
    start_run,
)


logger = logging.getLogger(__name__)

router = APIRouter(tags=["prioritization"])


def _error_payload(request_id: str, message: str) -> dict[str, str]:
    """Build a consistent JSON error body including the request ID."""
    return {"request_id": request_id, "error": message}


def _upstream_error_payload(
    request_id: str,
    error: UpstreamApiError,
) -> dict[str, str | int]:
    """Build a consistent JSON error body for upstream dependency failures."""
    payload: dict[str, str | int] = {
        "request_id": request_id,
        "error": error.message,
    }
    if error.upstream_status_code is not None:
        payload["upstream_status_code"] = error.upstream_status_code
    if error.url is not None:
        payload["upstream_url"] = error.url
    return payload


def _extract_city_emissions_context(city_input: FrontendCityInput) -> CityEmissionsContext:
    """Build normalized subsector totals plus preserved activity rows."""
    emissions_by_subsector_key: dict[str, float] = {}
    activity_rows: list[CityActivityRow] = []

    # Normalize each GPC bucket to the active `sector.subsector` join key.
    for gpc_ref, gpc_entry in city_input.cityEmissionsData.gpcData.items():
        sector_subsector_key = normalize_gpc_reference_to_subsector_key(gpc_ref)
        gpc_total = 0.0
        for activity in gpc_entry.activities:
            if activity.activityType is None:
                logger.warning(
                    "City activity row missing activityType locode=%s gpc_reference_number=%s",
                    city_input.locode,
                    gpc_ref,
                )
            if activity.totalEmissions is not None:
                gpc_total += activity.totalEmissions
            activity_rows.append(
                CityActivityRow(
                    gpc_reference_number=gpc_ref,
                    sector_subsector_key=sector_subsector_key,
                    activity_type=activity.activityType,
                    activity_value=activity.activityValue,
                    activity_unit=activity.activityUnit,
                    total_emissions=activity.totalEmissions,
                    total_emissions_unit=activity.totalEmissionsUnit,
                    data_source=activity.dataSource,
                    notation_key=activity.notationKey,
                )
            )
        emissions_by_subsector_key[sector_subsector_key] = (
            emissions_by_subsector_key.get(sector_subsector_key, 0.0) + gpc_total
        )

    return CityEmissionsContext(
        emissions_by_subsector_key=emissions_by_subsector_key,
        activity_rows=activity_rows,
    )


def _normalize_requested_languages(requested_languages: list[str]) -> list[str]:
    """Normalize requested languages while preserving caller intent order."""
    normalized_languages: list[str] = []
    for language in requested_languages:
        normalized = language.strip().lower()
        if normalized and normalized not in normalized_languages:
            normalized_languages.append(normalized)
    if not normalized_languages:
        return ["en"]
    return normalized_languages


def _safe_artifact_name(value: str) -> str:
    """Convert a free-form identifier like locode into a stable artifact stem."""
    return value.strip().lower().replace(" ", "_").replace("/", "_")


def _country_code_from_locode(locode: str) -> str:
    """Return the first two locode characters as the caller country prefix."""
    normalized_locode = locode.strip().upper()
    if len(normalized_locode) < 2:
        raise ValueError(f"Locode `{locode}` must contain a 2-letter country prefix")
    return normalized_locode[:2]


def _mlflow_source_params() -> dict[str, str]:
    """Return the active source-config params logged on MLflow request runs."""
    return {
        "city_data_source": os.getenv("HIAP_MEED_CITY_DATA_SOURCE", "api"),
        "legal_data_source": os.getenv("HIAP_MEED_LEGAL_DATA_SOURCE", "s3"),
        "action_pathways_data_source": os.getenv(
            "HIAP_MEED_ACTION_PATHWAYS_DATA_SOURCE", "api"
        ),
        "action_policy_scores_data_source": os.getenv(
            "HIAP_MEED_ACTION_POLICY_SCORES_DATA_SOURCE", "api"
        ),
        "action_mitigation_feasibility_scores_data_source": os.getenv(
            "HIAP_MEED_ACTION_MITIGATION_FEASIBILITY_SCORES_DATA_SOURCE",
            "api",
        ),
        "action_financial_feasibility_scores_data_source": os.getenv(
            "HIAP_MEED_ACTION_FINANCIAL_FEASIBILITY_SCORES_DATA_SOURCE",
            "api",
        ),
    }


def _mlflow_environment_tag() -> str:
    """Return the environment tag used on MLflow runs."""
    return os.getenv("MLFLOW_ENVIRONMENT", "dev").strip() or "dev"


@router.post(
    "/v1/prioritize/exclusions/preview",
    response_model=ExclusionPreviewApiResponse,
    summary="Preview proposed action exclusions",
    description=(
        "Evaluates raw exclusion preferences before ranking and returns a preview "
        "of the actions that would likely be excluded. This endpoint does not run "
        "the full prioritization pipeline and does not require confirmed "
        "`excludedActionIds` yet."
    ),
    responses={
        200: {
            "description": "Preview completed. Response contains proposed exclusions and warnings per city."
        },
        422: {"description": "Validation error in the request envelope or exclusion values."},
        500: {"description": "Internal server error while building the exclusion preview."},
    },
)
def preview_exclusions(
    request: ExclusionPreviewApiRequest,
    action_pathways_data_api_client: MockActionPathwaysDataApiClient | ApiActionPathwaysDataApiClient = Depends(
        get_action_pathways_data_api_client
    ),
) -> ExclusionPreviewApiResponse:
    """Preview proposed exclusions from raw exclusion preferences."""
    request_trace_id = request.meta.requestId
    internal_request_id = uuid4()
    artifact_writer = ArtifactWriter(
        request_id=internal_request_id,
        request_kind="exclusion_preview",
    )

    with start_run(
        run_name="exclusion_preview_request",
        tags={
            "service": "hiap-meed",
            "environment": _mlflow_environment_tag(),
            "request_kind": "exclusion_preview",
            "endpoint": "/v1/prioritize/exclusions/preview",
            "frontend_request_id": request_trace_id,
            "internal_request_id": internal_request_id,
            "backend_consumer": request.meta.backendConsumer,
            "upstream_provider": request.meta.upstreamProvider,
        },
        params={
            **_mlflow_source_params(),
            "total_records": request.meta.totalRecords,
        },
    ):
        try:
            logger.info(
                "Exclusion preview request received frontend_request_id=%s internal_request_id=%s cities=%s",
                request_trace_id,
                internal_request_id,
                len(request.requestData.cityDataList),
            )
            artifact_writer.write_run_file(
                "input_snapshot.json",
                {
                    "frontend_request_id": request_trace_id,
                    "city_data_list": [
                        city_input.model_dump(mode="json")
                        for city_input in request.requestData.cityDataList
                    ],
                },
            )
            action_pathways_fetch_result = action_pathways_data_api_client.list_actions()
            actions = action_pathways_fetch_result.actions
            fetch_actions_event_index = artifact_writer.write_event(
                "fetch_actions.completed",
                {
                    "total_actions": len(actions),
                    "source_metadata": action_pathways_fetch_result.source_metadata,
                },
            )
            artifact_writer.write_step_detail(
                "fetch_actions",
                {
                    "total_actions": len(actions),
                    "action_ids": sorted(action.action_id for action in actions),
                    "source_metadata": action_pathways_fetch_result.source_metadata,
                    "upstream_meta": action_pathways_fetch_result.upstream_meta,
                    "warning": action_pathways_fetch_result.warning,
                },
                event_index=fetch_actions_event_index,
                event_type="fetch_actions.completed",
            )
            results: list[ExclusionPreviewCityResult] = []
            for city_input in request.requestData.cityDataList:
                city_result, diagnostics = resolve_exclusion_preview_with_diagnostics(
                    city_input=city_input,
                    actions=actions,
                )
                results.append(city_result)
                preview_event_index = artifact_writer.write_event(
                    "exclusion_preview_city.completed",
                    {
                        "locode": city_input.locode,
                        "proposed_exclusions": city_result.exclusionSummary.totalProposed,
                        "warnings_count": len(city_result.warnings),
                    },
                )
                safe_locode = _safe_artifact_name(city_input.locode)
                artifact_writer.write_step_detail(
                    f"exclusion_preview_{safe_locode}",
                    diagnostics,
                    event_index=preview_event_index,
                    event_type="exclusion_preview_city.completed",
                )
            logger.info(
                "Exclusion preview request completed frontend_request_id=%s internal_request_id=%s cities=%s",
                request_trace_id,
                internal_request_id,
                len(results),
            )
            response = ExclusionPreviewApiResponse(results=results)
            total_proposed_exclusions = sum(
                result.exclusionSummary.totalProposed for result in results
            )
            artifact_writer.write_event(
                "response_summary.completed",
                {
                    "cities": len(results),
                    "total_proposed_exclusions": total_proposed_exclusions,
                },
            )
            artifact_writer.write_run_file(
                "response_full.json",
                response.model_dump(mode="json"),
            )
            artifact_writer.write_manifest(
                {
                    "counts": {
                        "cities": len(results),
                        "total_proposed_exclusions": total_proposed_exclusions,
                    },
                    "artifact_pointers": {
                        "summary_events": "summary.jsonl",
                        "input_snapshot": "input_snapshot.json",
                        "response_full": "response_full.json",
                    },
                }
            )
            log_metrics(
                {
                    "cities": len(results),
                    "total_actions": len(actions),
                    "total_proposed_exclusions": total_proposed_exclusions,
                }
            )
            return response
        except ValueError as error:
            logger.warning(
                "Invalid exclusion preview request request_id=%s error=%s",
                request_trace_id,
                error,
            )
            raise HTTPException(
                status_code=422,
                detail=_error_payload(request_trace_id, str(error)),
            ) from error
        except UpstreamApiError as error:
            logger.warning(
                "Exclusion preview upstream dependency failed request_id=%s status_code=%s error=%s",
                request_trace_id,
                error.status_code,
                error,
            )
            raise HTTPException(
                status_code=error.status_code,
                detail=_upstream_error_payload(request_trace_id, error),
            ) from error
        except Exception as error:
            logger.exception("Exclusion preview failed request_id=%s", request_trace_id)
            raise HTTPException(
                status_code=500,
                detail=_error_payload(request_trace_id, "Internal server error"),
            ) from error


@router.post(
    "/v1/prioritize",
    response_model=PrioritizerApiResponse,
    summary="Run action prioritization synchronously",
    description=(
        "Ranks actions for one or more cities from the caller request envelope. "
        "When `createExplanations=true`, the backend first generates canonical "
        "English explanations and then translates them into any additionally "
        "requested languages."
    ),
    responses={
        200: {
            "description": "Ranking completed. Response contains ranked actions, metadata, and optional warnings."
        },
        422: {"description": "Validation error in the request envelope or prioritization inputs."},
        500: {"description": "Internal server error while running the prioritization pipeline."},
    },
)
def prioritize(
    request: PrioritizerApiRequest,
    city_data_api_client: MockCityDataApiClient | ApiCityDataApiClient = Depends(
        get_city_data_api_client
    ),
    action_pathways_data_api_client: MockActionPathwaysDataApiClient | ApiActionPathwaysDataApiClient = Depends(
        get_action_pathways_data_api_client
    ),
    legal_data_api_client: (
        MockLegalDataApiClient | ApiLegalDataApiClient | S3LegalDataApiClient
    ) = Depends(
        get_legal_data_api_client
    ),
    action_policy_scores_data_api_client: (
        MockActionPolicyScoresDataApiClient | ApiActionPolicyScoresDataApiClient
    ) = Depends(
        get_action_policy_scores_data_api_client
    ),
    action_mitigation_feasibility_scores_data_api_client: (
        MockActionMitigationFeasibilityScoresDataApiClient
        | ApiActionMitigationFeasibilityScoresDataApiClient
    ) = Depends(get_action_mitigation_feasibility_scores_data_api_client),
    action_financial_feasibility_scores_data_api_client: (
        MockActionFinancialFeasibilityScoresDataApiClient
        | ApiActionFinancialFeasibilityScoresDataApiClient
    ) = Depends(get_action_financial_feasibility_scores_data_api_client),
) -> PrioritizerApiResponse:
    """
    Prioritize actions from the caller request envelope.

    This endpoint is synchronous because the orchestrator and data clients
    are synchronous; FastAPI runs sync routes in a threadpool to avoid
    blocking the event loop.
    """

    # Get the request trace ID from the request envelope.
    request_trace_id = request.meta.requestId

    with start_run(
        run_name="prioritization_request",
        tags={
            "service": "hiap-meed",
            "environment": _mlflow_environment_tag(),
            "request_kind": "prioritization",
            "endpoint": "/v1/prioritize",
            "frontend_request_id": request_trace_id,
            "backend_consumer": request.meta.backendConsumer,
            "upstream_provider": request.meta.upstreamProvider,
        },
        params={
            **_mlflow_source_params(),
            "total_records": request.meta.totalRecords,
            "requested_top_n": request.requestData.topN,
            "create_explanations": int(request.requestData.createExplanations),
            "requested_languages_count": len(request.requestData.requestedLanguages),
        },
    ):
        try:
            logger.info(
                "Prioritization request received frontend_request_id=%s cities=%s requested_top_n=%s create_explanations=%s",
                request_trace_id,
                len(request.requestData.cityDataList),
                request.requestData.topN,
                request.requestData.createExplanations,
            )
            requested_languages = _normalize_requested_languages(
                request.requestData.requestedLanguages
            )
            results: list[PrioritizerApiCityResult] = []
            for city_input in request.requestData.cityDataList:
                logger.info(
                    "Prioritization city started frontend_request_id=%s locode=%s",
                    request_trace_id,
                    city_input.locode,
                )
                per_city_result = _run_for_city_input(
                    city_input=city_input,
                    requested_top_n=request.requestData.topN,
                    city_data_api_client=city_data_api_client,
                    action_pathways_data_api_client=action_pathways_data_api_client,
                    legal_data_api_client=legal_data_api_client,
                    action_policy_scores_data_api_client=action_policy_scores_data_api_client,
                    action_mitigation_feasibility_scores_data_api_client=(
                        action_mitigation_feasibility_scores_data_api_client
                    ),
                    action_financial_feasibility_scores_data_api_client=(
                        action_financial_feasibility_scores_data_api_client
                    ),
                    create_explanations=request.requestData.createExplanations,
                    requested_languages=requested_languages,
                    frontend_request_id=request_trace_id,
                )
                # Echo frontend request ID for response correlation in clients/logs.
                per_city_result.metadata.frontend_request_id = request_trace_id
                results.append(
                    PrioritizerApiCityResult(
                        locode=city_input.locode,
                        ranked_action_ids=per_city_result.ranked_action_ids,
                        ranked_actions=per_city_result.ranked_actions,
                        removed_actions=per_city_result.removed_actions,
                        metadata=per_city_result.metadata,
                        warnings=per_city_result.warnings,
                    )
                )

            logger.info(
                "Prioritization request completed frontend_request_id=%s cities=%s",
                request_trace_id,
                len(results),
            )
            log_metrics(
                {
                    "cities": len(results),
                    "requested_languages": len(requested_languages),
                    "create_explanations": int(
                        request.requestData.createExplanations
                    ),
                }
            )
            return PrioritizerApiResponse(results=results)
        except ValueError as error:
            logger.warning(
                "Invalid prioritization request request_id=%s error=%s",
                request_trace_id,
                error,
            )
            raise HTTPException(
                status_code=422,
                detail=_error_payload(request_trace_id, str(error)),
            ) from error
        except UpstreamApiError as error:
            logger.warning(
                "Prioritization upstream dependency failed request_id=%s status_code=%s error=%s",
                request_trace_id,
                error.status_code,
                error,
            )
            raise HTTPException(
                status_code=error.status_code,
                detail=_upstream_error_payload(request_trace_id, error),
            ) from error
        except Exception as error:
            logger.exception("Prioritization failed request_id=%s", request_trace_id)
            raise HTTPException(
                status_code=500,
                detail=_error_payload(request_trace_id, "Internal server error"),
            ) from error


@router.post(
    "/v1/reports/output-plan",
    response_model=CityActionReportApiResponse,
    summary="Generate one City Action Report output plan",
    description=(
        "Generates one JSON-with-Markdown-chapters output plan for one selected "
        "ranked action. The endpoint is stateless: callers must provide the "
        "original prioritization request/response snapshot plus one locode, "
        "one actionId, and a non-empty language list."
    ),
    responses={
        200: {"description": "Output plan generated for the selected action."},
        422: {"description": "Validation error in request or prioritization snapshot."},
        500: {"description": "Internal server error while generating the output plan."},
    },
)
def generate_output_plan(
    request: CityActionReportApiRequest,
    city_data_api_client: MockCityDataApiClient | ApiCityDataApiClient = Depends(
        get_city_data_api_client
    ),
    action_pathways_data_api_client: MockActionPathwaysDataApiClient | ApiActionPathwaysDataApiClient = Depends(
        get_action_pathways_data_api_client
    ),
    legal_data_api_client: (
        MockLegalDataApiClient | ApiLegalDataApiClient | S3LegalDataApiClient
    ) = Depends(get_legal_data_api_client),
    action_policy_scores_data_api_client: (
        MockActionPolicyScoresDataApiClient | ApiActionPolicyScoresDataApiClient
    ) = Depends(get_action_policy_scores_data_api_client),
    action_mitigation_feasibility_scores_data_api_client: (
        MockActionMitigationFeasibilityScoresDataApiClient
        | ApiActionMitigationFeasibilityScoresDataApiClient
    ) = Depends(get_action_mitigation_feasibility_scores_data_api_client),
    action_financial_feasibility_scores_data_api_client: (
        MockActionFinancialFeasibilityScoresDataApiClient
        | ApiActionFinancialFeasibilityScoresDataApiClient
    ) = Depends(get_action_financial_feasibility_scores_data_api_client),
) -> CityActionReportApiResponse:
    """
    Generate one stateless output plan from a prioritization snapshot.

    The route validates that the selected city/action belong to the supplied
    snapshot, refetches live source context, then generates isolated report
    chapters independently in every requested language for that single action.
    """
    request_trace_id = request.meta.requestId
    internal_request_id = uuid4()
    internal_request_id_str = str(internal_request_id)
    artifact_writer = ArtifactWriter(
        request_id=internal_request_id,
        request_kind="city_action_report",
    )

    with start_run(
        run_name="city_action_report_request",
        tags={
            "service": "hiap-meed",
            "environment": _mlflow_environment_tag(),
            "request_kind": "city_action_report",
            "endpoint": "/v1/reports/output-plan",
            "frontend_request_id": request_trace_id,
            "internal_request_id": internal_request_id_str,
            "backend_consumer": request.meta.backendConsumer,
            "upstream_provider": request.meta.upstreamProvider,
            "locode": request.requestData.locode,
            "action_id": request.requestData.actionId,
            "language": request.requestData.language,
        },
        params={
            **_mlflow_source_params(),
            "total_records": request.meta.totalRecords,
            "debug_context_only": int(request.requestData.debugContextOnly),
        },
    ):
        try:
            logger.info(
                "City action report request received frontend_request_id=%s internal_request_id=%s locode=%s action_id=%s language=%s debug_context_only=%s",
                request_trace_id,
                internal_request_id_str,
                request.requestData.locode,
                request.requestData.actionId,
                request.requestData.language,
                request.requestData.debugContextOnly,
            )
            artifact_writer.write_run_file(
                "input_snapshot.json",
                request.model_dump(mode="json"),
            )

            # Step 1: validate snapshot and enrich the selected action context.
            report_context = build_report_context_with_live_enrichment(
                request=request,
                city_data_api_client=city_data_api_client,
                action_pathways_data_api_client=action_pathways_data_api_client,
                legal_data_api_client=legal_data_api_client,
                action_policy_scores_data_api_client=action_policy_scores_data_api_client,
                action_mitigation_feasibility_scores_data_api_client=(
                    action_mitigation_feasibility_scores_data_api_client
                ),
                action_financial_feasibility_scores_data_api_client=(
                    action_financial_feasibility_scores_data_api_client
                ),
            )
            artifact_writer.write_run_file(
                "report_context.json",
                report_context.model_dump(mode="json"),
            )

            # Step 2: localize and generate each language independently.
            chapter_inputs_by_language = {}
            generation_by_language = {}
            llm_io_by_language = {}
            for language in report_context.requested_languages:
                localized_context = report_context.model_copy(
                    update={"language": language}
                )
                chapter_inputs = build_chapter_inputs(localized_context)
                chapter_inputs_by_language[language] = chapter_inputs
                generation_result = generate_output_plan_chapters(
                    chapter_inputs=chapter_inputs,
                    use_llm=not request.requestData.debugContextOnly,
                )
                generation_by_language[language] = generation_result.chapters
                llm_io_by_language[language] = generation_result.llm_io

            artifact_writer.write_run_file(
                "chapter_inputs.json",
                {
                    language: [
                        chapter.model_dump(mode="json") for chapter in chapter_inputs
                    ]
                    for language, chapter_inputs in chapter_inputs_by_language.items()
                },
            )
            write_output_plan_llm_artifacts(
                artifact_writer=artifact_writer,
                llm_io={"languages": llm_io_by_language},
            )

            # Step 3: aggregate only after every requested language is complete.
            localized_chapters = aggregate_localized_chapters(
                languages=report_context.requested_languages,
                chapters_by_language=generation_by_language,
            )

            response = CityActionReportApiResponse(
                locode=report_context.locode,
                action_id=report_context.action_id,
                language=report_context.requested_languages,
                chapters=localized_chapters,
                metadata=CityActionReportMetadata(
                    frontend_request_id=request_trace_id,
                    internal_request_id=internal_request_id_str,
                    source_prioritization_request_id=(
                        report_context.prioritization_request.meta.requestId
                    ),
                    source_context=CityActionReportSourceContext(
                        staleness_notes=[
                            "Ranking-specific context came from the frontend snapshot. Additional report context was fetched live by the backend.",
                            "Staleness checks require product-defined comparison rules and are not fully implemented in this first slice.",
                        ],
                    ),
                    required_sources_ok=True,
                    limitations=report_context.limitations,
                ),
            )
            response_payload = response.model_dump(mode="json")
            write_output_plan_markdown_artifact(
                artifact_writer=artifact_writer,
                response=response,
            )
            artifact_writer.write_event(
                "city_action_report.completed",
                {
                    "locode": response.locode,
                    "action_id": response.action_id,
                    "language": response.language,
                    "chapters": len(response.chapters),
                    "debug_context_only": request.requestData.debugContextOnly,
                },
            )
            artifact_writer.write_run_file("response_full.json", response_payload)
            artifact_writer.write_manifest(
                {
                    "counts": {
                        "chapters": len(response.chapters),
                        "limitations": len(response.metadata.limitations),
                    },
                    "artifact_pointers": {
                        "summary_events": "summary.jsonl",
                        "input_snapshot": "input_snapshot.json",
                        "report_context": "report_context.json",
                        "chapter_inputs": "chapter_inputs.json",
                        "output_plan_llm_io": "llm/output_plan_io.json",
                        "output_plan_markdown": [
                            f"output_plan.{language}.md"
                            for language in response.language
                        ],
                        "response_full": "response_full.json",
                    },
                }
            )
            log_metrics(
                {
                    "chapters": len(response.chapters),
                    "limitations": len(response.metadata.limitations),
                }
            )
            return response
        except ValueError as error:
            logger.warning(
                "Invalid city action report request request_id=%s error=%s",
                request_trace_id,
                error,
            )
            write_city_action_report_error_artifacts(
                artifact_writer=artifact_writer,
                request_trace_id=request_trace_id,
                error_type="validation_error",
                error_message=str(error),
            )
            raise HTTPException(
                status_code=422,
                detail=_error_payload(request_trace_id, str(error)),
            ) from error
        except UpstreamApiError as error:
            logger.warning(
                "City action report upstream dependency failed request_id=%s status_code=%s error=%s",
                request_trace_id,
                error.status_code,
                error,
            )
            write_city_action_report_error_artifacts(
                artifact_writer=artifact_writer,
                request_trace_id=request_trace_id,
                error_type="upstream_api_error",
                error_message=error.message,
                status_code=error.status_code,
            )
            raise HTTPException(
                status_code=error.status_code,
                detail=_upstream_error_payload(request_trace_id, error),
            ) from error
        except Exception as error:
            logger.exception("City action report failed request_id=%s", request_trace_id)
            write_city_action_report_error_artifacts(
                artifact_writer=artifact_writer,
                request_trace_id=request_trace_id,
                error_type="internal_error",
                error_message=str(error),
                status_code=500,
            )
            raise HTTPException(
                status_code=500,
                detail=_error_payload(request_trace_id, "Internal server error"),
            ) from error


@router.post(
    "/v1/explanations/translate",
    response_model=ExplanationTranslationApiResponse,
    summary="Translate canonical explanations synchronously",
    description=(
        "Accepts canonical English explanations and returns translations for the "
        "requested non-English target languages without rerunning prioritization. "
        "The endpoint is stateless: callers must provide the source explanation "
        "text in the request body."
    ),
    responses={
        200: {
            "description": "Translation completed. Response contains translated explanations and aggregated warnings."
        },
        422: {"description": "Validation error in the request envelope, source language, or target languages."},
        500: {"description": "Internal server error while translating explanations."},
    },
)
def translate_ranked_action_explanations(
    request: ExplanationTranslationApiRequest,
) -> ExplanationTranslationApiResponse:
    """Translate canonical English explanations without rerunning prioritization."""
    request_trace_id = request.meta.requestId
    internal_request_id = uuid4()
    artifact_writer = ArtifactWriter(
        request_id=internal_request_id,
        request_kind="explanation_translation",
    )

    with start_run(
        run_name="explanation_translation_request",
        tags={
            "service": "hiap-meed",
            "environment": _mlflow_environment_tag(),
            "request_kind": "explanation_translation",
            "endpoint": "/v1/explanations/translate",
            "frontend_request_id": request_trace_id,
            "internal_request_id": internal_request_id,
            "backend_consumer": request.meta.backendConsumer,
            "upstream_provider": request.meta.upstreamProvider,
        },
        params={
            "source_language": request.requestData.sourceLanguage,
            "target_languages_count": len(request.requestData.targetLanguages),
            "ranked_actions_count": len(request.requestData.rankedActions),
        },
    ):
        try:
            logger.info(
                "Explanation translation request received frontend_request_id=%s internal_request_id=%s actions=%s target_languages=%s",
                request_trace_id,
                internal_request_id,
                len(request.requestData.rankedActions),
                request.requestData.targetLanguages,
            )
            input_snapshot_payload = {
                "frontend_request_id": request_trace_id,
                "source_language": request.requestData.sourceLanguage,
                "target_languages": request.requestData.targetLanguages,
                "ranked_actions": [
                    row.model_dump(mode="json")
                    for row in request.requestData.rankedActions
                ],
            }
            artifact_writer.write_run_file("input_snapshot.json", input_snapshot_payload)

            canonical_explanations_by_action_id = {
                row.actionId: row.canonicalExplanation
                for row in request.requestData.rankedActions
            }
            translations_by_action_id, warnings, llm_io_payload = translate_explanations(
                canonical_explanations_by_action_id=canonical_explanations_by_action_id,
                target_languages=request.requestData.targetLanguages,
            )
            llm_input_payload = llm_io_payload.get("llm_input")
            if isinstance(llm_input_payload, dict):
                prompt_text = llm_input_payload.get("prompt_text")
                if isinstance(prompt_text, str):
                    prompt_file = artifact_writer.write_run_text_file(
                        "llm/explanation_translations_prompt.txt", prompt_text
                    )
                    llm_input_payload["prompt_text_file"] = (
                        prompt_file.relative_to(artifact_writer.run_dir).as_posix()
                        if prompt_file is not None
                        else "llm/explanation_translations_prompt.txt"
                    )
                    llm_input_payload["prompt_text_characters"] = len(prompt_text)
                    llm_input_payload.pop("prompt_text", None)

            llm_io_file = artifact_writer.write_run_file(
                "llm/explanation_translations_io.json", llm_io_payload
            )
            translations = [
                ExplanationTranslationResult(
                    actionId=action_id,
                    explanations=translations_by_action_id.get(action_id, {}),
                )
                for action_id in sorted(canonical_explanations_by_action_id.keys())
            ]
            response = ExplanationTranslationApiResponse(
                translations=translations,
                warnings=warnings,
            )
            if warnings:
                warning_action_ids = (
                    llm_io_payload.get("llm_output", {}).get("warning_action_ids", [])
                    if isinstance(llm_io_payload.get("llm_output"), dict)
                    else []
                )
                logger.warning(
                    "Explanation translation warning frontend_request_id=%s internal_request_id=%s action_ids=%s",
                    request_trace_id,
                    internal_request_id,
                    warning_action_ids,
                )
            response_payload = response.model_dump(mode="json")
            translation_event_index = artifact_writer.write_event(
                "explanation_translation.completed",
                {
                    "actions": len(translations),
                    "target_languages": request.requestData.targetLanguages,
                    "warnings_count": len(warnings),
                    "llm_io_file": (
                        llm_io_file.relative_to(artifact_writer.run_dir).as_posix()
                        if llm_io_file is not None
                        else "llm/explanation_translations_io.json"
                    ),
                },
            )
            artifact_writer.write_step_detail(
                "explanation_translation",
                {
                    "source_language": request.requestData.sourceLanguage,
                    "target_languages": request.requestData.targetLanguages,
                    "translated_action_ids": [row.actionId for row in translations],
                    "warnings": warnings,
                    "response": response_payload,
                },
                event_index=translation_event_index,
                event_type="explanation_translation.completed",
            )
            artifact_writer.write_run_file("response_full.json", response_payload)
            artifact_writer.write_manifest(
                {
                    "counts": {
                        "actions": len(translations),
                        "warnings": len(warnings),
                    },
                    "artifact_pointers": {
                        "summary_events": "summary.jsonl",
                        "input_snapshot": "input_snapshot.json",
                        "response_full": "response_full.json",
                    },
                }
            )
            log_metrics(
                {
                    "actions": len(translations),
                    "warnings": len(warnings),
                    "target_languages": len(request.requestData.targetLanguages),
                }
            )
            logger.info(
                "Explanation translation request completed frontend_request_id=%s internal_request_id=%s actions=%s",
                request_trace_id,
                internal_request_id,
                len(translations),
            )
            return response
        except ValueError as error:
            logger.warning(
                "Invalid explanation translation request request_id=%s error=%s",
                request_trace_id,
                error,
            )
            raise HTTPException(
                status_code=422,
                detail=_error_payload(request_trace_id, str(error)),
            ) from error
        except Exception as error:
            logger.exception(
                "Explanation translation failed request_id=%s internal_request_id=%s",
                request_trace_id,
                internal_request_id,
            )
            raise HTTPException(
                status_code=500,
                detail=_error_payload(request_trace_id, "Internal server error"),
            ) from error


def _run_for_city_input(
    *,
    city_input: FrontendCityInput,
    requested_top_n: int | None,
    city_data_api_client: MockCityDataApiClient | ApiCityDataApiClient,
    action_pathways_data_api_client: MockActionPathwaysDataApiClient | ApiActionPathwaysDataApiClient,
    legal_data_api_client: (
        MockLegalDataApiClient | ApiLegalDataApiClient | S3LegalDataApiClient
    ),
    action_policy_scores_data_api_client: (
        MockActionPolicyScoresDataApiClient | ApiActionPolicyScoresDataApiClient
    ),
    action_mitigation_feasibility_scores_data_api_client: (
        MockActionMitigationFeasibilityScoresDataApiClient
        | ApiActionMitigationFeasibilityScoresDataApiClient
    ),
    action_financial_feasibility_scores_data_api_client: (
        MockActionFinancialFeasibilityScoresDataApiClient
        | ApiActionFinancialFeasibilityScoresDataApiClient
    ),
    create_explanations: bool,
    requested_languages: list[str],
    frontend_request_id: str,
) -> PrioritizationResponse:
    """
    Translate a single frontend city payload into a pipeline run.

    Ranking trusts `excludedActionIds` supplied after the exclusion-preview
    review step and does not reinterpret raw exclusion preferences.
    """

    # Create internal request ID used for orchestrator artifacts/tracing.
    internal_request_id = uuid4()
    locode_country_code = _country_code_from_locode(city_input.locode)
    if locode_country_code != city_input.countryCode.strip().upper():
        raise ValueError(
            "Request countryCode does not match the locode country prefix "
            f"(locode={city_input.locode}, countryCode={city_input.countryCode})"
        )
    city_emissions_context = _extract_city_emissions_context(city_input)
    request_id_str = str(internal_request_id)
    with start_run(
        run_name=f"prioritization_city_{_safe_artifact_name(city_input.locode)}",
        tags={
            "service": "hiap-meed",
            "environment": _mlflow_environment_tag(),
            "request_kind": "prioritization",
            "scope": "city",
            "frontend_request_id": frontend_request_id,
            "internal_request_id": request_id_str,
            "locode": city_input.locode,
            "country_code": city_input.countryCode.strip().upper(),
        },
        params={
            "top_n": resolve_top_n(requested_top_n),
            "excluded_action_ids_count": len(city_input.excludedActionIds),
            "requested_languages_count": len(requested_languages),
            "create_explanations": int(create_explanations),
        },
        nested=True,
    ):
        result = run_prioritization(
            locode=city_input.locode,
            country_code=city_input.countryCode.strip().upper(),
            weights_override=city_input.weightsOverride,
            top_n=resolve_top_n(requested_top_n),
            excluded_action_ids=list(city_input.excludedActionIds),
            city_preference_sectors=list(city_input.cityStrategicPreferenceSectors),
            city_preference_timeframes=list(city_input.cityStrategicPreferenceTimeframes),
            city_preference_co_benefit_keys=list(
                city_input.cityStrategicPreferenceCoBenefitKeys
            ),
            city_emissions_context=city_emissions_context,
            internal_request_id=internal_request_id,
            city_data_api_client=city_data_api_client,
            action_pathways_data_api_client=action_pathways_data_api_client,
            legal_data_api_client=legal_data_api_client,
            action_policy_scores_data_api_client=action_policy_scores_data_api_client,
            action_mitigation_feasibility_scores_data_api_client=(
                action_mitigation_feasibility_scores_data_api_client
            ),
            action_financial_feasibility_scores_data_api_client=(
                action_financial_feasibility_scores_data_api_client
            ),
            create_explanations=create_explanations,
            requested_languages=requested_languages,
        )
        metadata = result.metadata
        explanations_metadata = metadata.explanations
        log_params(
            {
                "generated_languages_count": len(
                    explanations_metadata.generated_languages
                ),
            }
        )
        metrics: dict[str, float] = {"warnings": float(len(result.warnings))}
        for key, value in metadata.counts.model_dump(mode="json").items():
            if isinstance(value, int | float):
                metrics[f"counts_{key}"] = float(value)
        for key, value in metadata.timings.items():
            if isinstance(value, int | float):
                metrics[f"timings_{key}"] = float(value)
        log_metrics(metrics)
        return result

