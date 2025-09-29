from typing import Dict, List, Union, Callable, Tuple
import warnings
from datetime import datetime
import time
import logging
from prioritizer.utils.tournament import tournament_ranking
from prioritizer.utils.tournament_quick_select import quickselect_top_k
from prioritizer.utils.ml_comparator import ml_compare
from utils.build_city_data import build_city_data
from services.get_context import get_context
from services.get_ccra import get_ccra
from prioritizer.utils.filter_actions_by_biome import filter_actions_by_biome
from prioritizer.utils.add_explanations import generate_multilingual_explanation
import os
from prioritizer.models import (
    RankedAction,
    MetaData,
    PrioritizerResponse,
    CityData,
    PrioritizerResponseBulk,
    PrioritizationType,
)

# Import the shared task_storage from api.py (or move to a separate module if needed)
from prioritizer.task_storage import task_storage

logger = logging.getLogger(__name__)

# Activate or deactivate explanations, default to active (true)
EXPLANATIONS_ENABLED = os.getenv("EXPLANATIONS_ENABLED", "true").lower() == "true"


def _rank_actions_for_city(
    cityData_dict: dict,
    filteredActions: List[dict],
    prioritizationType: PrioritizationType,
    country_code: str,
    languages: List[str],
    ranking_function: Callable[..., List[Tuple[dict, int]]],
) -> tuple[List[RankedAction], List[RankedAction]]:
    """
    Helper function to rank actions for a single city.

    Args:
        cityData_dict: dict
        filteredActions: List[dict]
        prioritizationType: PrioritizationType
        country_code: str
        languages: List[str]
        ranking_function: tournament_ranking or quickselect_top_k
    Returns:
        tuple[List[RankedAction], List[RankedAction]]
    """
    rankedActionsMitigation: List[RankedAction] = []
    rankedActionsAdaptation: List[RankedAction] = []

    if prioritizationType in [PrioritizationType.MITIGATION, PrioritizationType.BOTH]:
        mitigationActions = [
            action
            for action in filteredActions
            if action.get("ActionType") is not None
            and isinstance(action["ActionType"], list)
            and "mitigation" in action["ActionType"]
        ]
        mitigationRanking = ranking_function(
            cityData_dict,
            mitigationActions,
            comparator=ml_compare,
        )
        for action, rank in mitigationRanking:
            explanation = None
            if EXPLANATIONS_ENABLED:
                explanation = generate_multilingual_explanation(
                    country_code=country_code,
                    city_data=cityData_dict,
                    single_action=action,
                    rank=rank,
                    languages=languages,
                )
            rankedActionsMitigation.append(
                RankedAction(
                    actionId=action["ActionID"], rank=rank, explanation=explanation
                )
            )

    if prioritizationType in [PrioritizationType.ADAPTATION, PrioritizationType.BOTH]:
        adaptationActions = [
            action
            for action in filteredActions
            if action.get("ActionType") is not None
            and isinstance(action["ActionType"], list)
            and "adaptation" in action["ActionType"]
        ]
        adaptationRanking = ranking_function(
            cityData_dict, adaptationActions, comparator=ml_compare
        )
        for action, rank in adaptationRanking:
            explanation = None
            if EXPLANATIONS_ENABLED:
                explanation = generate_multilingual_explanation(
                    country_code=country_code,
                    city_data=cityData_dict,
                    single_action=action,
                    rank=rank,
                    languages=languages,
                )
            rankedActionsAdaptation.append(
                RankedAction(
                    actionId=action["ActionID"], rank=rank, explanation=explanation
                )
            )

    return rankedActionsMitigation, rankedActionsAdaptation


