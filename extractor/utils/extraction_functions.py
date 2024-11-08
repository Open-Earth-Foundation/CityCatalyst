import pandas as pd
import re


def extract_ActionID(row):
    # ActionID will be set in the main script as incremental index
    raise NotImplementedError


def extract_ActionType(row):
    # Use 'Adaption/Mitigation' column
    # Simple 1:1 mapping
    generated = False

    # Define the diciotnary
    dict_action_type = {"value": None, "generated": generated}

    # User .lower() to ensure consistency with later comparisons
    dict_action_type["value"] = row["Adaption/Mitigation"].lower()

    return dict_action_type


def extract_ActionName(row, action_type):
    # Use 'Title' column
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
    # Define the dictionary with a default empty list for 'value' if no valid hazard is found
    dict_hazard = {
        "type": ["array", "null"],
        "items": {
            "type": "string",
            "enum": [
                "drought",
                "heatwaves",
                "floods",
                "sea-level-rise",
                "landslides",
                "wildfires",
                "diseases",
                "storms",
            ],
        },
        "description": "The hazard the action is aligned with (for adaptation actions).",
        "value": None,
        "generated": False,
    }

    # Only proceed if the action type is adaptation-related
    if "adaptation" in action_type:
        hazards_str = row.get("Climate hazards adressed")

        # Define the mapping for hazards
        hazard_mapping = {
            "Flood": "floods",
            "Drought": "drought",
            "Heat": "heatwaves",
            "Storm": "storms",
            "Sea-level rise": "sea-level-rise",
            "Landslides": "landslides",
            "Diseases": "diseases",
        }

        if pd.isnull(hazards_str):
            # If hazards_str is NaN, return the dictionary as is with value set to None
            return dict_hazard
        else:
            # Split hazards by commas, then strip whitespace
            raw_hazards = [hazard.strip() for hazard in hazards_str.split(",")]

            # Map hazards to their corresponding values in hazard_mapping
            mapped_hazards = [
                hazard_mapping.get(hazard)
                for hazard in raw_hazards
                if hazard in hazard_mapping
            ]

            # If any valid hazards are found, set them as the 'value'; otherwise, set to None
            dict_hazard["value"] = mapped_hazards if mapped_hazards else None

    return dict_hazard


def extract_Sector(row, action_type):
    # Use 'Category 1' column
    # For now simple 1:1 mapping that maps only to the enum values

    generated = False

    # Define the dictionary
    dict_sector = {
        "type": ["array", "null"],
        "items": {
            "type": "string",
            "enum": [
                "stationary_energy",
                "transport",
                "waste",
                "industrial_processes_and_product_use",
                "agriculture_forestry_and_other_land_use",
                "water_resources",
                "food_security",
                "energy_security",
                "biodiversity",
                "public_health",
                "railway_infrastructure",
                "road_infrastructure",
                "geo_hydrological_disasters",
            ],
        },
        "description": "The sector to which the action belongs.",
        "value": None,
        "generated": generated,
    }

    # Define mapping for known sector values to their respective enum values
    sector_mapping = {
        "Stationary Energy": "stationary_energy",
        "Transportation": "transport",
        "Waste": "waste",
        "AFOLU": "agriculture_forestry_and_other_land_use",
        # The sectors given in the C40 list below have no clear assignment to the provided enum values
        "Generation of grid-supplied energy": None,
        "Eco-engineering": None,
        "Technological actions": None,
        "Ecosystem-based actions": None,
        "Services actions": None,
        "Educational/Informational actions": None,
        "Behavioural actions": None,
        "Economic actions": None,
        "Laws and regulations actions": None,
        "Government policies and programs actions": None,
    }

    # Get the value from the row
    sector_str = row.get("Category 1")

    # Check if sector_str is NaN
    if pd.isnull(sector_str):
        # If sector_str is NaN, return the dictionary as is with value set to None
        return dict_sector
    else:
        # Split sectors by commas, then strip whitespace
        raw_sectors = [sector.strip() for sector in sector_str.split(",")]

        # Map sectors to their corresponding values in sector_mapping
        mapped_sectors = [
            sector_mapping.get(sector)
            for sector in raw_sectors
            if sector in sector_mapping and sector_mapping[sector] is not None
        ]

        # If any valid sectors are found, set them as the 'value'; otherwise, set to None
        dict_sector["value"] = mapped_sectors if mapped_sectors else None

    return dict_sector


