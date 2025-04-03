"""
This script updates the 'AdaptationEffectivenessPerHazard' field of each climate action.
It uses an LLM to determine the effectiveness of the action for each hazard.

It is a 'one-off' script, probably not needed again.

Input file:
data/climate_actions/output/merged.json

Output file:
data/climate_actions/output/merged_individual_adaptation_effectiveness.json

Execute:
python scripts/update_adaptation_effectiveness.py
"""

import json
import os
from pathlib import Path
from openai import OpenAI
from typing import Dict, Optional, Tuple
from dotenv import load_dotenv
from typing import Optional, Dict, Literal
from pydantic import BaseModel, Field

Effectiveness = Literal["high", "medium", "low"]  # no Optional here


# Define the Pydantic model correctly
class AdaptationEffectivenessPerHazard(BaseModel):
    """Model for hazard-specific adaptation effectiveness."""

    droughts: Optional[Effectiveness] = None
    heatwaves: Optional[Effectiveness] = None
    floods: Optional[Effectiveness] = None
    # sea-level-rise is an alias for sea_level_rise, as pydantic doesn't allow hyphens in field names
    sea_level_rise: Optional[Effectiveness] = Field(None, alias="sea-level-rise")
    landslides: Optional[Effectiveness] = None
    storms: Optional[Effectiveness] = None
    wildfires: Optional[Effectiveness] = None
    diseases: Optional[Effectiveness] = None


load_dotenv()

api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)

# Define base directory and paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data" / "climate_actions" / "output"
INPUT_FILE = DATA_DIR / "merged.json"
OUTPUT_FILE = DATA_DIR / "merged_individual_adaptation_effectiveness.json"


def load_json_file(file_path: Path) -> dict:
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json_file(data: dict, file_path: Path):
    # Ensure the directory exists
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def get_effectiveness_per_hazard(
    action: dict,
) -> Tuple[Dict[str, Optional[str]], bool, str]:
    # Get the hazards and current effectiveness from the action
    hazards = action.get("Hazard", [])

    # Handle empty hazards list
    # If no hazards, return an empty dictionary and a success message
    if not hazards:
        return {}, True, "No hazards to process"

    current_effectiveness = action.get("AdaptationEffectiveness")

    # If there's only one hazard and we have an effectiveness score, use that
    if len(hazards) == 1 and current_effectiveness:
        return {hazards[0]: current_effectiveness}, True, ""

    system_prompt = f"""
<role>
You are a climate action expert.
</role>

<task>
Your task is to determine the adaptation effectiveness of a climate action for each listed hazard.
Take into account all information of the climate action, especially the current overall 'AdaptationEffectiveness' value you are provided with.
Note that this overall value might not be accurate for all hazards, if multiple are listed.
</task>

<input>
You will be provided with the full details of a climate action.
</input>

<output>
Please respond ONLY with a JSON object mapping each hazard to its effectiveness level (high/medium/low).
Example format: 
{{"floods": "high", "droughts": "medium", "storms": "low"}}

IMPORTANT:
1. Respond with ONLY a JSON object
2. Use only "high", "medium", or "low" as values
3. Include all hazards listed in the input
4. Do not include any other text in your response like ```json ```
</output>
"""

    user_prompt = f"""
This is the full details of the climate action:
{json.dumps(action, indent=2)}

The current overall 'AdaptationEffectiveness' value of this action is: {current_effectiveness}.

Remember:
1. Respond with ONLY a JSON object
2. Use only "high", "medium", or "low" as values
3. Include all hazards: {', '.join(hazards)}
4. Do not include any other text in your response like ```json ```
"""
    try:
        response = client.beta.chat.completions.parse(
            model="o3-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format=AdaptationEffectivenessPerHazard,
            # temperature=0.0,
        )

        # Get the parsed Pydantic model from the response
        parsed_response = response.choices[0].message.parsed

        if parsed_response is None:
            return (
                {hazard: None for hazard in hazards},
                False,
                "No response from the model",
            )
        # Convert the Pydantic model to a dictionary
        effectiveness_dict = parsed_response.model_dump(by_alias=True)

        # Ensure all hazards are included
        result = {hazard: effectiveness_dict.get(hazard) for hazard in hazards}

        return result, True, ""

    except Exception as e:
        return (
            {hazard: None for hazard in hazards},
            False,
            f"Unexpected error: {str(e)}",
        )


def main():
    # Load the data
    climate_actions = load_json_file(INPUT_FILE)

    # Initialize tracking variables
    processed_count = 0
    skipped_count = 0
    error_count = 0
    error_details = []

    # Process each action
    for climate_action in climate_actions:
        # Initialize the field with None for all actions
        climate_action["AdaptationEffectivenessPerHazard"] = None

        # Check if it's an adaptation action
        is_adaptation = "adaptation" in climate_action.get("ActionType", "")

        # Get hazards (safely)
        hazards = climate_action.get("Hazard", [])

        # Skip if not an adaptation action
        if not is_adaptation:
            print(
                f"\nSkipping action {climate_action.get('ActionID', 'Unknown')} - not an adaptation action"
            )
            skipped_count += 1
            continue

        # Skip if no hazards (but it is an adaptation action)
        if not hazards:
            print(
                f"\nSkipping action {climate_action.get('ActionID', 'Unknown')} - adaptation action with no hazards"
            )
            skipped_count += 1
            continue

        # Get effectiveness scores for each hazard
        effectiveness_per_hazard, success, error_message = get_effectiveness_per_hazard(
            climate_action
        )

        # Update the action with new field
        climate_action["AdaptationEffectivenessPerHazard"] = effectiveness_per_hazard

        # Track success/failure
        if success:
            processed_count += 1
            print(
                f"\nProcessed action {climate_action.get('ActionID', 'Unknown')} - {len(effectiveness_per_hazard)} hazards"
            )
        else:
            error_count += 1
            error_details.append(
                {
                    "ActionID": climate_action.get("ActionID", "Unknown"),
                    "ActionName": climate_action.get("ActionName", "Unknown"),
                    "Error": error_message,
                }
            )

    # Save the updated data
    save_json_file(climate_actions, OUTPUT_FILE)

    # Print summary
    print("\n=== Processing Summary ===")
    print(f"Total actions processed: {processed_count}")
    print(f"Actions skipped: {skipped_count}")
    print(f"Actions with errors: {error_count}")

    if error_details:
        print("\n=== Error Details ===")
        for error in error_details:
            print(f"\nAction ID: {error['ActionID']}")
            print(f"Action Name: {error['ActionName']}")
            print(f"Error: {error['Error']}")

    print(f"\nUpdated file saved as {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
