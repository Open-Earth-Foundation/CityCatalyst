import pandas as pd


def extract_ActionID(row):
    # ActionID will be set in the main script as incremental index
    raise NotImplementedError


def extract_ActionType(row):
    # Use 'Adaption/Mitigation' column as the action type
    # Simple 1:1 mapping
    generated = False

    # Define the diciotnary
    dict_action_type = {"value": None, "generated": generated}

    # User .lower() to ensure consistency with later comparisons
    dict_action_type["value"] = row["Adaption/Mitigation"].lower()

    return dict_action_type


def extract_ActionName(row, action_type):
    # Use 'Title' column as the action name
    # Simple 1:1 mapping

    generated = False

    # Define the dictionary
    dict_action_name = {"value": None, "generated": generated}

    dict_action_name["value"] = row["Title"]

    return dict_action_name


def extract_AdaptationCategory(row, action_type):
    # Use 'Category 1' column as the adaptation category
    # Simple 1:1 mapping

    generated = False

    # Define the dictionary
    dict_adaptation_category = {"value": None, "generated": generated}

    if "adaptation" in action_type:
        dict_adaptation_category["value"] = row["Category 1"]
        return dict_adaptation_category

    else:
        # For mitigation actions, the adaptation category is not applicable
        print(
            "Mitigation action found, adaptation category not applicable for 'AdaptationCategory'"
        )
        return dict_adaptation_category


def extract_Hazard(row, action_type):
    # Process 'Climate hazards addressed' column
    generated = False

    # Define the dictionary
    dict_hazard = {"value": None, "generated": generated}

    if "adaptation" in action_type:
        hazards_str = row["Climate hazards adressed"]
        if pd.isnull(hazards_str):
            dict_hazard["value"] = []
            return dict_hazard
        else:
            # Assuming hazards are separated by semicolons
            hazard_mapping = {
                "Heatwaves": "Heatwave",
                "Flooding": "Flood",
                "Droughts": "Drought",
                "Sea-level rise": "Sea-level rise",
                "Landslides": "Landslides",
            }
            raw_hazards = [hazard.strip() for hazard in hazards_str.split(";")]
            mapped_hazards = [
                hazard_mapping.get(hazard, hazard) for hazard in raw_hazards
            ]
            value = mapped_hazards

            dict_hazard["value"] = value
            return dict_hazard
    else:
        # For mitigation actions, the adaptation category is not applicable
        print(
            "Mitigation action found, adaptation category not applicable for 'Hazard'"
        )
        return dict_hazard


def extract_Sector(row, action_type):
    # Use 'Emissions Source Category' column as the sector category
    # For now simple 1:1 mapping
    # TODO: Emission Souce Category contains strings like 'Stationary energy > Commercial buildings & facilities' which contain Sector and Subsector
    # Needs to be split either by simple regex or e.g. by using an LLM model if the content can be more complex
    generated = False

    # Define the dictionary
    dict_sector = {"value": None, "generated": generated}

    dict_sector["value"] = row["Emissions Source Category"]
    return dict_sector


def extract_Subsector(row, action_type):
    # Use 'Emissions Source Category' column as the sub sector category
    # For now simple 1:1 mapping
    # TODO: Emission Souce Category contains strings like 'Stationary energy > Commercial buildings & facilities' which contain Sector and Subsector
    # Needs to be split either by simple regex or e.g. by using an LLM model if the content can be more complex
    generated = False

    # Define the dictionary
    dict_subsector = {"value": None, "generated": generated}

    dict_subsector["value"] = row["Emissions Source Category"]
    return dict_subsector


def extract_PrimaryPurpose(row, action_type):
    # Use 'Explainer for action card' column as the primary purpose
    # Simple 1:1 mapping
    generated = False

    # Define the dictionary
    dict_primary_purpose = {"value": None, "generated": generated}

    dict_primary_purpose["value"] = row["Explainer for action card"]
    return dict_primary_purpose


def extract_InterventionType(row, action_type):
    # Use 'Explainer for action card' column as the intervention type
    # Simple 1:1 mapping
    # TODO: Define where we should get the intervention type from (e.g. excerpt from the explainer card)
    generated = True

    # Define the dictionary
    dict_intervention_type = {"value": None, "generated": generated}

    dict_intervention_type["value"] = row["Explainer for action card"]
    return dict_intervention_type