def extract_Subsector(row, action_type):
    # Use 'Category 1' column
    # For now simple 1:1 mapping that maps only to the enum values

    generated = False

    # Define the dictionary with a default empty list for 'value' if no valid subsector is found
    dict_subsector = {
        "type": ["array", "null"],
        "items": {
            "type": "string",
            "enum": [
                "Residential buildings",
                "Commercial and institutional buildings and facilities",
                "Manufacturing industries and construction",
                "Energy industries",
                "Energy generation supplied to the grid",
                "Agriculture, forestry, and fishing activities",
                "Non-specified sources",
                "Fugitive emissions from mining, processing, storage, and transportation of coal",
                "Fugitive emissions from oil and natural gas systems",
                "On-road",
                "Railways",
                "Waterborne navigation",
                "Aviation",
                "Off-road",
                "Disposal of solid waste generated in the city",
                "Disposal of solid waste generated outside the city",
                "Biological treatment of waste generated in the city",
                "Biological treatment of waste generated outside the city",
                "Incineration and open burning of waste generated in the city",
                "Incineration and open burning of waste generated outside the city",
                "Wastewater generated in the city",
                "Wastewater generated outside the city",
                "Industrial processes",
                "Product use",
                "Livestock",
                "Land",
                "Aggregate sources and non-CO2 emission sources on land",
                "all",
            ],
        },
        "description": "The subsector the action is aligned with (for mitigation actions).",
        "value": None,
        "generated": generated,
    }

    # Define mapping for known subsector values to their respective enum values
    subsector_mapping = {
        "Residential buildings": "Residential buildings",
        "Commercial buildings & facilities": "Commercial and institutional buildings and facilities",
        "Institutional buildings & facilities": "Commercial and institutional buildings and facilities",
        "Industrial buildings & facilities": "Manufacturing industries and construction",
        "On-road": "On-road",
        "Rail": "Railways",
        "Waterborne navigation": "Waterborne navigation",
        "Solid waste disposal": "Disposal of solid waste generated in the city",
        "Other AFOLU": None,  # This is not a clear subsector
    }

    # Get the value from the row
    emission_category = row.get("Emissions Source Category")

    # Check if emission_category is NaN
    if pd.isnull(emission_category):
        return dict_subsector

    # Check if the entry contains 'Total' to map to 'all'
    if "Total" in emission_category:
        dict_subsector["value"] = ["all"]
        return dict_subsector

    # Split emission categories by commas
    raw_subsectors = [
        subcategory.strip() for subcategory in emission_category.split(",")
    ]

    # Extract and map each subsector
    mapped_subsectors = []
    for subcategory in raw_subsectors:
        # Extract part after '>' symbol if it exists
        match = re.search(r">\s*(.*)", subcategory)
        if match:
            extracted_subsector = match.group(1).strip()
        else:
            # If no '>' is found, skip this entry
            continue

        # Map the extracted subsector using subsector_mapping
        mapped_subsector = subsector_mapping.get(extracted_subsector)
        if mapped_subsector:  # Only add valid mapped values
            mapped_subsectors.append(mapped_subsector)

    # Assign mapped subsectors to 'value' or None if no valid mapping is found
    dict_subsector["value"] = mapped_subsectors if mapped_subsectors else None

    return dict_subsector


def extract_PrimaryPurpose(row, action_type):
    # Use extracted action_type from column 'Adaption/Mitigation' as the primary purpose
    # Simple 1:1 mapping
    generated = False

    # Define the dictionary with a default 'value' set to None
    dict_primary_purpose = {
        "type": "string",
        "description": "The main goal of the action, e.g., GHG Reduction, Climate Resilience.",
        "value": None,
        "generated": generated,
    }

    # Set the value based on the action type
    if action_type == "mitigation":
        dict_primary_purpose["value"] = "GHG Reduction"
    elif action_type == "adaptation":
        dict_primary_purpose["value"] = "Climate Resilience"

    return dict_primary_purpose