def _execute_prioritization(task_uuid: str, background_task_input: Dict):
    """
    Execute a single prioritization task.

    This function is called by the API to process a single city.
    It extracts the necessary data from the city data, calls the prioritization logic,
    and stores the result in the task.

    It uses the slower but more accurate tournament_ranking function instead of the
    faster quickselect_top_k function.

    Data fetching behavior:
    - City context is fetched only for mitigation or BOTH; if missing, we log a warning
      and proceed without context.
    - CCRA is fetched only for adaptation or BOTH; if missing, the task fails since
      adaptation requires CCRA.
    """

    try:
        task_storage[task_uuid]["status"] = "running"

        # 1. Extract needed data from request into requestData
        city_data = background_task_input["cityData"]
        prioritizationType = background_task_input["prioritizationType"]
        languages = background_task_input["language"]
        country_code = background_task_input["countryCode"]

        requestData = {}
        requestData["locode"] = city_data.cityContextData.locode
        requestData["populationSize"] = city_data.cityContextData.populationSize
        requestData["stationaryEnergyEmissions"] = (
            city_data.cityEmissionsData.stationaryEnergyEmissions
        )
        requestData["transportationEmissions"] = (
            city_data.cityEmissionsData.transportationEmissions
        )
        requestData["wasteEmissions"] = city_data.cityEmissionsData.wasteEmissions
        requestData["ippuEmissions"] = city_data.cityEmissionsData.ippuEmissions
        requestData["afoluEmissions"] = city_data.cityEmissionsData.afoluEmissions

        logger.info(
            f"Task {task_uuid}: Starting prioritization for locode={city_data.cityContextData.locode}"
        )
        logger.info("API endpoint uses tournament_ranking function")

        start_time = time.time()
        try:

            # Initialize city context and CCRA as None
            cityContext = None
            cityCCRA = None

            # Get city context data from global API if needed
            if prioritizationType in [
                PrioritizationType.MITIGATION,
                PrioritizationType.BOTH,
            ]:
                # API call to get city context data from global API
                cityContext = get_context(requestData["locode"])
                if not cityContext:
                    logger.warning(
                        f"Task {task_uuid}: No city context data found from global API."
                    )
                    logger.warning(
                        f"Continuing with no specific city context data from global API."
                    )
                    # task_storage[task_uuid]["status"] = "failed"
                    # task_storage[task_uuid][
                    #     "error"
                    # ] = "No city context data found from global API."
                    # return

            # Get CCRA data from global API if needed
            if prioritizationType in [
                PrioritizationType.ADAPTATION,
                PrioritizationType.BOTH,
            ]:

                # API call to get CCRA data from global API
                cityCCRA = get_ccra(requestData["locode"], "current")
                if not cityCCRA:
                    logger.error(f"Task {task_uuid}: No CCRA data found from CCRA API.")
                    logger.error(
                        f"Cannot continue with prioritization for adaptation actions without CCRA data from global API."
                    )
                    logger.error(
                        "You may try to run the prioritization for mitigation actions only."
                    )
                    task_storage[task_uuid]["status"] = "failed"
                    task_storage[task_uuid][
                        "error"
                    ] = "No CCRA data found from CCRA API."
                    return

            # Build city data, if no city context or CCRA data is provided, the city data will be built with the request data only.
            cityData_dict = build_city_data(requestData, cityContext, cityCCRA)

            # Load actions passed as argument (validated upstream in API)
            actions = background_task_input.get("actions")
            filteredActions = filter_actions_by_biome(cityData_dict, actions)
            # prioritizationType = background_task_input.get(
            #     "prioritizationType", PrioritizationType.BOTH
            # )

            rankedActionsMitigation, rankedActionsAdaptation = _rank_actions_for_city(
                cityData_dict=cityData_dict,
                filteredActions=filteredActions,
                prioritizationType=prioritizationType,
                country_code=country_code,
                languages=languages,
                ranking_function=tournament_ranking,
            )
            prioritizer_response = PrioritizerResponse(
                metadata=MetaData(
                    locode=background_task_input["cityData"].cityContextData.locode,
                    rankedDate=datetime.now(),
                ),
                rankedActionsMitigation=rankedActionsMitigation,
                rankedActionsAdaptation=rankedActionsAdaptation,
            )
            task_storage[task_uuid]["status"] = "completed"
            task_storage[task_uuid]["prioritizer_response"] = prioritizer_response
            process_time = time.time() - start_time
            logger.info(
                f"Task {task_uuid}: Prioritization completed in {process_time:.2f}s"
            )
        except Exception as e:
            logger.error(
                f"Task {task_uuid}: Error during prioritization: {str(e)}",
                exc_info=True,
            )
            task_storage[task_uuid]["status"] = "failed"
            task_storage[task_uuid]["error"] = f"Error during prioritization: {str(e)}"
            return
    except Exception as e:
        logger.error(
            f"Task {task_uuid}: Unexpected error during prioritization: {str(e)}",
            exc_info=True,
        )
        task_storage[task_uuid]["status"] = "failed"
        task_storage[task_uuid]["error"] = f"Error during prioritization: {str(e)}"


