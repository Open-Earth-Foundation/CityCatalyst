import pandas as pd
import re
from typing import Optional


def extract_ActionID(row):
    # ActionID will be set in the main script as incremental index
    raise NotImplementedError


def extract_ActionType(row) -> Optional[list]:
    # Get action type from the 'Adaption/Mitigation' column
    action_type_raw = row.get("Adaption/Mitigation")

    # Check if the value is null or not a string
    if pd.isnull(action_type_raw) or not isinstance(action_type_raw, str):
        return None

    # Split by commas if there are multiple action types, strip whitespace, and convert to lowercase
    action_type_list = [item.strip().lower() for item in action_type_raw.split(",")]

    return action_type_list


def extract_ActionName(row, action_type, sectors) -> Optional[str]:
    # Use 'Title' column
    # Simple 1:1 mapping

    action_name = row.get("Title")

    # Check if the 'Title' column is null or not a string
    if pd.isnull(action_name) or not isinstance(action_name, str):
        return None

    return action_name


# Applies only to adaptation actions
def extract_AdaptationCategory(row, action_type, sectors) -> Optional[str]:
    # Use 'Category 1' column as the adaptation category
    # Simple 1:1 mapping

    # Check if the action type is adaptation-related
    if "adaptation" in action_type:

        # Get the value
        adaptation_category = row.get("Category 1")

        # Check if 'Category 1' column is null
        if pd.isnull(adaptation_category) or not isinstance(adaptation_category, str):
            return None

        return adaptation_category

    else:
        # For mitigation actions, adaptation category is not applicable
        print("Mitigation action found, not applicable for 'AdaptationCategory'")
        return None


# Applies only to adaptation actions
def extract_Hazard(row, action_type, sectors) -> Optional[list]:
    # Only proceed if the action type is adaptation-related
    if "adaptation" in action_type:

        # Retrieve the 'Climate hazards adressed' column and check if it's a valid string
        hazards_str_raw = row.get("Climate hazards adressed")

        if pd.isnull(hazards_str_raw) or not isinstance(hazards_str_raw, str):
            return None

        # Convert to lowercase for consistent processing
        hazards_str_raw_lower = hazards_str_raw.lower()

        # Split hazards by commas and strip whitespace from each hazard
        hazards_list = [hazard.strip() for hazard in hazards_str_raw_lower.split(",")]

        # Define the mapping for hazards
        hazard_mapping = {
            "flood": "floods",
            "drought": "droughts",
            "heat": "heatwaves",
            "storm": "storms",
            "sea-level rise": "sea-level-rise",
            "landslide": "landslides",
            "disease": "diseases",
        }

        # Map hazards to their corresponding values in hazard_mapping
        mapped_hazards = [
            hazard_mapping.get(hazard)
            for hazard in hazards_list
            if hazard in hazard_mapping
        ]

        # Return the list of mapped hazards or None if no valid hazards (empty list []) found
        return mapped_hazards if mapped_hazards else None

    return None


def extract_Sector(row, action_type) -> Optional[list]:
    # Use 'Category 1' column
    # For now simple 1:1 mapping that maps only to the enum values

    # Get the value from the row
    sector_str = row.get("Category 1")

    if pd.isnull(sector_str) or not isinstance(sector_str, str):
        return None

    # Convert to lowercase for consistent processing
    sector_str_lower = sector_str.lower()

    # Split sectors by commas, then strip whitespace
    sectors_list = [sector.strip() for sector in sector_str_lower.split(",")]

    # Define mapping for known sector values to their respective enum values
    sector_mapping = {
        "stationary energy": "stationary_energy",
        "transportation": "transportation",
        "waste": "waste",
        "afolu": "agriculture_forestry_and_other_land_use",
        # The sectors given in the C40 list below have no clear assignment to the provided enum values
        "generation of grid-supplied energy": None,
        "eco-engineering": None,
        "technological actions": None,
        "ecosystem-based actions": None,
        "services actions": None,
        "educational/informational actions": None,
        "behavioural actions": None,
        "economic actions": None,
        "laws and regulations actions": None,
        "government policies and programs actions": None,
    }

    # Map sectors to their corresponding values in sector_mapping
    mapped_sectors = [
        sector_mapping.get(sector)
        for sector in sectors_list
        if sector in sector_mapping and sector_mapping[sector] is not None
    ]

    # Return the list of mapped sectors or None if no valid sectors are found
    return mapped_sectors if mapped_sectors else None


