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
                action_id,
                action_name,
                action_type,
                hazard_name,
                sector_names,
                subsector_names,
                primary_purpose,
                description,
                json_build_object(
                    'air_quality', cobenefits_airquality,
                    'water_quality', cobenefits_waterquality,
                    'habitat', cobenefits_habitat,
                    'cost_of_living', cobenefits_costofliving,
                    'housing', cobenefits_housing,
                    'mobility', cobenefits_mobility,
                    'stakeholder_engagement', cobenefits_stakeholderengagement
                ) AS cobenefits,
                equity_and_inclusion_considerations,
                json_build_object(
                    'stationary_energy', ghgreduction_stationary_energy,
                    'transportation', ghgreduction_transportation,
                    'waste', ghgreduction_waste,
                    'ippu', ghgreduction_ippu,
                    'afolu', ghgreduction_afolu
                ) AS ghgreductionpotential,
                adaptation_effectiveness,
                cost_investment_needed,
                timeline_for_implementation,
                dependencies,
                key_performance_indicators,
                powers_and_mandates,
                json_build_object(
                    'droughts', adaptation_effectiveness_droughts,
                    'heatwaves', adaptation_effectiveness_heatwaves,
                    'floods', adaptation_effectiveness_floods,
                    'sea-level-rise', adaptation_effectiveness_sealevelrise,
                    'landslides', adaptation_effectiveness_landslides,
                    'storms', adaptation_effectiveness_storms,
                    'wildfires', adaptation_effectiveness_wildfires,
                    'diseases', adaptation_effectiveness_diseases
                ) AS adaptationeffectivenessperhazard,
                biome
            FROM modelled.cap_climate_action
            ORDER BY action_id
            """
        )
        result = session.execute(query).mappings().all()
        return result


@api_router.get(
    "/climate_actions", summary="Get all climate actions as a list of dictionaries"
)
def get_climate_actions(
    language: str = 'all' # This returns descriptive fields in specific language, all returns all the translatations
):
    """
    Retrieve all climate actions from the database.
    Returns a list of climate actions with their details.
    """
    try:
        responses = db_climate_actions()
        if not responses:
            return []

        results = []
        for response in responses:
            # Checking and extracting the specific language content from JSON fields
            action_name = response.get("action_name", {}).get(language, response.get("action_name"))
            description = response.get("description", {}).get(language, response.get("description"))
            equity_and_inclusion = response.get("equity_and_inclusion_considerations", {}).get(language, response.get("equity_and_inclusion_considerations"))
            dependencies = response.get("dependencies", {}).get(language, response.get("dependencies"))
            key_performance_indicators = response.get("key_performance_indicators", {}).get(language, response.get("key_performance_indicators"))

            result = {
                "ActionID": response.get("action_id"),
                "ActionName": action_name,
                "ActionType": response.get("action_type"),
                "Hazard": response.get("hazard_name"),
                "Sector": response.get("sector_names"),
                "Subsector": response.get("subsector_names"),
                "PrimaryPurpose": response.get("primary_purpose"),
                "Description": description,
                "CoBenefits": response.get("cobenefits"),
                "EquityAndInclusionConsiderations": equity_and_inclusion,
                "GHGReductionPotential": response.get("ghgreductionpotential"),
                "AdaptationEffectiveness": response.get("adaptation_effectiveness"),
                "CostInvestmentNeeded": response.get("cost_investment_needed"),
                "TimelineForImplementation": response.get("timeline_for_implementation"),
                "Dependencies": dependencies,
                "KeyPerformanceIndicators": key_performance_indicators,
                "PowersAndMandates": response.get("powers_and_mandates"),
                "AdaptationEffectivenessPerHazard": response.get("adaptationeffectivenessperhazard"),
                "biome": response.get("biome")
            }
            results.append(result)  # Adding each constructed result to the results list

        return results

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error retrieving climate actions: {str(e)}"
        )
