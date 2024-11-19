import pandas as pd
from typing import Optional
import json
from utils.llm_creator import generate_response
from context.intervention_type import categories_of_interventions
from context.behavioral_change_targeted import context_for_behavioral_change
from langsmith import traceable


def extract_ActionID():
    # ActionID will be set in the main script as incremental index
    raise NotImplementedError


def extract_ActionType(row: pd.Series) -> Optional[list]:
    # Get action type from the 'Adaption/Mitigation' column
    action_type_raw = row.get("Adaption/Mitigation")

    # Check if the value is null or not a string
    if pd.isnull(action_type_raw) or not isinstance(action_type_raw, str):
        return None

    # Split by commas if there are multiple action types, strip whitespace, and convert to lowercase
    action_type_list = [item.strip().lower() for item in action_type_raw.split(",")]

    return action_type_list


def extract_ActionName(row: pd.Series) -> Optional[str]:
    # Use 'Title' column
    # Simple 1:1 mapping

    action_name = row.get("Title")

    # Check if the 'Title' column is null or not a string
    if pd.isnull(action_name) or not isinstance(action_name, str):
        return None

    return action_name


# Applies only to adaptation actions
def extract_AdaptationCategory(row: pd.Series, action_type: list) -> Optional[str]:
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
def extract_Hazard(row: pd.Series, action_type: list) -> Optional[list]:
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

    else:
        # For mitigation actions, adaptation category is not applicable
        print("Mitigation action found, not applicable for 'Hazard'")
        return None


def extract_Sector(row: pd.Series) -> Optional[list]:
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
        "afolu": "afolu",
        "ippu": "ippu",
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
def extract_Subsector(row: pd.Series, action_type: list) -> Optional[list]:
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


def extract_PrimaryPurpose(action_type: list) -> Optional[list]:
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
@traceable(name="Extract InterventionType")
def extract_InterventionType(row: pd.Series, action_type: list) -> Optional[list]:
    """
    Extracts the intervention type for a climate action.

    Use 'Explainer for action card' column as the intervention type and map them based on context provided
    """

    if "mitigation" in action_type:

        # Get value of 'Explainer for action card'
        explainer_card = row.get("Explainer for action card")

        if pd.isnull(explainer_card) or not isinstance(explainer_card, str):
            return None

        prompt = f"""
Your task is to categorize the intervention type of a climate action based on the provided context.

The following is the discription of the climate action: {explainer_card}
The following dictionary provides the categories of interventions and their descriptions: {json.dumps(categories_of_interventions, indent=4)}

Your answer **must only** consists of a list of categories of interventions that best describe the climate action.
For example: ["taxes_and_fees", "regulations_and_laws"] or ["programs_and_initiatives"].

Please provide your answer below:
[]
"""
        response_string = generate_response(prompt)

        # Convert the string to a Python list
        response_list = json.loads(response_string)

        return response_list
    else:
        # For adaptation actions, print message and return None
        print("Adaptation action found, not applicable for 'InterventionType'")
        return None


def extract_Description(row: pd.Series) -> Optional[str]:
    # Use 'Explainer for action card' column as the intervention type
    # Simple 1:1 mapping

    # Extract the description from the 'Explainer for action card' column
    description = row.get("Explainer for action card")

    # Check if the 'Explainer for action card' column is empty
    if pd.isnull(description) or not isinstance(description, str):
        return None

    return description


@traceable(name="Extract BehavioralChangeTargeted")
def extract_BehavioralChangeTargeted(
    row: pd.Series, action_type: list, intervention_type: list
) -> Optional[str]:
    """
    Extracts the targeted behavioral change for a climate action.

    Use 'Explainer for action card' column which describes the activity together with previously extracted information about the intervention type
    and context provided about behavioral change theory and activity shifts to use an LLM to create a plausible targeted behavioral shift.
    """

    # Check action type
    if "mitigation" in action_type:

        # Get value of 'Explainer for action card'
        explainer_card = row.get("Explainer for action card")

        if pd.isnull(explainer_card) or not isinstance(explainer_card, str):
            return None

        prompt = f"""
Your task is to identify and to describe the targeted behavioral change in people encouraged by the intervention of a climate action based on the description of the action and provided context.

The following is the description of the climate action: 
{explainer_card}

The following is the list of identified intervention types of the climate action: 
{intervention_type}

The following dictionary provides the categories of interventions and their descriptions: 
{json.dumps(categories_of_interventions, indent=4)}

The following is the context for behavioral change theory and activity shifts: 
{context_for_behavioral_change}

Provide a short and precise targeted behavioral shift that the climate action aims to achieve taking all the provided information into account.
"""

        response = generate_response(prompt)

        return response
    else:
        # For adaptation actions, print message and return dict as is
        print("Adaptation action found, not applicable for 'BehavioralChangeTargeted'")
        return None