# Applies only to mitigation actions
def extract_Subsector(row, action_type, sectors) -> Optional[list]:
    # TODO: adjust so it only applied to mitigation actions
    # Use 'Category 1' column
    # For now simple 1:1 mapping that maps only to the enum values

    if "mitigation" in action_type:

        # Get the value from the row
        subsectors = row.get("Emissions Source Category")

        if pd.isnull(subsectors) or not isinstance(subsectors, str):
            return None

        # To lowercase for consistent processing
        subsectors_lower = subsectors.lower()

        # Check if the entry contains 'Total' to map to 'all'
        if "total" in subsectors_lower:
            return ["all"]

        # Split emission categories by commas
        subsectors_list = [
            subsector.strip() for subsector in subsectors_lower.split(",")
        ]

        # Define mapping for known subsector values to their respective enum values
        subsector_mapping = {
            "residential buildings": "residential_buildings",
            "commercial buildings & facilities": "commercial_and_institutional_buildings_and_facilities",
            "institutional buildings & facilities": "commercial_and_institutional_buildings_and_facilities",
            "industrial buildings & facilities": "manufacturing_industries_and_construction",
            "on-road": "on-road",
            "rail": "railways",
            "waterborne navigation": "waterborne_navigation",
            "solid waste disposal": "disposal_of_solid_waste_generated_in_the_city",
            "other afolu": None,  # This is not a clear subsector
        }

        # Extract and map each subsector
        mapped_subsectors = []
        for subcategory in subsectors_list:
            # Check for '>' symbol and extract the part after it if present
            if ">" in subcategory:
                extracted_subsector = subcategory.split(">")[-1].strip()
            else:
                extracted_subsector = subcategory

            # Map the extracted subsector using subsector_mapping
            mapped_subsector = subsector_mapping.get(extracted_subsector)
            if mapped_subsector:  # Only add valid mapped values
                mapped_subsectors.append(mapped_subsector)

        # Return the list of mapped subsectors or None if no valid mapping is found
        return mapped_subsectors if mapped_subsectors else None

    else:
        # For adaptation actions, subsector is not applicable
        print("Adaptation action found, not applicable for 'Subsector'")
        return None


def extract_PrimaryPurpose(row, action_type, sectors) -> Optional[list]:
    # Use extracted action_type from column 'Adaption/Mitigation' as the primary purpose
    # Simple 1:1 mapping
    # action_type is a list of strings

    # Initialize an empty list to store purposes
    primary_purposes = []

    # Check if 'mitigation' is in action_types
    if "mitigation" in action_type:
        primary_purposes.append("ghg_reduction")

    # Check if 'adaptation' is in action_types
    if "adaptation" in action_type:
        primary_purposes.append("climate_resilience")

    # Assign the list of purposes to 'value', or None if no valid purposes were added
    return primary_purposes if primary_purposes else None


# Applies only to mitigation actions
def extract_InterventionType(row, action_type, sectors) -> Optional[list]:
    # Use 'Explainer for action card' column as the intervention type

    # TODO: Define where we should get the intervention type from (e.g. excerpt from the explainer card)

    if "mitigation" in action_type:
        # TODO: Part of enricher, needs to be filled with actual data
        return None
    else:
        # For adaptation actions, print message and return None
        print("Adaptation action found, not applicable for 'InterventionType'")
        return None


def extract_Description(row, action_type, sectors) -> Optional[str]:
    # Use 'Explainer for action card' column as the intervention type
    # Simple 1:1 mapping

    # Extract the description from the 'Explainer for action card' column
    description = row.get("Explainer for action card")

    # Check if the 'Explainer for action card' column is empty
    if pd.isnull(description) or not isinstance(description, str):
        return None

    return description


def extract_BehavioralChangeTargeted(row, action_type, sectors) -> Optional[str]:
    # Use 'Explainer for action card' column as the behavioral change targeted and use LLM to fill in the gaps

    # Check action type
    if "mitigation" in action_type:
        # TODO: Implement logic here for 'Enricher' part
        return None
    else:
        # For adaptation actions, print message and return dict as is
        print("Adaptation action found, not applicable for 'BehavioralChangeTargeted'")
        return None