def extract_InterventionType(row, action_type):
    # Use 'Explainer for action card' column as the intervention type
    # Simple 1:1 mapping
    # TODO: Define where we should get the intervention type from (e.g. excerpt from the explainer card)
    generated = True

    # Define the dictionary with a default 'value' set to None
    dict_intervention_type = {
        "type": "array",
        "items": {
            "type": "string",
            "enum": [
                "Taxes and Fees",
                "Incentives and Subsidies",
                "Regulations and Laws",
                "Programs and Initiatives",
                "Infrastructure Investments",
            ],
        },
        "description": "Specifies the intervention category enabling the Activity Shift for mitigation actions.",
        "value": None,  # Placeholder, currently always returns None
        "generated": generated,
    }

    # TODO: Part of enricher, needs to be filled with actual data

    return dict_intervention_type


def extract_Description(row, action_type):
    # Use 'Explainer for action card' column as the intervention type
    # Simple 1:1 mapping

    generated = False

    # Define the dictionary based on the schema, setting 'value' from the 'Explainer for action card' column
    dict_description = {
        "type": "string",
        "description": "Detailed description of the action.",
        "value": None,
        "generated": generated,
    }

    # Check if the 'Explainer for action card' column is empty
    if pd.isnull(row["Explainer for action card"]):
        return dict_description

    dict_description["value"] = row["Explainer for action card"]
    return dict_description


def extract_BehavioralChangeTargeted(row, action_type):
    # Use 'Explainer for action card' column as the behavioral change targeted and use LLM to fill in the gaps
    generated = True

    dict_behavioral_change_targeted = {
        "type": "string",
        "description": "Describes the behavioural change encouraged by the intervention.",
        "value": None,
        "generated": generated,
    }

    # Check action type
    if "mitigation" in action_type:
        # TODO: Implement logic here for 'Enricher' part
        return dict_behavioral_change_targeted
    else:
        # For adaptation actions, print message and return dict as is
        print("Adaptation action found, not applicable for 'BehavioralChangeTargeted'")
        return dict_behavioral_change_targeted


def extract_CoBenefits(row, action_type):
    # Use different columns like air quality, water quality, ....
    generated = True

    # Define the dictionary based on the schema, setting 'value' to None for now
    dict_co_benefits = {
        "type": ["array", "null"],
        "items": {
            "type": "string",
            "enum": [
                "Air Quality",
                "Water Quality",
                "Habitat",
                "Cost of Living",
                "Housing",
                "Mobility",
                "Stakeholder Engagement",
            ],
        },
        "description": "Additional benefits beyond the primary objective.",
        "value": None,
        "generated": generated,
    }

    # TODO: Implement logic here for 'Enricher' part
    return dict_co_benefits


def extract_EquityAndInclusionConsiderations(row, action_type):
    # Use 'Explainer for action card' column as the equity and inclusion consideration and use LLM to fill in the gaps
    generated = True

    # Define the dictionary based on the schema, setting 'value' to None for now
    dict_equity_and_inclusion_considerations = {
        "type": "string",
        "description": "How the action promotes equity and inclusion, focusing on vulnerable or underserved communities.",
        "value": None,
        "generated": generated,
    }

    # TODO: Implement logic here for 'Enricher' part

    # Placeholder logic: currently returns None for 'value'
    return dict_equity_and_inclusion_considerations


def extract_GHGReductionPotential(row, action_type):
    # Use 'Emission Source Category' column to reference the sector
    # use 'Extent' column to reference the extent of GHG reductionS

    generated = False

    # Define the dictionary based on the schema, with properties for each sector
    dict_ghg_reduction_potential = {
        "type": "object",
        "properties": {
            "energy": {
                "type": ["string", "null"],
                "enum": ["0-19%", "20-39%", "40-59%"],
                "description": "Potential for GHG reduction in the energy sector.",
                "value": None,
                "generated": generated,
            },
            "transportation": {
                "type": ["string", "null"],
                "enum": ["0-19%", "20-39%", "40-59%"],
                "description": "Potential for GHG reduction in the transportation sector.",
                "value": None,
                "generated": generated,
            },
            "waste": {
                "type": ["string", "null"],
                "enum": ["0-19%", "20-39%", "40-59%"],
                "description": "Potential for GHG reduction in the waste sector.",
                "value": None,
                "generated": generated,
            },
        },
    }

    # Check action type
    if "mitigation" in action_type:

        # Extract the extent and sector
        extent_value = row.get("Extent")
        # Convert to string and lowercase for consistency
        sector = str(row.get("Emissions Source Category")).lower()

        # Map extent to the correct sector in dict_ghg_reduction_potential
        if "stationary energy" in sector:
            dict_ghg_reduction_potential["properties"]["energy"]["value"] = extent_value
        elif "transportation" in sector:
            dict_ghg_reduction_potential["properties"]["transportation"][
                "value"
            ] = extent_value
        elif "waste" in sector:
            dict_ghg_reduction_potential["properties"]["waste"]["value"] = extent_value

        return dict_ghg_reduction_potential
    else:
        # For adaptation actions, print message and return dict as is
        print("Adaptation action found, not applicable for 'GHGReductionPotential'")
        return dict_ghg_reduction_potential