def extract_CoBenefits(row: pd.Series) -> Optional[dict]:
    # Use different columns like air quality, water quality, ....

    # Create result dictionary with default None values for each co-benefit
    dict_co_benefits = {
        "air_quality": None,
        "water_quality": None,
        "eco_systems": None,
        "income_and_poverty": None,
        "housing": None,
        "mobility": None,
    }

    # Extract the co-benefits from the respective columns
    air_quality = row.get("Air Quality")
    if pd.isnull(air_quality) or not isinstance(air_quality, str):
        air_quality_lower = None

    else:
        # Lowercase and strip whitespace for consistent processing
        air_quality_lower = air_quality.lower().strip()

    water_quality = row.get("Water Quality")
    if pd.isnull(water_quality) or not isinstance(water_quality, str):
        water_quality_lower = None
    else:
        # Lowercase and strip whitespace for consistent processing
        water_quality_lower = water_quality.lower().strip()

    eco_systems = row.get("Ecosystems ")  # Note the ' ' behinde the column name
    if pd.isnull(eco_systems) or not isinstance(eco_systems, str):
        eco_systems_lower = None
    else:
        # Lowercase and strip whitespace for consistent processing
        eco_systems_lower = eco_systems.lower().strip()

    income_and_poverty = row.get("Income and Poverty")
    if pd.isnull(income_and_poverty) or not isinstance(income_and_poverty, str):
        income_and_poverty_lower = None
    else:
        # Lowercase and strip whitespace for consistent processing
        income_and_poverty_lower = income_and_poverty.lower().strip()

    housing = row.get("Housing")
    if pd.isnull(housing) or not isinstance(housing, str):
        housing_lower = None
    else:
        # Lowercase and strip whitespace for consistent processing
        housing_lower = housing.lower().strip()

    mobility = row.get("Mobility")
    if pd.isnull(mobility) or not isinstance(mobility, str):
        mobility_lower = None
    else:
        # Lowercase and strip whitespace for consistent processing
        mobility_lower = mobility.lower().strip()

    mapping_scoring_co_benefits = {
        "very positive": 2,
        "somewhat positive": 1,
        "neutral": 0,
        "somewhat negative": -1,
        "very negative": -2,
    }

    dict_co_benefits["air_quality"] = mapping_scoring_co_benefits.get(air_quality_lower)
    dict_co_benefits["water_quality"] = mapping_scoring_co_benefits.get(
        water_quality_lower
    )
    dict_co_benefits["eco_systems"] = mapping_scoring_co_benefits.get(eco_systems_lower)
    dict_co_benefits["income_and_poverty"] = mapping_scoring_co_benefits.get(
        income_and_poverty_lower
    )
    dict_co_benefits["housing"] = mapping_scoring_co_benefits.get(housing_lower)
    dict_co_benefits["mobility"] = mapping_scoring_co_benefits.get(mobility_lower)

    return dict_co_benefits


@traceable(name="Extract EquityAndInclusionConsiderations")
def extract_EquityAndInclusionConsiderations(row: pd.Series) -> Optional[str]:
    """
    Extracts the equity and inclusion considerations for a climate action.

    It uses the 'Explainer for action card' column as the equity and inclusion consideration and uses LLM to fill in the gaps.
    """

    # Extract the value from the 'Explainer for action card' column
    explainer_card = row.get("Explainer for action card")

    # Check if the 'Explainer for action card' column is null
    if pd.isnull(explainer_card) or not isinstance(explainer_card, str):
        return None

    # TODO: Add more context to the prompt
    prompt = f"""
Your task is to identify how the climate action promotes equity and inclusion focusing on vulnerable or underserved communities based on the description of the action.
Do not make suggestions on how to improve equity and inclusion, but only describe how the action already considers these aspects.

The following is the description of the climate action: 
{explainer_card}

The following is further context for equity and inclusion considerations:
{""}

Provide short and precise considerations for equity and inclusion of this climate action taking all the provided information into account.
"""

    response = generate_response(prompt)

    return response