def extract_CoBenefits(row, action_type, sectors) -> Optional[list]:
    # Use different columns like air quality, water quality, ....

    # TODO: Implement logic here for 'Enricher' part
    return None


def extract_EquityAndInclusionConsiderations(
    row, action_type, sectors
) -> Optional[str]:
    # Use 'Explainer for action card' column as the equity and inclusion consideration and use LLM to fill in the gaps

    # TODO: Implement logic here for 'Enricher' part

    # Placeholder logic: currently returns None for 'value'
    return None


# Applies only to mitigation actions
def extract_GHGReductionPotential(row, action_type, sectors) -> dict:
    # Use 'Emission Source Category' column to reference the sector
    # use 'Extent' column to reference the extent of GHG reductionS

    # Check action type
    if "mitigation" in action_type:

        # Extract the extent and sector
        extent_value = row.get("Extent")

        if (
            pd.isnull(extent_value)
            or not isinstance(extent_value, str)
            or sectors is None
        ):
            return None

        # Remove the '%' symbol if present and strip any whitespace
        extent_value = extent_value.replace("%", "").strip()

        # Initialize the GHGReductionPotential dictionary with default None values for each sector
        dict_ghg_reduction_potential = {
            "stationary_energy": None,
            "transportation": None,
            "waste": None,
        }

        # Map extent to the corresponding sectors in dict_ghg_reduction_potential
        if "stationary_energy" in sectors:
            dict_ghg_reduction_potential["stationary_energy"] = extent_value
        if "transportation" in sectors:
            dict_ghg_reduction_potential["transportation"] = extent_value
        if "waste" in sectors:
            dict_ghg_reduction_potential["waste"] = extent_value

        return dict_ghg_reduction_potential
    else:
        # For adaptation actions, print message and return dict as is
        print("Adaptation action found, not applicable for 'GHGReductionPotential'")
        return None


# Applies only to adaptation actions
def extract_AdaptionEffectiveness(row, action_type, sectors) -> Optional[str]:
    # TODO: How to extract that? Let the LLM make a suggestion

    # Only proceed if the action type is adaptation-related
    if "adaptation" in action_type:
        # Placeholder logic, currently returning None for 'value'
        return None
    else:
        # For mitigation actions, adaptation effectiveness is not applicable
        print("Mitigation action found, not applicable for 'AdaptationEffectiveness'")
        return None


def extract_CostInvestmentNeeded(row, action_type, sectors) -> Optional[str]:
    # Use 'Cost of action' column as the cost investment needed
    # Simple 1:1 mapping

    # Extract the cost from the 'Cost of action' column
    cost_value = row.get("Cost of action ")  # Note the ' ' behinde the column name

    if pd.isnull(cost_value) or not isinstance(cost_value, str):
        return None

    # To lowercase for consistent processing
    cost_value_lower = cost_value.lower()

    cost_mapping = {
        "low cost": "low",
        "medium cost": "medium",
        "high cost": "high",
    }

    # Attempt to map cost_value_lower; returns None if not in cost_mapping
    mapped_cost_value = cost_mapping.get(cost_value_lower)

    # Return the mapped cost value, or None if no valid mapping was found
    return mapped_cost_value


def extract_TimelineForImplementation(row, action_type, sectors) -> Optional[str]:
    # Use 'Implementation Perdio' column as the timeline for implementation
    # Simple 1:1 mapping

    # Extract the timeline from the 'Implementation Period' column
    timeline_value = row.get("Implementation Period")

    # Check if 'Implementation Period' is null
    if pd.isnull(timeline_value) or not isinstance(timeline_value, str):
        return None

    # To lowercase for consistent processing
    timeline_value_lower = timeline_value.lower()

    return timeline_value_lower


def extract_Dependencies(row, action_type, sectors) -> Optional[list]:
    # TODO: How to extract that?

    # TODO: Implement logic here for extracting dependencies

    return None


def extract_KeyPerformanceIndicators(row, action_type, sectors) -> Optional[list]:
    # TODO: How to extract that?

    return None


def extract_Impacts(row, action_type, sectors) -> Optional[list]:
    # TODO: How to extract that?

    # TODO: Implement logic here for extracting impacts

    return None
