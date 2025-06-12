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


class Introduction(BaseModel):
    title: str
    description: str


class Subaction(BaseModel):
    number: int
    title: str
    description: str


class SubactionList(BaseModel):
    items: List[Subaction]


class Institution(BaseModel):
    name: str
    description: str


class InstitutionList(BaseModel):
    items: List[Institution]


class Milestone(BaseModel):
    number: int
    title: str
    description: str


class MilestoneList(BaseModel):
    items: List[Milestone]


class Timeline(BaseModel):
    pass


class CostBudget(BaseModel):
    pass


class MerIndicator(BaseModel):
    description: str


class MerIndicatorList(BaseModel):
    items: List[MerIndicator]


class Mitigation(BaseModel):
    title: str
    description: str


class MitigationList(BaseModel):
    items: List[Mitigation]


class Adaptation(BaseModel):
    title: str
    description: str


class AdaptationList(BaseModel):
    items: List[Adaptation]


class SDG(BaseModel):
    title: str
    description: str


class SDGList(BaseModel):
    items: List[SDG]


class PlanContent(BaseModel):
    introduction: Introduction = Field(
        description="Introduction of the plan, including title and description"
    )
    subactions: SubactionList = Field(
        default_factory=lambda: SubactionList(items=[]),
        description="List of subactions, each with a number, title, and description",
    )
    institutions: InstitutionList = Field(
        default_factory=lambda: InstitutionList(items=[]),
        description="List of institutions, each with a name and description",
    )
    milestones: MilestoneList = Field(
        default_factory=lambda: MilestoneList(items=[]),
        description="List of milestones, each with a number, title, and description",
    )
    timeline: List[Timeline] = Field(
        default_factory=list,
        description="List of timelines, each with a title and description",
    )
    costBudget: List[CostBudget] = Field(
        default_factory=list,
        description="List of cost budgets, each with a title and description",
    )
    merIndicators: MerIndicatorList = Field(
        default_factory=lambda: MerIndicatorList(items=[]),
        description="List of MER indicators, each with a description",
    )
    mitigations: MitigationList = Field(
        default_factory=lambda: MitigationList(items=[]),
        description="List of mitigations, each with a title and description",
    )
    adaptations: AdaptationList = Field(
        default_factory=lambda: AdaptationList(items=[]),
        description="List of adaptations, each with a title and description",
    )
    sdgs: SDGList = Field(
        default_factory=lambda: SDGList(items=[]),
        description="List of SDGs, each with a title and description",
    )


class PlanCreatorMetadata(BaseModel):
    locode: str
    cityName: str
    actionId: str
    actionName: str
    createdAt: datetime


LanguageCode = str  # should be ISO 639-1 codes like 'en', 'es', 'pt'


class PlanResponse(BaseModel):
    metadata: PlanCreatorMetadata = Field(description="Metadata for the plan creator")
    content: PlanContent = Field(
        description="The plan content in the requested language"
    )