# Applies only to mitigation actions
def extract_GHGReductionPotential(
    row: pd.Series, action_type: list, sectors: list
) -> dict:
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
            "ippu": None,
            "afolu": None,
        }

        # Map extent to the corresponding sectors in dict_ghg_reduction_potential
        if "stationary_energy" in sectors:
            dict_ghg_reduction_potential["stationary_energy"] = extent_value
        if "transportation" in sectors:
            dict_ghg_reduction_potential["transportation"] = extent_value
        if "waste" in sectors:
            dict_ghg_reduction_potential["waste"] = extent_value
        if "ippu" in sectors:
            dict_ghg_reduction_potential["ippu"] = extent_value
        if "afolu" in sectors:
            dict_ghg_reduction_potential["afolu"] = extent_value

        return dict_ghg_reduction_potential
    else:
        # For adaptation actions, print message and return dict as is
        print("Adaptation action found, not applicable for 'GHGReductionPotential'")
        return None


# Applies only to adaptation actions
@traceable(name="Extract AdaptionEffectiveness")
def extract_AdaptionEffectiveness(
    action_type: list, description: str, hazard: list
) -> Optional[str]:
    """
    Extracts the effectiveness of an adaptation action.

    It takes in as input the 'Explainer for action card' column and the hazard from 'Climate hazards adressed' column.
    It then uses an LLM to generate a plausible answer.
    """

    # Only proceed if the action type is adaptation-related
    if "adaptation" in action_type:

        if pd.isnull(description) or not isinstance(description, str):
            return None

        if hazard is None or not all(isinstance(item, str) for item in hazard):
            # if pd.isnull(hazard) or not isinstance(hazard, list):
            return None

        prompt = f"""
Your task is to identify the effectiveness of an adaptation action based on the provided context.

The following is the description of the climate action:
{description}

The following is the climate hazard addressed by the action:
{hazard}

The possible answer is **one** of the following:
"high", "medium", "low"

For example: "high" or "medium".

Please provide your answer **without** double or single quotes below:
"""
        response = generate_response(prompt)

        return response
    else:
        # For mitigation actions, adaptation effectiveness is not applicable
        print("Mitigation action found, not applicable for 'AdaptationEffectiveness'")
        return None


def extract_CostInvestmentNeeded(row: pd.Series) -> Optional[str]:
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


def extract_TimelineForImplementation(row: pd.Series) -> Optional[str]:
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


@traceable(name="Extract Dependencies")
def extract_Dependencies(description: str) -> Optional[list]:
    # TODO: How to extract that?

    if pd.isnull(description) or not isinstance(description, str):
        return None

    prompt = f"""
Your task is to identify the dependencies of a climate action based on the provided context.

The following is the description of the climate action:
{description}

Your answer **must only** consists of a list of dependencies that the climate action relies on. The dependencies must be described in a brief way.
For example: ["This is a brief description of dependency 1", "This is a brief description of dependency 2"] or ["This is a brief description of the only identified dependency"].

Please provide your answer below:
[]
"""

    response_string = generate_response(prompt)

    # Convert the string to a Python list
    response_list = json.loads(response_string)

    return response_list


@traceable(name="Extract KeyPerformanceIndicators")
def extract_KeyPerformanceIndicators(description: str) -> Optional[list]:

    if pd.isnull(description) or not isinstance(description, str):
        return None

    prompt = f"""
Your task is to identify the key performance indicators (KPIs) of a climate action based on the provided context.

The following is the description of the climate action:
{description}

Your answer **must only** consists of a list of key performance indicators that are used to measure the success of the climate action.
For example: ["KPI 1", "KPI 2"] or ["KPI 1"].

Please provide your answer below:
[]
"""

    response_string = generate_response(prompt)

    # Convert the string to a Python list
    response_list = json.loads(response_string)

    return response_list


