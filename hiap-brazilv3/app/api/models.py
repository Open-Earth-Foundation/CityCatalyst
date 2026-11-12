"""Public request/response models for `POST /v1/prioritize` (camelCase, like HIAP-MEED)."""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models import ApiRequestMeta, ApiResponseMeta


class PrioritizeRequestData(BaseModel):
    """Caller-selectable inputs. Backend owns weights, filters and limits."""

    model_config = ConfigDict(extra="forbid")

    region: str = Field(min_length=1, description="Region code, e.g. BR.")
    methodology: str = Field(min_length=1, description="Methodology identifier, e.g. ccc.")
    methodologyVersion: str = Field(
        min_length=1, description="Methodology version, e.g. v1."
    )
    modality: Literal["mitigation", "adaptation"] = Field(
        description="Selects the mitigation or adaptation pipeline."
    )
    inputs: dict[str, Any] = Field(
        default_factory=dict,
        description=(
            "Adapter-specific caller inputs. Not validated here: after the "
            "combination is resolved, the registered adapter validates them "
            "strictly with its own model (HTTP 422 on missing, mistyped or "
            "unexpected fields)."
        ),
    )


class PrioritizeApiRequest(BaseModel):
    """Workflow request envelope."""

    meta: ApiRequestMeta
    requestData: PrioritizeRequestData


class RankedItemResult(BaseModel):
    """One ranked item. Scores are fictitious while the methodology is a scaffold."""

    itemId: str
    name: str
    rank: int
    finalScore: float
    scores: dict[str, float] = Field(description="Score per pillar name.")


class ExcludedItemResult(BaseModel):
    """One item removed before ranking."""

    itemId: str
    reason: str | None = None


class PrioritizeResponseData(BaseModel):
    """Ranking returned to the caller, echoing the resolved combination."""

    region: str
    methodology: str
    methodologyVersion: str
    modality: str
    ranked: list[RankedItemResult]
    excluded: list[ExcludedItemResult]


class PrioritizeApiResponse(BaseModel):
    """Workflow response envelope."""

    meta: ApiResponseMeta
    responseData: PrioritizeResponseData
