from pydantic import BaseModel, Field
from typing import Optional, List, Annotated, Dict
from datetime import datetime
from enum import Enum

# --- Enums ---


class PrioritizationType(str, Enum):
    MITIGATION = "mitigation"  # Set to mitigation to only run prioritization for mitigation actions
    ADAPTATION = "adaptation"  # Set to adaptation to only run prioritization for adaptation actions
    BOTH = "both"  # Set to both to run prioritization for both mitigation and adaptation actions


# --- Request models ---


class CityContextData(BaseModel):
    locode: str = Field(..., min_length=1, description="UN/LOCODE identifier")
    populationSize: Optional[int] = Field(
        default=None, ge=0, description="Population size of the city"
    )


class CityEmissionsData(BaseModel):
    stationaryEnergyEmissions: Optional[float] = Field(
        default=None, ge=0, description="Stationary energy emissions"
    )
    transportationEmissions: Optional[float] = Field(
        default=None, ge=0, description="Transportation emissions"
    )
    wasteEmissions: Optional[float] = Field(
        default=None, ge=0, description="Waste emissions"
    )
    ippuEmissions: Optional[float] = Field(
        default=None, ge=0, description="Industrial processes and product use emissions"
    )
    afoluEmissions: Optional[float] = Field(
        default=None,
        ge=0,
        description="Agriculture, forestry, and other land use emissions",
    )


class CityData(BaseModel):
    cityContextData: CityContextData
    cityEmissionsData: CityEmissionsData


LanguageList = Annotated[List[str], Field(min_length=1)]


class PrioritizerRequest(BaseModel):
    cityData: CityData
    countryCode: str = Field(
        default="BR",  # TODO: Field should be required but for now we default to Brazil
        min_length=2,
        max_length=2,
        description="ISO 3166-1 alpha-2 code",
    )
    prioritizationType: PrioritizationType = Field(
        default=PrioritizationType.BOTH,
        description="Type of actions to prioritize: mitigation, adaptation, or both",
    )
    language: LanguageList = Field(
        description="List of languages to return the explanations in",
    )


class PrioritizerRequestBulk(BaseModel):
    cityDataList: List[CityData]
    prioritizationType: PrioritizationType = Field(
        default=PrioritizationType.BOTH,
        description="Type of actions to prioritize: mitigation, adaptation, or both",
    )
    language: LanguageList = Field(
        description="List of languages to return the explanations in",
    )


# --- Response models ---


class StartPrioritizationResponse(BaseModel):
    taskId: str
    status: str


class CheckProgressResponse(BaseModel):
    status: str
    error: Optional[str] = None


class MetaData(BaseModel):
    locode: str
    rankedDate: datetime


class Explanation(BaseModel):
    explanations: Dict[str, str] = Field(
        ...,
        description="Map of ISO 2-letter language codes to explanation texts",
        min_length=1,  # At least one language is required
    )


class RankedAction(BaseModel):
    actionId: str
    rank: int
    explanation: Optional[Explanation] = None


class PrioritizerResponse(BaseModel):
    metadata: MetaData = Field(description="Metadata for the prioritizer")
    rankedActionsMitigation: List[RankedAction] = Field(
        description="List of ranked mitigation actions"
    )
    rankedActionsAdaptation: List[RankedAction] = Field(
        description="List of ranked adaptation actions"
    )


class PrioritizerResponseBulk(BaseModel):
    prioritizerResponseList: List[PrioritizerResponse]
