import os
import re
import json
from typing import List, Optional

from pydantic import BaseModel, Field
from openai import OpenAI
from dotenv import load_dotenv
load_dotenv()
# Initialize OpenAI client
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=OPENAI_API_KEY)
# Adjust these paths as needed:
PRIORITIZED_FOLDER = "data/prioritized"
CITIES_FOLDER = "data/cities"
OUTPUT_FOLDER = "data/prioritized_updated"
CITY_DATA_FILE = "city_data.json"  # The JSON file containing city data
ACTIONS_FOLDER = "data/climate_actions/output"
ACTION_DATA_FILE = "merged.json"

def extract_city_code(filename: str) -> str:
    """
    Extract city code from a filename that follows the pattern:
    'output_citycode_*.json'

    Example:
        filename = "output_BRSER_something.json"
        -> returns 'BRSER'
    """
    match = re.search(r"^output_([^_]+)", filename)
    if match:
        return match.group(1)
    return ""


def load_city_data(city_code: str) -> dict:
    """
    Loads the city data from 'data/cities/city_data.json' and finds the specific city data
    for the given city code.
    """
    city_data_path = os.path.join(CITIES_FOLDER, CITY_DATA_FILE)
    if not os.path.exists(city_data_path):
        return {}

    with open(city_data_path, "r", encoding="utf-8") as f:
        cities_data = json.load(f)
    
    # Find the specific city data from the array
    for city in cities_data:
        if city.get("locode") == city_code:
            return city
    
    return {}


# Pydantic model definitions
class ActionItem(BaseModel):
    locode: str
    cityName: str
    region: str
    regionName: str
    actionId: str
    actionName: str
    actionPriority: int
    explanation: str 


class ActionsList(BaseModel):
    actions: List[ActionItem]

def generate_explanation(city_data: dict, action_data: dict, action_additional_data: dict) -> str:
    """
    Produce a short qualitative explanation for the given action name,
    referencing city data for context if desired.
    """
    # Minimal placeholder logic:
    explanation_prompt = (
        """Task
        Your task is to generate a  qualitative explanation justifying why the model ranked one climate action higher than another for a specific city. The explanation should clearly articulate the reasoning without mentioning specific numerical data or internal model values. it should be about 3-5 sentences dpending on the complexity of the action. Dont mention other actions it should provide reasoning to why this action is good/bad in terms of the ranking logic please
        Input
        The input includes:
        city_data: City-specific context (population size, density, environmental features, sector emissions).
        action_a and action_b: Details about two climate actions being compared (e.g., emission reduction potential, sector targeted, cost-effectiveness, implementation timeline, risks addressed, co-benefits).
        Example actions:
        action_a: New Building Standards
        action_b: Bus Emissions
        Both actions are either mitigation or adaptation; never mixed.
        Model Prediction
        Output is -1 if action_b is preferred.
        Output is 1 if action_a is preferred.
        Output
        Provide only a client-friendly explanation focused on qualitative logic. Do not mention numerical scores or internal values.
        Example Explanation:
        "For the city [city name], the action [preferred action] was prioritized over [other action] primarily because it addresses emissions in the city's most critical emission sector more effectively. Additionally, it offers greater co-benefits such as improvements in air quality and housing comfort, despite having a slightly longer implementation period."
        Action Prioritization Guidelines
        Your explanation must reflect this order of qualitative importance:
        Emissions Reduction: Prioritize actions significantly reducing greenhouse gas (GHG) emissions, especially targeting the city's highest-emission sectors.
        Sector Relevance: Prefer actions focused on key sectors relevant to the city.
        Environmental Compatibility: Favor actions well-aligned with the city's specific environment, biome, and climate.
        Cost-effectiveness: Actions delivering higher benefits relative to costs are better.
        Risk Reduction: Actions effectively addressing climate-related risks and hazards.
        Socio-Demographic Suitability: Consider city population, density, and socio-economic context.
        Implementation Timeline: Actions that produce quicker benefits or have shorter timelines are preferable, considering implementation costs.
        Dependencies: Actions with fewer preconditions or dependencies are favored.
        City Capacity: Actions suitable for the city's resources and capacity for implementation.
        Explanation Characteristics
        Keep explanations concise and easy to understand for a general audience.
        Avoid quantitative data or specific numbers.
        Highlight strengths and limitations qualitatively.
        Do not use decisive terms like "best" or "worst."
        Clearly link reasoning to the city's context.
        Example Explanation
        "For the city [city name], action [preferred action] was chosen over [other action] because it significantly targets the city's main emission source and aligns closely with the local environment. It also provides additional benefits, such as improved water quality and reduced climate risks, even though it may require slightly higher initial investment or longer implementation time."
        Please return the whole updated list including the updated explanation key:
        #CITY DATA: {city_data}
        #ACTION DATA: {action_data}
        #ACTION ADDITIONAL DATA: {action_additional_data}
        """
    )
    try:
        completion = client.beta.chat.completions.parse(
            model="o3-mini",
            messages=[
                {"role": "system", "content": "You must return a json object following the ActionsList schema for whole 20 actions. You are a climate action prioritization expert who provides clear, qualitative explanations for action rankings following user instruction clearly."},
                {"role": "user", "content": explanation_prompt}
            ],
            response_format=ActionsList
        )
        
        # Parse the response into our Pydantic model
        response_data = json.loads(completion.choices[0].message.content)
    except Exception as e:
        print(f"Error generating explanation: {str(e)}")
        # Fallback to a basic explanation if the API call fails
        return 

    return response_data


