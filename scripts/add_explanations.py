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


# Existing Pydantic model for a single action (unchanged)
class ActionItem(BaseModel):
    locode: str
    cityName: str
    region: str
    regionName: str
    actionId: str
    actionName: str
    actionPriority: int
    explanation: str


# ----------------------------------------------------------------------
# A new Pydantic model for a *single* explanation (actionId + explanation)
class ExplanationItem(BaseModel):
    actionId: str
    explanation: str


def load_action_data() -> List[dict]:
    """
    Loads the action data from 'data/climate_actions/output/merged.json' and returns it as a list of dicts.
    This is used to provide extra context if desired.
    """
    action_data_path = os.path.join(ACTIONS_FOLDER, ACTION_DATA_FILE)
    if not os.path.exists(action_data_path):
        return []

    with open(action_data_path, "r", encoding="utf-8") as f:
        actions_data = json.load(f)
        if not isinstance(actions_data, list):
            # In case the JSON has a structure not strictly a list
            return []
        return actions_data


def generate_single_explanation(
    city_data: dict,
    single_action: dict,
    single_action_additional_data: Optional[dict]
) -> Optional[str]:
    """
    Produce a short qualitative explanation for one action using city_data and
    the single action's additional data (if found). Returns just the explanation string.

    The LLM prompt is set so it returns a JSON with:
      {"actionId": "<id>", "explanation": "<text>"}

    We extract 'explanation' from that and return it.
    """
    # Build the minimal prompt:
    explanation_prompt = f"""
    ### Task
    You have city context and exactly one action (plus any additional data).
    Return ONLY a JSON object with two keys: 'actionId' and 'explanation'.
    Example: {{ "actionId": "ACTION_123", "explanation": "..." }}

    Constraints:
    - The 'actionId' must match the 'actionId' from the input.
    - The 'explanation' must be 3-5 sentences describing why this action is a priority (or not).
    - No numeric scores or internal model references.
    - Do not mention other actions, only focus on this one.

    # CITY DATA:
    {city_data}

    # CURRENT ACTION:
    {single_action}

    # ACTION ADDITIONAL DATA:
    {single_action_additional_data}
    """

    try:
        # We'll use parse with Pydantic ExplanationItem to ensure correct structure.
        completion = client.beta.chat.completions.parse(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You must return a JSON object with exactly two keys: "
                        "'actionId' (matching the actionId in the input) and 'explanation'. "
                        "No extra keys, no internal data."
                    ),
                },
                {"role": "user", "content": explanation_prompt},
            ],
            temperature=0,
            response_format=ExplanationItem
        )

        # 'completion' is already validated by ExplanationItem
        # It will have the form ExplanationItem(actionId="...", explanation="...")
        response_content = completion.choices[0].message.content
        response_data = json.loads(response_content)
        print(f"response_data: {response_data}")
        if "explanation" in response_data:
            print(response_data["explanation"])
            return response_data["explanation"]
        else:
            print("Warning: No explanations found in response")
            return []

    except Exception as e:
        print(f"Error generating explanation for action '{single_action.get('actionId')}': {str(e)}")
        return None


def update_actions_with_explanations(actions_data: List[dict], city_data: dict) -> List[dict]:
    """
    For each action in actions_data:
      1. Find corresponding additional data from the merged file (if any).
      2. Call 'generate_single_explanation' to get an explanation string.
      3. Insert that explanation into the action.
    Return the updated list of actions.
    """
    # Load the entire additional data set, so we can find extra context if needed.
    actions_whole = load_action_data()

    for action in actions_data:
        # Identify this action's ID
        current_id = action.get("actionId", "")

        # Find the additional data for this single action
        # (There may be many in 'actions_whole'; we find only the relevant one)
        single_action_additional_data = None
        for add_data in actions_whole:
            if add_data.get("actionId") == current_id:
                single_action_additional_data = add_data
                break

        # Call LLM to get a single explanation for this single action
        explanation_text = generate_single_explanation(
            city_data=city_data,
            single_action=action,
            single_action_additional_data=single_action_additional_data
        )

        # Merge that explanation back into the original action
        if explanation_text is not None:
            action["explanation"] = explanation_text

    return actions_data


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

        # 5. Load the prioritized file (which has a list of actions)
        with open(input_path, "r", encoding="utf-8") as inp:
            actions_data = json.load(inp)

        # 6. Generate an explanation per action and merge them
        updated_actions_data = update_actions_with_explanations(actions_data, city_data)

        print("Actions data updated for city", city_code)

        # 7. Save updated file in 'data/prioritized_updated' + original_name + "_updated"
        out_filename = filename.replace(".json", "_updated.json")
        output_path = os.path.join(OUTPUT_FOLDER, out_filename)
        with open(output_path, "w", encoding="utf-8") as outp:
            json.dump(updated_actions_data, outp, indent=4, ensure_ascii=False)

        print(f"Updated file saved as {out_filename}")


if __name__ == "__main__":
    main()
