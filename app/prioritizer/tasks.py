from typing import Dict
from datetime import datetime
import time
import logging
from prioritizer.utils.tournament import tournament_ranking
from prioritizer.utils.ml_comparator import ml_compare
from utils.build_city_data import build_city_data
from services.get_actions import get_actions
from services.get_context import get_context
from prioritizer.utils.filter_actions_by_biome import filter_actions_by_biome
from prioritizer.utils.add_explanations import generate_multilingual_explanation
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

LANGUAGES = ["en", "es", "pt"]
logger = logging.getLogger(__name__)


def _execute_prioritization(task_uuid: str, background_task_input: Dict):
    try:
        task_storage[task_uuid]["status"] = "running"
        logger.info(
            f"Task {task_uuid}: Starting prioritization for locode={background_task_input['cityData'].cityContextData.locode}"
        )
        start_time = time.time()
        try:
            # 1. Extract needed data from request into requestData
            requestData = {}
            requestData["locode"] = background_task_input[
                "cityData"
            ].cityContextData.locode
            requestData["populationSize"] = background_task_input[
                "cityData"
            ].cityContextData.populationSize
            requestData["stationaryEnergyEmissions"] = background_task_input[
                "cityData"
            ].cityEmissionsData.stationaryEnergyEmissions
            requestData["transportationEmissions"] = background_task_input[
                "cityData"
            ].cityEmissionsData.transportationEmissions
            requestData["wasteEmissions"] = background_task_input[
                "cityData"
            ].cityEmissionsData.wasteEmissions
            requestData["ippuEmissions"] = background_task_input[
                "cityData"
            ].cityEmissionsData.ippuEmissions
            requestData["afoluEmissions"] = background_task_input[
                "cityData"
            ].cityEmissionsData.afoluEmissions

            # API call to get city context data
            cityContext = get_context(requestData["locode"])
            if not cityContext:
                task_storage[task_uuid]["status"] = "failed"
                task_storage[task_uuid][
                    "error"
                ] = "No city context data found from global API."
                return
            # Build city data
            cityData_dict = build_city_data(cityContext, requestData)

            # API call to get actions data
            actions = get_actions()
            if not actions:
                task_storage[task_uuid]["status"] = "failed"
                task_storage[task_uuid][
                    "error"
                ] = "No actions data found from global API."
                return
            filteredActions = filter_actions_by_biome(cityData_dict, actions)
            prioritizationType = background_task_input.get(
                "prioritizationType", PrioritizationType.BOTH
            )

            rankedActionsMitigation = []
            rankedActionsAdaptation = []

            if prioritizationType in [
                PrioritizationType.MITIGATION,
                PrioritizationType.BOTH,
            ]:
                mitigationActions = [
                    action
                    for action in filteredActions
                    if action.get("ActionType") is not None
                    and isinstance(action["ActionType"], list)
                    and "mitigation" in action["ActionType"]
                ]
                mitigationRanking = tournament_ranking(
                    cityData_dict, mitigationActions, comparator=ml_compare
                )
                rankedActionsMitigation = [
                    RankedAction(
                        actionId=action["ActionID"],
                        rank=rank,
                        explanation=generate_multilingual_explanation(
                            city_data=cityData_dict,
                            single_action=action,
                            rank=rank,
                            languages=LANGUAGES,
                        ),
                    )
                    for action, rank in mitigationRanking
                ]

            if prioritizationType in [
                PrioritizationType.ADAPTATION,
                PrioritizationType.BOTH,
            ]:
                adaptationActions = [
                    action
                    for action in filteredActions
                    if action.get("ActionType") is not None
                    and isinstance(action["ActionType"], list)
                    and "adaptation" in action["ActionType"]
                ]
                adaptationRanking = tournament_ranking(
                    cityData_dict, adaptationActions, comparator=ml_compare
                )
                rankedActionsAdaptation = [
                    RankedAction(
                        actionId=action["ActionID"],
                        rank=rank,
                        explanation=generate_multilingual_explanation(
                            city_data=cityData_dict,
                            single_action=action,
                            rank=rank,
                            languages=LANGUAGES,
                        ),
                    )
                    for action, rank in adaptationRanking
                ]
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


def _execute_prioritization_bulk_subtask(
    main_task_id: str,
    subtask_idx: int,
    city_data: CityData,
    prioritizationType: PrioritizationType,
):
    try:
        task_storage[main_task_id]["subtasks"][subtask_idx]["status"] = "running"
        background_task_input = {"cityData": city_data}
        # Reuse the single prioritization logic, but don't store in task_storage directly
        # Instead, collect the result and store in the subtask
        try:
            # 1. Extract needed data from request into requestData
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

            cityContext = get_context(requestData["locode"])
            if not cityContext:
                task_storage[main_task_id]["subtasks"][subtask_idx]["status"] = "failed"
                task_storage[main_task_id]["subtasks"][subtask_idx][
                    "error"
                ] = "No city context data found from global API."
                _update_bulk_task_status(main_task_id)
                return
            cityData_dict = build_city_data(cityContext, requestData)
            actions = get_actions()
            if not actions:
                task_storage[main_task_id]["subtasks"][subtask_idx]["status"] = "failed"
                task_storage[main_task_id]["subtasks"][subtask_idx][
                    "error"
                ] = "No actions data found from global API."
                _update_bulk_task_status(main_task_id)
                return
            filteredActions = filter_actions_by_biome(cityData_dict, actions)

            rankedActionsMitigation = []
            rankedActionsAdaptation = []

            if prioritizationType in [
                PrioritizationType.MITIGATION,
                PrioritizationType.BOTH,
            ]:
                mitigationActions = [
                    action
                    for action in filteredActions
                    if action.get("ActionType") is not None
                    and isinstance(action["ActionType"], list)
                    and "mitigation" in action["ActionType"]
                ]
                mitigationRanking = tournament_ranking(
                    cityData_dict, mitigationActions, comparator=ml_compare
                )
                rankedActionsMitigation = [
                    RankedAction(
                        actionId=action["ActionID"],
                        rank=rank,
                        explanation=generate_multilingual_explanation(
                            city_data=cityData_dict,
                            single_action=action,
                            rank=rank,
                            languages=LANGUAGES,
                        ),
                    )
                    for action, rank in mitigationRanking
                ]

            if prioritizationType in [
                PrioritizationType.ADAPTATION,
                PrioritizationType.BOTH,
            ]:
                adaptationActions = [
                    action
                    for action in filteredActions
                    if action.get("ActionType") is not None
                    and isinstance(action["ActionType"], list)
                    and "adaptation" in action["ActionType"]
                ]
                adaptationRanking = tournament_ranking(
                    cityData_dict, adaptationActions, comparator=ml_compare
                )
                rankedActionsAdaptation = [
                    RankedAction(
                        actionId=action["ActionID"],
                        rank=rank,
                        explanation=generate_multilingual_explanation(
                            city_data=cityData_dict,
                            single_action=action,
                            rank=rank,
                            languages=LANGUAGES,
                        ),
                    )
                    for action, rank in adaptationRanking
                ]
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
    elif any(s == "failed" for s in statuses):
        task_storage[main_task_id]["status"] = "failed"
        errors = [s["error"] for s in subtasks if s["status"] == "failed"]
        task_storage[main_task_id]["error"] = "; ".join(errors)
    elif any(s == "running" for s in statuses):
        task_storage[main_task_id]["status"] = "running"
    else:
        task_storage[main_task_id]["status"] = "pending"