def load_action_data() -> dict:
    """
    Loads the action data from 'data/actions/action_data.json' and finds the specific action data
    for the given action id.
    """
    action_data_path = os.path.join(ACTIONS_FOLDER, ACTION_DATA_FILE)
    if not os.path.exists(action_data_path):
        return {}

    with open(action_data_path, "r", encoding="utf-8") as f:
        actions_data = json.load(f) 
        
        return actions_data

def update_actions_with_explanations(actions_data: List[dict], city_data: dict) -> List[dict]:
    """
    Update the explanation field for each action in actions_data using city_data context.
    Return a list of updated action dictionaries.
    """
    actions_whole = load_action_data()
    actions_ids = [action.get("actionId", "") for action in actions_whole]
    actions_additional_data = [action for action in actions_whole if action.get("actionId") in actions_ids]
        
    updated_actions = generate_explanation(city_data, actions_data, actions_additional_data)

    return updated_actions


def main():
    # 1. Create output folder if it doesn't exist
    if not os.path.exists(OUTPUT_FOLDER):
        os.makedirs(OUTPUT_FOLDER)

    # 2. List all files in data/prioritized
    files = [f for f in os.listdir(PRIORITIZED_FOLDER) if f.endswith(".json")]

    for filename in files:
        input_path = os.path.join(PRIORITIZED_FOLDER, filename)

        # 3. Extract city code from filename
        city_code = extract_city_code(filename)

        # 4. Load city data
        city_data = load_city_data(city_code)

        # 5. Open the prioritized file
        with open(input_path, "r", encoding="utf-8") as inp:
            actions_data = json.load(inp)

        # 6. Generate updated explanations
        updated_actions_data = update_actions_with_explanations(actions_data, city_data)

        print("Actions data updated for city", city_code)
        # 7. Save updated file in 'data/prioritized_updated' + original_name + "_updated"
        out_filename = filename.replace(".json", "_updated.json")
        output_path = os.path.join(OUTPUT_FOLDER, out_filename)
        with open(output_path, "w", encoding="utf-8") as outp:
            # Dump the validated structure
            json.dump(updated_actions_data, outp, indent=4, ensure_ascii=False)

        print(f"Updated file saved as {out_filename}")


if __name__ == "__main__":
    main()
