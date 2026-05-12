"""FastAPI routes for MEED prioritization."""

from __future__ import annotations

import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from app.modules.prioritizer.config import resolve_top_n
from app.modules.prioritizer.internal_models import CityActivityRow, CityEmissionsContext
from app.modules.prioritizer.models import (
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
from app.modules.prioritizer.utils.subsector_mapping import (
    normalize_gpc_reference_to_subsector_key,
)
from app.modules.prioritizer.services.exclusion_resolution import (
    resolve_exclusion_preview_with_diagnostics,
)
from app.modules.prioritizer.services.translation import translate_explanations
from app.services.data_clients import (
    ApiActionDataApiClient,
    ApiCityDataApiClient,
    ApiLegalDataApiClient,
    ApiPolicySignalsDataApiClient,
    MockActionDataApiClient,
    MockCityDataApiClient,
    MockLegalDataApiClient,
    MockPolicySignalsDataApiClient,
    get_action_data_api_client,
    get_city_data_api_client,
    get_legal_data_api_client,
    get_policy_signals_data_api_client,
)
from app.utils.artifacts import ArtifactWriter


logger = logging.getLogger(__name__)

router = APIRouter(tags=["prioritization"])


def _error_payload(request_id: str, message: str) -> dict[str, str]:
    """Build a consistent JSON error body including the request ID."""
    return {"request_id": request_id, "error": message}


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
    action_data_api_client: MockActionDataApiClient | ApiActionDataApiClient = Depends(
        get_action_data_api_client
    ),
) -> ExclusionPreviewApiResponse:
    """Preview proposed exclusions from raw exclusion preferences."""
    request_trace_id = request.meta.requestId
    internal_request_id = uuid4()
    artifact_writer = ArtifactWriter(
        request_id=internal_request_id,
        request_kind="exclusion_preview",
    )

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
        actions = action_data_api_client.list_actions()
        fetch_actions_event_index = artifact_writer.write_event(
            "fetch_actions.completed",
            {"total_actions": len(actions)},
        )
        artifact_writer.write_step_detail(
            "fetch_actions",
            {
                "total_actions": len(actions),
                "action_ids": sorted(action.action_id for action in actions),
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
            artifact_writer.write_run_file(
                f"cities/{safe_locode}_preview.json",
                diagnostics,
            )
            free_text_resolution = diagnostics.get("free_text_resolution")
            if isinstance(free_text_resolution, dict) and free_text_resolution:
                artifact_writer.write_run_file(
                    f"llm/{safe_locode}_free_text_exclusion_io.json",
                    free_text_resolution,
                )
        logger.info(
            "Exclusion preview request completed frontend_request_id=%s internal_request_id=%s cities=%s",
            request_trace_id,
            internal_request_id,
            len(results),
        )
        response = ExclusionPreviewApiResponse(results=results)
        artifact_writer.write_event(
            "response_summary.completed",
            {
                "cities": len(results),
                "total_proposed_exclusions": sum(
                    result.exclusionSummary.totalProposed for result in results
                ),
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
                    "total_proposed_exclusions": sum(
                        result.exclusionSummary.totalProposed for result in results
                    ),
                },
                "artifact_pointers": {
                    "summary_events": "summary.jsonl",
                    "input_snapshot": "input_snapshot.json",
                    "response_full": "response_full.json",
                },
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
        "Ranks actions for one or more cities from the frontend request envelope. "
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
    action_data_api_client: MockActionDataApiClient | ApiActionDataApiClient = Depends(
        get_action_data_api_client
    ),
    legal_data_api_client: MockLegalDataApiClient | ApiLegalDataApiClient = Depends(
        get_legal_data_api_client
    ),
    policy_signals_data_api_client: (
        MockPolicySignalsDataApiClient | ApiPolicySignalsDataApiClient
    ) = Depends(
        get_policy_signals_data_api_client
    ),
) -> PrioritizerApiResponse:
    """
    Prioritize actions from the CityCatalyst frontend request envelope.

    This endpoint is synchronous because the orchestrator and data clients
    are synchronous; FastAPI runs sync routes in a threadpool to avoid
    blocking the event loop.
    """

    # Get the request trace ID from the request envelope.
    request_trace_id = request.meta.requestId

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
                action_data_api_client=action_data_api_client,
                legal_data_api_client=legal_data_api_client,
                policy_signals_data_api_client=policy_signals_data_api_client,
                create_explanations=request.requestData.createExplanations,
                requested_languages=requested_languages,
            )
            # Echo frontend request ID for response correlation in clients/logs.
            per_city_result.metadata["frontend_request_id"] = request_trace_id
            results.append(
                PrioritizerApiCityResult(
                    locode=city_input.locode,
                    ranked_action_ids=per_city_result.ranked_action_ids,
                    ranked_actions=per_city_result.ranked_actions,
                    metadata=per_city_result.metadata,
                    warnings=per_city_result.warnings,
                )
            )

        logger.info(
            "Prioritization request completed frontend_request_id=%s cities=%s",
            request_trace_id,
            len(results),
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
    except Exception as error:
        logger.exception("Prioritization failed request_id=%s", request_trace_id)
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
                row.model_dump(mode="json") for row in request.requestData.rankedActions
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
                    prompt_file.relative_to(artifact_writer._run_dir).as_posix()
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
                    llm_io_file.relative_to(artifact_writer._run_dir).as_posix()
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
    action_data_api_client: MockActionDataApiClient | ApiActionDataApiClient,
    legal_data_api_client: MockLegalDataApiClient | ApiLegalDataApiClient,
    policy_signals_data_api_client: (
        MockPolicySignalsDataApiClient | ApiPolicySignalsDataApiClient
    ),
    create_explanations: bool,
    requested_languages: list[str],
) -> PrioritizationResponse:
    """
    Translate a single frontend city payload into a pipeline run.

    Ranking trusts `excludedActionIds` supplied after the exclusion-preview
    review step and does not reinterpret raw exclusion preferences.
    """

    # Create internal request ID used for orchestrator artifacts/tracing.
    internal_request_id = uuid4()
    city_emissions_context = _extract_city_emissions_context(city_input)
    result = run_prioritization(
        locode=city_input.locode,
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
        action_data_api_client=action_data_api_client,
        legal_data_api_client=legal_data_api_client,
        policy_signals_data_api_client=policy_signals_data_api_client,
        create_explanations=create_explanations,
        requested_languages=requested_languages,
    )
    return result
