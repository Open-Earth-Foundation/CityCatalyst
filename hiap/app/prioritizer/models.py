from pydantic import BaseModel, Field
from typing import Optional, List, Annotated, Dict
from datetime import datetime
from enum import Enum

# %%
# --- Enums ---


class PrioritizationType(str, Enum):
    MITIGATION = "mitigation"  # Set to mitigation to only run prioritization for mitigation actions
    ADAPTATION = "adaptation"  # Set to adaptation to only run prioritization for adaptation actions
    BOTH = "both"  # Set to both to run prioritization for both mitigation and adaptation actions


# Strict type aliases

NonNegativeInteger = Annotated[
    int,
    Field(ge=0, strict=True, description="Non-negative integer value"),
]


# %%
# --- Request models ---


class CityContextData(BaseModel):
    locode: Annotated[
        str,
        Field(
            pattern=r"^[A-Za-z]{2}\s[A-Za-z]{3}$",
            strict=True,
            description="UN/LOCODE identifier in the format 'AA BBB'",
        ),
    ]
    populationSize: NonNegativeInteger = Field(
        description="Population size of the city"
    )


class CityEmissionsData(BaseModel):
    stationaryEnergyEmissions: NonNegativeInteger = Field(
        description="Stationary energy emissions (integer, >= 0)"
    )
    transportationEmissions: NonNegativeInteger = Field(
        description="Transportation emissions (integer, >= 0)"
    )
    wasteEmissions: NonNegativeInteger = Field(
        description="Waste emissions (integer, >= 0)"
    )
    ippuEmissions: NonNegativeInteger = Field(
        description="Industrial processes and product use emissions (integer, >= 0)"
    )
    afoluEmissions: Annotated[int, Field(strict=True)] = Field(
        description="Agriculture, forestry, and other land use emissions (integer; can be negative, zero, or positive)"
    )


class CityData(BaseModel):
    cityContextData: CityContextData
    cityEmissionsData: CityEmissionsData


LanguageList = Annotated[
    List[
        Annotated[
            str,
            Field(
                pattern=r"^[A-Za-z]{2}$",
                strict=True,
                description="ISO 639-1 two-letter language code",
            ),
        ]
    ],
    Field(min_length=1),
]


class PrioritizerRequest(BaseModel):
    cityData: CityData
    countryCode: str = Field(
        default="BR",  # TODO: Field should be required but for now we default to Brazil
        pattern=r"^[A-Za-z]{2}$",
        strict=True,
        description="ISO 3166-1 alpha-2 code",
    )
    prioritizationType: PrioritizationType = Field(
        default=PrioritizationType.BOTH,
        description="Type of actions to prioritize: mitigation, adaptation, or both",
    )
    language: LanguageList = Field(
        default_factory=lambda: ["en"],
        description="List of languages to return the explanations in",
    )


class PrioritizerRequestBulk(BaseModel):
    cityDataList: List[CityData]
    countryCode: str = Field(
        default="BR",  # TODO: Field should be required but for now we default to Brazil
        pattern=r"^[A-Za-z]{2}$",
        strict=True,
        description="ISO 3166-1 alpha-2 code",
    )
    prioritizationType: PrioritizationType = Field(
        default=PrioritizationType.BOTH,
        description="Type of actions to prioritize: mitigation, adaptation, or both",
    )
    language: LanguageList = Field(
        default_factory=lambda: ["en"],
        description="List of languages to return the explanations in",
    )


# %%
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