def extract_Description(row, action_type):
    # Use 'Explainer for action card' column as the intervention type
    # Simple 1:1 mapping
    # TODO: Define the difference between Description and Primary Purpose as both reference the same column
    generated = False

    # Define the dictionary
    dict_description = {"value": None, "generated": generated}

    dict_description["value"] = row["Explainer for action card"]
    return dict_description


def extract_BehavioralChangeTargeted(row, action_type):
    # Use 'Explainer for action card' column as the behavioral change targeted
    # Simple 1:1 mapping
    # TODO: Define where we should get the behavioral change targeted from (e.g. excerpt from the explainer card)
    generated = True

    # Define the dictionary
    dict_behavioral_change_targeted = {"value": None, "generated": generated}

    dict_behavioral_change_targeted["value"] = row["Explainer for action card"]
    return dict_behavioral_change_targeted


def extract_CoBenefits(row, action_type):
    # Use 'Explainer for action card' column as the co-benefits
    # Simple 1:1 mapping
    generated = True

    # Define the dictionary
    dict_co_benefits = {"value": None, "generated": generated}

    dict_co_benefits["value"] = row["Explainer for action card"]
    return dict_co_benefits


def extract_EquityAndInclusionConsiderations(row, action_type):
    # Use 'Explainer for action card' column as the equity and inclusion considerations
    # Simple 1:1 mapping
    generated = True

    # Define the dictionary
    dict_equity_and_inclusion_considerations = {"value": None, "generated": generated}

    dict_equity_and_inclusion_considerations["value"] = row["Explainer for action card"]
    return dict_equity_and_inclusion_considerations


def extract_GHGReductionPotential(row, action_type):
    # Use 'Emission Source Category' column to reference the sector
    # use 'Extent' column to reference the extent of GHG reductionS

    generated = False

    dict_ghg_reduction_potential = {
        "stationary_energy": {"value": None, "generated": generated},
        "transportation": {"value": None, "generated": generated},
        "waste": {"value": None, "generated": generated},
    }

    # Extract the extent and sector
    extent_value = row["Extent"]
    # TODO: Check if I can get this value from the previous extracted sector and not the original file
    sector = row[
        "Emissions Source Category"
    ].lower()  # Convert to lowercase for consistency

    # Map extent to the correct sector in ghg_reduction
    if "stationary energy" in sector:
        dict_ghg_reduction_potential["stationary_energy"]["value"] = extent_value
    elif "transportation" in sector:
        dict_ghg_reduction_potential["transportation"]["value"] = extent_value
    elif "waste" in sector:
        dict_ghg_reduction_potential["waste"]["value"] = extent_value

    return dict_ghg_reduction_potential


def extract_AdaptionEffectiveness(row, action_type):
    # TODO: How to extract that?

    generated = False

    # Define the dictionary
    dict_adaption_effectiveness = {"value": None, "generated": generated}

    if "adaptation" in action_type:
        # Implement logic here
        # TODO: How to extract that?
        return dict_adaption_effectiveness

    else:
        # For mitigation actions, the adaptation category is not applicable
        print(
            "Mitigation action found, adaptation category not applicable for 'AdaptionEffectiveness'"
        )
        return dict_adaption_effectiveness


def extract_CostInvestmentNeeded(row, action_type):
    # Use 'Cost of action' column as the cost investment needed
    # Simple 1:1 mapping

    generated = False

    # Define the dictionary
    dict_cost_investment_needed = {"value": None, "generated": generated}

    dict_cost_investment_needed["value"] = row["Cost of action "]
    return dict_cost_investment_needed


def extract_TimelineForImplementation(row, action_type):
    # Use 'Implementation Perdio' column as the timeline for implementation
    # Simple 1:1 mapping

    generated = False

    # Define the dictionary
    dict_timeline_for_implementation = {"value": None, "generated": generated}

    dict_timeline_for_implementation["value"] = row["Implementation Period"]
    return dict_timeline_for_implementation


def extract_Dependencies(row, action_type):
    # TODO: How to extract that?

    generated = False

    # Define the dictionary
    dict_dependencies = {"value": None, "generated": generated}

    # TODO: How to extract that?
    return dict_dependencies


def extract_KeyPerformanceIndicators(row, action_type):
    # TODO: How to extract that?

    generated = False

    # Define the dictionary
    dict_key_performance_indicators = {"value": None, "generated": generated}

    return dict_key_performance_indicators


def extract_Impacts(row, action_type):
    # TODO: How to extract that?

    generated = False

    # Define the dictionary
    dict_impacts = {"value": None, "generated": generated}

    return dict_impacts
