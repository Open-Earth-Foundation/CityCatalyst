from pydantic import BaseModel, Field
from typing import Optional, List, Dict

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


### WIP for the plan creation response ###


class PlanMetadata(BaseModel):
    locode: str
    cityName: str
    actionId: str
    actionName: str


class PlanContent(BaseModel):
    title: str
    description: str
    subactions: List[dict] = Field(
        description="List of subactions with their descriptions"
    )
    municipalInstitutions: List[dict] = Field(
        description="List of institutions with their roles and sources"
    )
    milestones: List[dict] = Field(
        description="List of milestones with their descriptions"
    )
    merIndicators: List[dict] = Field(
        description="List of MER indicators with their descriptions"
    )
    climateRisks: List[dict] = Field(
        description="List of climate risks with their descriptions"
    )
    mitigationSectors: List[dict] = Field(
        description="List of mitigation sectors with their descriptions"
    )


class Plan(BaseModel):
    metadata: PlanMetadata
    content: Dict[str, PlanContent] = Field(
        description="Plan content in different languages, keyed by language code (e.g. 'en', 'es')"
    )
