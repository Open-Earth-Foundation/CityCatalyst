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
                action_id as "ActionID",
                action_name as "ActionName",
                action_type as "ActionType",
                hazard as "Hazard",
                sector as "Sector",
                subsector as "Subsector",
                primary_purpose as "PrimaryPurpose",
                description as "Description",
                -- CoBenefits columns
                co_benefits_air_quality as "CoBenefits_air_quality",
                co_benefits_water_quality as "CoBenefits_water_quality",
                co_benefits_habitat as "CoBenefits_habitat",
                co_benefits_cost_of_living as "CoBenefits_cost_of_living",
                co_benefits_housing as "CoBenefits_housing",
                co_benefits_mobility as "CoBenefits_mobility",
                co_benefits_stakeholder_engagement as "CoBenefits_stakeholder_engagement",
                equity_and_inclusion_considerations as "EquityAndInclusionConsiderations",
                -- GHG Reduction Potential columns
                ghg_reduction_potential_stationary_energy as "GHGReductionPotential_stationary_energy",
                ghg_reduction_potential_transportation as "GHGReductionPotential_transportation",
                ghg_reduction_potential_waste as "GHGReductionPotential_waste",
                ghg_reduction_potential_ippu as "GHGReductionPotential_ippu",
                ghg_reduction_potential_afolu as "GHGReductionPotential_afolu",
                adaptation_effectiveness as "AdaptationEffectiveness",
                cost_investment_needed as "CostInvestmentNeeded",
                timeline_for_implementation as "TimelineForImplementation",
                dependencies as "Dependencies",
                key_performance_indicators as "KeyPerformanceIndicators",
                powers_and_mandates as "PowersAndMandates",
                adaptation_effectiveness_per_hazard as "AdaptationEffectivenessPerHazard",
                biome as "biome"
            FROM climate_action
        """
        )

        result = session.execute(query).mappings().all()

        # Process the results to construct dictionaries
        actions = []
        for row in result:
            action_dict = dict(row)

            # Construct CoBenefits dictionary
            co_benefits = {
                "air_quality": action_dict.pop("CoBenefits_air_quality"),
                "water_quality": action_dict.pop("CoBenefits_water_quality"),
                "habitat": action_dict.pop("CoBenefits_habitat"),
                "cost_of_living": action_dict.pop("CoBenefits_cost_of_living"),
                "housing": action_dict.pop("CoBenefits_housing"),
                "mobility": action_dict.pop("CoBenefits_mobility"),
                "stakeholder_engagement": action_dict.pop(
                    "CoBenefits_stakeholder_engagement"
                ),
            }
            action_dict["CoBenefits"] = co_benefits

            # Construct GHGReductionPotential dictionary
            ghg_reduction = {
                "stationary_energy": action_dict.pop(
                    "GHGReductionPotential_stationary_energy"
                ),
                "transportation": action_dict.pop(
                    "GHGReductionPotential_transportation"
                ),
                "waste": action_dict.pop("GHGReductionPotential_waste"),
                "ippu": action_dict.pop("GHGReductionPotential_ippu"),
                "afolu": action_dict.pop("GHGReductionPotential_afolu"),
            }
            action_dict["GHGReductionPotential"] = ghg_reduction

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
    response = db_climate_actions()

    if not response:
        raise HTTPException(status_code=404, detail="No climate actions found")

    return response
