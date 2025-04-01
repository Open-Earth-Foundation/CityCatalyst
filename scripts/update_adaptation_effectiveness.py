"""
This script updates the 'AdaptationEffectivenessPerHazard' field of each climate action.
It uses GPT-4o to determine the effectiveness of the action for each hazard.

Input file:
data/climate_actions/output/merged.json

Output file:
data/climate_actions/output/merged_updated.json

Execute:
python scripts/update_adaptation_effectiveness.py
"""

import json
import os
from pathlib import Path
from openai import OpenAI
from typing import Dict, List, Optional, Union, Tuple
from dotenv import load_dotenv

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
    hazards = action["Hazard"]
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
Do not include any other text in your response like ```json ```
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
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.0,
        )

        content = response.choices[0].message.content
        if content is None:
            return (
                {hazard: None for hazard in hazards},
                False,
                "Empty response from GPT",
            )

        try:
            effectiveness_dict = json.loads(content)

            # Validate the values
            valid_values = {"high", "medium", "low"}
            for hazard, value in effectiveness_dict.items():
                if value not in valid_values:
                    return (
                        {hazard: None for hazard in hazards},
                        False,
                        f"Invalid value '{value}' for hazard '{hazard}'",
                    )

            # Ensure all hazards are included
            result = {hazard: effectiveness_dict.get(hazard) for hazard in hazards}

            return result, True, ""

        except json.JSONDecodeError as e:
            return (
                {hazard: None for hazard in hazards},
                False,
                f"JSON parsing error: {str(e)}",
            )

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
    error_count = 0
    error_details = []

    # Process each action
    for climate_action in climate_actions:
        # Initialize the field with None for all actions
        climate_action["AdaptationEffectivenessPerHazard"] = None

        # Only process adaptation actions with hazards
        if (
            "adaptation" not in climate_action["ActionType"]
            or not climate_action["Hazard"]
        ):
            print(
                f"\nSkipping action {climate_action['ActionID']} - not an adaptation action or no hazards"
            )
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
        else:
            error_count += 1
            error_details.append(
                {
                    "ActionID": climate_action["ActionID"],
                    "ActionName": climate_action.get("ActionName", "Unknown"),
                    "Error": error_message,
                }
            )

    # Save the updated data
    save_json_file(climate_actions, OUTPUT_FILE)

    # Print summary
    print("\n=== Processing Summary ===")
    print(f"Total actions processed: {processed_count}")
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
