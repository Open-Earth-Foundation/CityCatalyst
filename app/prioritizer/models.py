from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

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


class PrioritizerRequest(BaseModel):
    cityData: CityData


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


class RankedAction(BaseModel):
    actionId: str
    rank: int
    explanation: str


class PrioritizerResponse(BaseModel):
    metadata: MetaData = Field(description="Metadata for the prioritizer")
    rankedActionsMitigation: List[RankedAction] = Field(
        description="List of ranked mitigation actions"
    )
    rankedActionsAdaptation: List[RankedAction] = Field(
        description="List of ranked adaptation actions"
    )