def _compute_prioritization_bulk_subtask(
    background_task_input: Dict,
    main_task_id: str,
    subtask_idx: int,
    mode: str = "quickselect_top_k",
) -> Dict[str, Union[str, Dict]]:
    """
    Compute-only version of the bulk subtask suitable for execution in a separate process.
    Mode can be either "quickselect_top_k" or "tournament_ranking".
    The default mode is "quickselect_top_k".

    Inputs:
    - background_task_input: Dict containing request and emission data
    - main_task_id: str identifier for the parent bulk task (used in logging)
    - subtask_idx: int index of this subtask (used in logging)
    - mode: str, either "quickselect_top_k" or "tournament_ranking"

    Expects background_task_input with keys:
      - requestData: dict with locode, populationSize, emission fields
      - prioritizationType: str or PrioritizationType
      - language: List[str]
      - countryCode: str

    Returns a dict:
      {"status": "completed", "result": PrioritizerResponse as dict}
      or
      {"status": "failed", "error": str}

    Data fetching behavior:
    - City context is fetched only for mitigation or BOTH; if missing, we log a warning
      and proceed without context.
    - CCRA is fetched only for adaptation or BOTH; if missing, the subtask fails since
      adaptation requires CCRA.
    """

    if mode == "quickselect_top_k":
        ranking_function = quickselect_top_k
    elif mode == "tournament_ranking":
        ranking_function = tournament_ranking
    else:
        raise ValueError(f"Invalid mode: {mode}")

    try:
        start_time = time.time()
        requestData = background_task_input["requestData"]
        prioritizationType = background_task_input["prioritizationType"]
        if isinstance(prioritizationType, str):
            try:
                prioritizationType = PrioritizationType(prioritizationType)
            except Exception:
                return {"status": "failed", "error": "Invalid prioritizationType"}
        languages: List[str] = background_task_input["language"]
        country_code: str = background_task_input["countryCode"]

        # Conditionally fetch context and CCRA based on prioritization type
        cityContext = None
        cityCCRA = None

        if prioritizationType in [
            PrioritizationType.MITIGATION,
            PrioritizationType.BOTH,
        ]:
            cityContext = get_context(requestData["locode"])
            if not cityContext:
                logger.warning(
                    f"Bulk subtask {subtask_idx} of {main_task_id}: No city context data from global API for {requestData['locode']}"
                )
                logger.warning(
                    f"Continuing with no specific city context data from global API."
                )

        if prioritizationType in [
            PrioritizationType.ADAPTATION,
            PrioritizationType.BOTH,
        ]:
            cityCCRA = get_ccra(requestData["locode"], "current")
            if not cityCCRA:
                logger.error(
                    f"Bulk subtask {subtask_idx} of {main_task_id}: No CCRA data found from CCRA API for {requestData['locode']}"
                )
                logger.error(
                    f"Cannot continue with prioritization for adaptation actions without CCRA data from global API."
                )
                logger.error(
                    "You may try to run the prioritization for mitigation actions only."
                )
                return {
                    "status": "failed",
                    "error": "No CCRA data found from CCRA API.",
                }

        # Build city data, if no city context or CCRA data is provided, the city data will be built with the request data only.
        cityData_dict = build_city_data(requestData, cityContext, cityCCRA)

        # Load actions passed as argument (validated upstream in API)
        actions = background_task_input.get("actions")
        filteredActions = filter_actions_by_biome(cityData_dict, actions)

        rankedActionsMitigation, rankedActionsAdaptation = _rank_actions_for_city(
            cityData_dict=cityData_dict,
            filteredActions=filteredActions,
            prioritizationType=prioritizationType,
            country_code=country_code,
            languages=languages,
            ranking_function=ranking_function,
        )

        prioritizer_response = PrioritizerResponse(
            metadata=MetaData(
                locode=requestData["locode"],
                rankedDate=datetime.now(),
            ),
            rankedActionsMitigation=rankedActionsMitigation,
            rankedActionsAdaptation=rankedActionsAdaptation,
        )

        process_time = time.time() - start_time
        logger.info(
            f"Bulk subtask {subtask_idx} of {main_task_id} ({requestData['locode']}): Prioritization completed in {process_time:.2f}s"
        )
        return {"status": "completed", "result": prioritizer_response.model_dump()}

    except Exception as e:
        logger.error(
            f"Process subtask error for locode={background_task_input.get('requestData', {}).get('locode')}: {str(e)}",
            exc_info=True,
        )
        return {"status": "failed", "error": f"Error during prioritization: {str(e)}"}


