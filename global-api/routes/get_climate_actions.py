from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from db.database import SessionLocal
from typing import List, Dict, Any

api_router = APIRouter(prefix="/api/v0")


def db_climate_actions() -> List[Dict[str, Any]]:
    with SessionLocal() as session:
        query = text(
            """
            SELECT 
                "ActionID",
                "ActionName",
                "ActionType",
                "Hazard",
                "Sector",
                "Subsector",
                "PrimaryPurpose",
                "Description",
                "CoBenefitsAirQuality",
                "CoBenefitsWaterQuality",
                "CoBenefitsHabitat",
                "CoBenefitsCostOfLiving",
                "CoBenefitsHousing",
                "CoBenefitsMobility",
                "CoBenefitsStakeholderEngagement",
                "EquityAndInclusionConsiderations",
                "GHGReductionPotentialStationaryEnergy",
                "GHGReductionPotentialTransportation",
                "GHGReductionPotentialWaste",
                "GHGReductionPotentialIPPU",
                "GHGReductionPotentialAFOLU",
                "AdaptationEffectiveness",
                "AdaptationEffectivenessDroughts",
                "AdaptationEffectivenessHeatwaves",
                "AdaptationEffectivenessFloods",
                "AdaptationEffectivenessSeaLevelRise",
                "AdaptationEffectivenessLandslides",
                "AdaptationEffectivenessStorms",
                "AdaptationEffectivenessWildfires",
                "AdaptationEffectivenessDiseases",
                "CostInvestmentNeeded",
                "TimelineForImplementation",
                "Dependencies",
                "KeyPerformanceIndicators",
                "PowersAndMandates",
                "Biome"
            FROM climate_action
            ORDER BY "ActionID"
        """
        )

        result = session.execute(query).mappings().all()

        # Process the results to construct dictionaries
        actions = []
        for row in result:
            action_dict = dict(row)

            # Construct CoBenefits dictionary
            co_benefits = {
                "air_quality": action_dict.pop("CoBenefitsAirQuality"),
                "water_quality": action_dict.pop("CoBenefitsWaterQuality"),
                "habitat": action_dict.pop("CoBenefitsHabitat"),
                "cost_of_living": action_dict.pop("CoBenefitsCostOfLiving"),
                "housing": action_dict.pop("CoBenefitsHousing"),
                "mobility": action_dict.pop("CoBenefitsMobility"),
                "stakeholder_engagement": action_dict.pop(
                    "CoBenefitsStakeholderEngagement"
                ),
            }
            action_dict["CoBenefits"] = co_benefits

            # Construct GHGReductionPotential dictionary
            ghg_reduction = {
                "stationary_energy": action_dict.pop(
                    "GHGReductionPotentialStationaryEnergy"
                ),
                "transportation": action_dict.pop(
                    "GHGReductionPotentialTransportation"
                ),
                "waste": action_dict.pop("GHGReductionPotentialWaste"),
                "ippu": action_dict.pop("GHGReductionPotentialIPPU"),
                "afolu": action_dict.pop("GHGReductionPotentialAFOLU"),
            }
            action_dict["GHGReductionPotential"] = ghg_reduction

            # Construct AdaptationEffectivenessPerHazard dictionary
            adaptation_effectiveness_per_hazard = {
                "droughts": action_dict.pop("AdaptationEffectivenessDroughts"),
                "heatwaves": action_dict.pop("AdaptationEffectivenessHeatwaves"),
                "floods": action_dict.pop("AdaptationEffectivenessFloods"),
                "sea-level-rise": action_dict.pop(
                    "AdaptationEffectivenessSeaLevelRise"
                ),
                "landslides": action_dict.pop("AdaptationEffectivenessLandslides"),
                "storms": action_dict.pop("AdaptationEffectivenessStorms"),
                "wildfires": action_dict.pop("AdaptationEffectivenessWildfires"),
                "diseases": action_dict.pop("AdaptationEffectivenessDiseases"),
            }
            action_dict["AdaptationEffectivenessPerHazard"] = (
                adaptation_effectiveness_per_hazard
            )

            actions.append(action_dict)

        return actions


@api_router.get(
    "/climate_actions", summary="Get all climate actions as a list of dictionaries"
)
def get_climate_actions():
    """
    Retrieve all climate actions from the database.

    Returns a list of climate actions with their details.
    """
    try:
        response = db_climate_actions()
        if not response:
            return []
        return response
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error retrieving climate actions: {str(e)}"
        )
