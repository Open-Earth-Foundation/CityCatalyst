from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime, date

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


class PlanRequest(BaseModel):
    cityData: CityData
    actionId: str = Field(..., min_length=1, description="Action ID")
    language: str = Field(
        default="en", min_length=2, max_length=2, description="ISO Language code"
    )


# --- Response models ---


class StartPlanCreationResponse(BaseModel):
    taskId: str
    status: str


class CheckProgressResponse(BaseModel):
    status: str
    error: Optional[str] = None


class Subaction(BaseModel):
    number: int
    title: str
    description: str


class Institution(BaseModel):
    name: str
    description: str


class Milestone(BaseModel):
    number: int
    title: str
    description: str


class Timeline(BaseModel):
    pass


class CostBudget(BaseModel):
    pass


class MerIndicator(BaseModel):
    description: str


class Mitigation(BaseModel):
    title: str
    description: str


class Adaptation(BaseModel):
    title: str
    description: str


class SDG(BaseModel):
    title: str
    description: str


class PlanContent(BaseModel):
    title: str
    description: str
    subactions: List[Subaction] = Field(default_factory=list)
    institutions: List[Institution] = Field(default_factory=list)
    milestones: List[Milestone] = Field(default_factory=list)
    timeline: List[Timeline] = Field(default_factory=list)
    costBudget: List[CostBudget] = Field(default_factory=list)
    merIndicators: List[MerIndicator] = Field(default_factory=list)
    mitigations: List[Mitigation] = Field(default_factory=list)
    adaptations: List[Adaptation] = Field(default_factory=list)
    sdgs: List[SDG] = Field(default_factory=list)


class PlanCreatorMetadata(BaseModel):
    locode: str
    cityName: str
    actionId: str
    actionName: str
    createdAt: datetime


LanguageCode = str  # should be ISO 639-1 codes like 'en', 'es', 'pt'


class PlanResponse(BaseModel):
    metadata: PlanCreatorMetadata = Field(description="Metadata for the plan creator")
    content: Dict[LanguageCode, PlanContent] = Field(
        description="Dictionary of PlanContent, keyed by ISO 639-1 language code (e.g., 'en', 'es', 'pt')"
    )