def _execute_prioritization_bulk_subtask(
    main_task_id: str,
    subtask_idx: int,
    background_task_input: dict,
):
    """
    DEPRECATED: Use `_compute_prioritization_bulk_subtask` instead.

    Execute a single subtask of a bulk prioritization task.

    This function is called by the bulk prioritization task to process a single city.
    It extracts the necessary data from the city data, calls the prioritization logic,
    and stores the result in the subtask.

    It uses tournament_ranking function instead of the faster quickselect_top_k function.
    Context is fetched only for mitigation or BOTH; missing context results in a warning
    and the subtask continues. CCRA is fetched only for adaptation or BOTH; missing CCRA
    fails the subtask since adaptation requires it. Intended for cap_off_app usage.
    """

    # Emit deprecation warnings at runtime
    warnings.warn(
        "_execute_prioritization_bulk_subtask is deprecated; use _compute_prioritization_bulk_subtask",
        DeprecationWarning,
        stacklevel=2,
    )
    logger.warning(
        "_execute_prioritization_bulk_subtask is deprecated; use _compute_prioritization_bulk_subtask"
    )

    try:
        task_storage[main_task_id]["subtasks"][subtask_idx]["status"] = "running"

        # 1. Extract needed data from request into requestData
        city_data = background_task_input["cityData"]
        prioritizationType = background_task_input["prioritizationType"]
        languages = background_task_input["language"]
        country_code = background_task_input["countryCode"]

        requestData = {}
        requestData["locode"] = city_data.cityContextData.locode
        requestData["populationSize"] = city_data.cityContextData.populationSize
        requestData["stationaryEnergyEmissions"] = (
            city_data.cityEmissionsData.stationaryEnergyEmissions
        )
        requestData["transportationEmissions"] = (
            city_data.cityEmissionsData.transportationEmissions
        )
        requestData["wasteEmissions"] = city_data.cityEmissionsData.wasteEmissions
        requestData["ippuEmissions"] = city_data.cityEmissionsData.ippuEmissions
        requestData["afoluEmissions"] = city_data.cityEmissionsData.afoluEmissions

        logger.info(
            f"Task {main_task_id}: Starting prioritization for locode={city_data.cityContextData.locode}"
        )
        logger.info("API endpoint uses tournament_ranking function")

        start_time = time.time()
        try:
            # Conditionally fetch context and CCRA based on prioritization type
            cityContext = None
            cityCCRA = None

            if prioritizationType in [
                PrioritizationType.MITIGATION,
                PrioritizationType.BOTH,
            ]:
                cityContext = get_context(requestData["locode"])
                if not cityContext:
                    logger.warning(
                        f"Bulk Task {main_task_id} subtask {subtask_idx}: No city context data from global API"
                    )
                    logger.warning(
                        f"Continuing with no specific city context data from global API."
                    )

            if prioritizationType in [
                PrioritizationType.ADAPTATION,
                PrioritizationType.BOTH,
            ]:
                cityCCRA = get_ccra(requestData["locode"], "current")
                if not cityCCRA:
                    logger.error(
                        f"Bulk Task {main_task_id} subtask {subtask_idx}: No CCRA data found from CCRA API."
                    )
                    logger.error(
                        f"Cannot continue with prioritization for adaptation actions without CCRA data from global API."
                    )
                    logger.error(
                        "You may try to run the prioritization for mitigation actions only."
                    )
                    task_storage[main_task_id]["subtasks"][subtask_idx][
                        "status"
                    ] = "failed"
                    task_storage[main_task_id]["subtasks"][subtask_idx][
                        "error"
                    ] = "No CCRA data found from CCRA API."
                    _update_bulk_task_status(main_task_id)
                    return

            # Build city data, if no city context or CCRA data is provided, the city data will be built with the request data only.
            cityData_dict = build_city_data(requestData, cityContext, cityCCRA)

            # Load actions passed as argument (validated upstream in API)
            actions = background_task_input.get("actions")
            filteredActions = filter_actions_by_biome(cityData_dict, actions)

            rankedActionsMitigation, rankedActionsAdaptation = _rank_actions_for_city(
                cityData_dict=cityData_dict,
                filteredActions=filteredActions,
                prioritizationType=prioritizationType,
                country_code=country_code,
                languages=languages,
                ranking_function=tournament_ranking,
            )

            prioritizer_response = PrioritizerResponse(
                metadata=MetaData(
                    locode=city_data.cityContextData.locode,
                    rankedDate=datetime.now(),
                ),
                rankedActionsMitigation=rankedActionsMitigation,
                rankedActionsAdaptation=rankedActionsAdaptation,
            )

            task_storage[main_task_id]["subtasks"][subtask_idx]["status"] = "completed"
            task_storage[main_task_id]["subtasks"][subtask_idx][
                "result"
            ] = prioritizer_response
            _update_bulk_task_status(main_task_id)

            process_time = time.time() - start_time
            logger.info(
                f"Task {main_task_id}: Prioritization completed in {process_time:.2f}s"
            )
        except Exception as e:
            logger.error(
                f"Bulk Task {main_task_id} subtask {subtask_idx}: Error during prioritization: {str(e)}",
                exc_info=True,
            )
            task_storage[main_task_id]["subtasks"][subtask_idx]["status"] = "failed"
            task_storage[main_task_id]["subtasks"][subtask_idx][
                "error"
            ] = f"Error during prioritization: {str(e)}"
            _update_bulk_task_status(main_task_id)
            return

    except Exception as e:
        logger.error(
            f"Bulk Task {main_task_id} subtask {subtask_idx}: Unexpected error during prioritization: {str(e)}",
            exc_info=True,
        )
        task_storage[main_task_id]["subtasks"][subtask_idx]["status"] = "failed"
        task_storage[main_task_id]["subtasks"][subtask_idx][
            "error"
        ] = f"Error during prioritization: {str(e)}"
        _update_bulk_task_status(main_task_id)