@traceable(name="Extract Impacts")
def extract_Impacts(
    action_type: Optional[list],
    sectors: Optional[list],
    subsectors: Optional[list],
    primary_purpose: Optional[list],
    intervention_type: Optional[list],
    description: Optional[str],
    behavioral_change_targeted: Optional[str],
    co_benefits: Optional[dict],
    equity_and_inclusion_considerations: Optional[str],
    ghg_reduction_potential: Optional[dict],
    adaptation_category: Optional[str],
    hazard: Optional[list],
    adaptation_effectiveness: Optional[str],
) -> Optional[list]:
    """
    Extracts the overall impacts of a climate action based on the provided context.
    It takes all relevant attributes of a climate action and uses an LLM to generate a plausible answer.

    It gives either an answer for mitigation actions, adaptation actions, or both based on the action type.
    """

    if action_type is None or not all(isinstance(item, str) for item in action_type):
        return None

    if description is None or not isinstance(description, str):
        return None

    # Process actions that are both mitigation and adaptation
    if "mitigation" in action_type and "adaptation" in action_type:
        prompt = f"""
Your task is to identify the overall impacts of a climate action based on the provided context.
For the given context may not all values be available, based on the climate action and available information, please provide the best possible answer.

The following is the description of the climate action:
{description}

The following is the adaptation category of the climate action:
{adaptation_category}

The following is the climate hazard addressed by the action:
{hazard}

The following is the list of identified sectors of the climate action:
{sectors}

The following is the list of identified subsectors of the climate action:
{subsectors}

The following is the list of identified primary purposes of the climate action:
{primary_purpose}

The following is the list of identified intervention types of the climate action:
{intervention_type}

The following is the targeted behavioral change in people encouraged by the intervention of the climate action:
{behavioral_change_targeted}

The following is the identified co-benefits of the climate action:
{json.dumps(co_benefits, indent=4)}

The following is the context for equity and inclusion considerations:
{equity_and_inclusion_considerations}

The following is the identified GHG reduction potential of the climate action:
{json.dumps(ghg_reduction_potential, indent=4)}

The following is the effectiveness of the adaptation action:
{adaptation_effectiveness}

Your answer **must only** consists of a list containing short and precise descriptions of the overall impacts of the climate action based on the provided information.
For example: ["Impact 1", "Impact 2"] or ["Impact 1"].

Please provide your answer below:
[]
"""
        response_string = generate_response(prompt)
        response_list = json.loads(response_string)
        return response_list

    # Process mitigation actions
    if "mitigation" in action_type:

        prompt = f"""
Your task is to identify the overall impacts of a climate mitigation action based on the provided context.
For the given context may not all values be available, based on the climate action and available information, please provide the best possible answer.

The following is the description of the climate action:
{description}

The following is the list of identified sectors of the climate action:
{sectors}

The following is the list of identified subsectors of the climate action:
{subsectors}

The following is the list of identified primary purposes of the climate action:
{primary_purpose}

The following is the list of identified intervention types of the climate action:
{intervention_type}

The following is the targeted behavioral change in people encouraged by the intervention of the climate action:
{behavioral_change_targeted}

The following is the identified co-benefits of the climate action:
{json.dumps(co_benefits, indent=4)}
The impact scores for the given categories are as follows: "very positive": 2, "somewhat positive": 1, "neutral": 0, "somewhat negative": -1, "very negative": -2

The following is the context for equity and inclusion considerations:
{equity_and_inclusion_considerations}

The following is the identified GHG reduction potential of the climate action:
{json.dumps(ghg_reduction_potential, indent=4)}
The value for a sector is given in percentage of GHG reduction potential.


Your answer **must only** consists of a list containing short and precise descriptions of the overall impacts of the climate action based on the provided information.
For example: ["Impact 1", "Impact 2"] or ["Impact 1"].

Please provide your answer below:
[]
"""
        response_string = generate_response(prompt)
        response_list = json.loads(response_string)
        return response_list

    # Process adaptation actions
    if "adaptation" in action_type:
        prompt = f"""
Your task is to identify the overall impacts of a climate adaptation action based on the provided context.
For the given context may not all values be available, based on the climate action and available information, please provide the best possible answer.

The following is the description of the climate action:
{description}

The following is the adaptation category of the climate action:
{adaptation_category}

The following is the climate hazard addressed by the action:
{hazard}

The following is the list of identified sectors of the climate action:
{sectors}

The following is the list of identified primary purposes of the climate action:
{primary_purpose}

The following is the identified co-benefits of the climate action:
{json.dumps(co_benefits, indent=4)}
The impact scores for the given categories are as follows: "very positive": 2, "somewhat positive": 1, "neutral": 0, "somewhat negative": -1, "very negative": -2

The following is the context for equity and inclusion considerations:
{equity_and_inclusion_considerations}

The following is the effectiveness of the adaptation action:
{adaptation_effectiveness}

Your answer **must only** consists of a list containing short and precise descriptions of the overall impacts of the climate action based on the provided information.
For example: ["Impact 1", "Impact 2"] or ["Impact 1"].

Please provide your answer below:
[]
"""

        response_string = generate_response(prompt)
        response_list = json.loads(response_string)
        return response_list