def extract_AdaptionEffectiveness(row, action_type):
    # TODO: How to extract that? Let the LLM make a suggestion

    generated = False

    # Define the dictionary based on the schema, with 'value' set to None for now
    dict_adaption_effectiveness = {
        "type": ["string", "null"],
        "enum": ["High", "Medium", "Low", None],
        "description": "The effectiveness of the action in adapting to climate risks.",
        "value": None,
        "generated": generated,
    }

    # Only proceed if the action type is adaptation-related
    if "adaptation" in action_type:
        # Placeholder logic, currently returning None for 'value'
        return dict_adaption_effectiveness
    else:
        # For mitigation actions, adaptation effectiveness is not applicable
        print("Mitigation action found, not applicable for 'AdaptationEffectiveness'")
        return dict_adaption_effectiveness


def extract_CostInvestmentNeeded(row, action_type):
    # Use 'Cost of action' column as the cost investment needed
    # Simple 1:1 mapping

    generated = False

    # Define the dictionary based on the schema
    dict_cost_investment_needed = {
        "type": ["string", "null"],
        "enum": ["high", "medium", "low"],
        "description": "The financial viability of the action.",
        "value": None,
        "generated": generated,
    }

    if pd.isnull(row.get("Cost of action ")):  # Note the ' ' behinde the column name
        return dict_cost_investment_needed

    # Set value from the 'Cost of action' column, placeholder without specific mapping logic
    cost_value = row.get("Cost of action ")  # Note the ' ' behinde the column name

    # Assign cost_value directly for now
    dict_cost_investment_needed["value"] = cost_value

    return dict_cost_investment_needed


def extract_TimelineForImplementation(row, action_type):
    # Use 'Implementation Perdio' column as the timeline for implementation
    # Simple 1:1 mapping

    generated = False

    # Define the dictionary based on the schema
    dict_timeline_for_implementation = {
        "type": ["string", "null"],
        "enum": ["<5 years", "5-10 years", ">10 years"],
        "description": "Estimated time required to fully implement the action.",
        "value": None,
        "generated": generated,
    }

    # Check if 'Implementation Period' is null
    if pd.isnull(row.get("Implementation Period")):
        return dict_timeline_for_implementation

    # Set value from the 'Implementation Period' column
    timeline_value = row.get("Implementation Period")

    # Assign timeline_value directly for now
    dict_timeline_for_implementation["value"] = timeline_value

    return dict_timeline_for_implementation


def extract_Dependencies(row, action_type):
    # TODO: How to extract that?

    generated = False

    # Define the dictionary based on the schema, setting 'value' to None for now
    dict_dependencies = {
        "type": ["array", "null"],
        "items": {"type": "string"},
        "description": "Dependencies or prerequisites for the action to succeed.",
        "value": None,
        "generated": generated,
    }

    # TODO: Implement logic here for extracting dependencies

    return dict_dependencies


def extract_KeyPerformanceIndicators(row, action_type):
    # TODO: How to extract that?

    generated = False

    # Define the dictionary based on the schema, setting 'value' to None for now
    dict_key_performance_indicators = {
        "type": ["array", "null"],
        "items": {"type": "string"},
        "description": "Metrics to measure the success of the action.",
        "value": None,
        "generated": generated,
    }

    # TODO: Implement logic here for extracting Key Performance Indicators

    return dict_key_performance_indicators


def extract_Impacts(row, action_type):
    # TODO: How to extract that?

    generated = False

    # Define the dictionary based on the schema, setting 'value' to None for now
    dict_impacts = {
        "type": ["array", "null"],
        "items": {"type": "string"},
        "description": "Broader impacts, such as increased urban livability or improved public health.",
        "value": None,
        "generated": generated,
    }

    # TODO: Implement logic here for extracting impacts

    return dict_impacts