def _update_bulk_task_status(main_task_id: str):
    """Update the overall status of the bulk task and aggregate results if all are done."""
    subtasks = task_storage[main_task_id]["subtasks"]
    statuses = [s["status"] for s in subtasks]
    if all(s == "completed" for s in statuses):
        task_storage[main_task_id]["status"] = "completed"
        # Aggregate results
        results = [s["result"] for s in subtasks if s["result"] is not None]
        task_storage[main_task_id]["prioritizer_response_bulk"] = (
            PrioritizerResponseBulk(prioritizerResponseList=results)
        )
        # Log elapsed time based on created_at for consistency with single-task flow
        created_at_str = task_storage.get(main_task_id, {}).get("created_at")
        if created_at_str:
            try:
                created_at_dt = datetime.fromisoformat(created_at_str)
                elapsed_seconds = (datetime.now() - created_at_dt).total_seconds()
                logger.info(
                    f"Task {main_task_id}: Bulk prioritization completed for {len(results)} cities in {elapsed_seconds:.2f}s"
                )
            except Exception:
                logger.info(
                    f"Task {main_task_id}: Bulk prioritization completed for {len(results)} cities"
                )
        else:
            logger.info(
                f"Task {main_task_id}: Bulk prioritization completed for {len(results)} cities"
            )
    elif any(s == "failed" for s in statuses):
        task_storage[main_task_id]["status"] = "failed"
        errors = [s["error"] for s in subtasks if s["status"] == "failed"]
        task_storage[main_task_id]["error"] = "; ".join(errors)
    elif any(s == "running" for s in statuses):
        task_storage[main_task_id]["status"] = "running"
    else:
        task_storage[main_task_id]["status"] = "pending"
