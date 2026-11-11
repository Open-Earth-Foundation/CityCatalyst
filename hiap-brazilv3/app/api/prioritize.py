"""`POST /v1/prioritize`: rank items for a registered region + methodology + version."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.api.errors import invalid_inputs_detail, unsupported_combination_detail
from app.api.models import (
    ExcludedItemResult,
    PrioritizeApiRequest,
    PrioritizeApiResponse,
    PrioritizeResponseData,
    RankedItemResult,
)
from app.models import ApiResponseMeta
from app.registry import UnsupportedCombinationError, resolve

logger = logging.getLogger(__name__)

METHODOLOGY_STATUS = "scaffold"
SCAFFOLD_WARNING = (
    "Methodology is a scaffold: the ranking is mock data and has no methodological meaning."
)

router = APIRouter(prefix="/v1", tags=["prioritization"])


@router.post(
    "/prioritize",
    response_model=PrioritizeApiResponse,
    summary="Rank items (scaffold, mock data)",
    description=(
        "Resolves region + methodology + methodologyVersion in the registry and runs "
        "the pipeline for the requested modality. SCAFFOLD: the ranking is fictitious; "
        "`meta.mock` is true and `meta.methodologyStatus` is `scaffold`. Backend owns "
        "weights, filters and limits."
    ),
    responses={
        422: {
            "description": (
                "Invalid request, unsupported combination (`unsupported_combination`) "
                "or `inputs` rejected by the registered adapter (`invalid_inputs`)."
            )
        }
    },
)
def prioritize(request: PrioritizeApiRequest) -> PrioritizeApiResponse:
    """Run the pipeline selected by the request and return its mock ranking.

    Caller-selectable inputs are region, methodology, methodologyVersion,
    modality and an adapter-specific `inputs` object. Weights, filters and
    `top_n` are backend-owned and come from the registration's validated config.
    An unsupported combination returns HTTP 422 with code `unsupported_combination`;
    `inputs` the registered adapter rejects return HTTP 422 with code `invalid_inputs`.
    """
    request_id = request.meta.requestId
    data = request.requestData
    logger.warning("%s requestId=%s", SCAFFOLD_WARNING, request_id)

    # Step 1: resolve combination and pipeline
    try:
        combination, pipeline = resolve(
            data.region, data.methodology, data.methodologyVersion, data.modality
        )
    except UnsupportedCombinationError as error:
        logger.info("Rejected request requestId=%s: %s", request_id, error)
        raise HTTPException(
            status_code=422, detail=unsupported_combination_detail(error, request_id)
        ) from error

    # Step 2: the registered adapter validates the caller's inputs strictly
    try:
        inputs = combination.validate_inputs(data.inputs)
    except ValidationError as error:
        logger.info("Rejected inputs requestId=%s: %s errors", request_id, error.error_count())
        raise HTTPException(
            status_code=422, detail=invalid_inputs_detail(error, request_id)
        ) from error

    # Step 3: load region-owned items and backend config, then run the pipeline
    items = combination.load_items(data.modality, inputs)
    result = pipeline(items, combination.load_config(), inputs)

    # Step 4: assemble the response
    names = {item.id: item.name for item in items}
    ranked = [
        RankedItemResult(
            itemId=entry.item_id,
            name=names[entry.item_id],
            rank=entry.rank,
            finalScore=entry.final_score,
            scores=entry.score_vector.scores,
        )
        for entry in result.ranked
    ]
    excluded = [
        ExcludedItemResult(itemId=decision.item_id, reason=decision.reason)
        for decision in result.excluded
    ]
    return PrioritizeApiResponse(
        meta=ApiResponseMeta(
            requestId=request_id,
            generatedAtUtc=datetime.now(timezone.utc),
            totalRecords=len(ranked),
            mock=True,
            methodologyStatus=METHODOLOGY_STATUS,
        ),
        responseData=PrioritizeResponseData(
            region=data.region,
            methodology=data.methodology,
            methodologyVersion=data.methodologyVersion,
            modality=data.modality,
            ranked=ranked,
            excluded=excluded,
        ),
    )
