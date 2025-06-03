"""
add_explanations.py
-------------------

This script generates qualitative explanations for prioritized climate actions for each city, using city context and additional action data. It leverages chosen OpenRouter model to create a short explanation for each action, then saves the updated action lists back to the original files.

How it works:
- For each prioritized actions file in 'data/prioritized/', it:
  1. Extracts the city code from the filename.
  2. Loads the corresponding city data from 'data/cities/city_data.json'.
  3. Loads the prioritized actions for that city.
  4. For each action, generates a 3-5 sentence explanation using OpenAI's API.
  5. Saves the updated actions (with explanations) back to the original files in 'data/prioritized/'.

How to run (from project root, in Windows CMD or PowerShell):

    # Single city
    python scripts\add_explanations.py --locode "BR VDS"

    # All cities (bulk)
    python scripts\add_explanations.py

The script will process all .json files in 'data/prioritized/' and update the original files with explanations.
"""
import os
import re
import json
from pathlib import Path
from typing import List, Optional

from pydantic import BaseModel, Field
from openai import OpenAI
from dotenv import load_dotenv
from prioritizer.utils.reading_writing_data import read_city_inventory, read_actions
load_dotenv()

# Initialize OpenAI client
#OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
client = OpenAI(api_key=OPENROUTER_API_KEY, base_url="https://openrouter.ai/api/v1")
MODEL_NAME = "google/gemini-2.5-flash-preview-05-20"

# Adjust these paths as needed:
PRIORITIZED_FOLDER = Path("data/prioritized")
OUTPUT_FOLDER = Path("data/prioritized")  # Changed to save back to original folder


def extract_city_code(filename: str) -> str:
    """
    Extract city code from a filename that follows the pattern:
    'output_citycode_*.json'

    Example:
        filename = "output_BR VDS_mitigation.json"
        -> returns 'BR VDS'
        filename = "output_BRSER_something.json"
        -> returns 'BRSER'
    """
    # Match pattern: output_ followed by city code, then _ followed by action type
    match = re.search(r"^output_(.+)_(mitigation|adaptation)\.json$", filename)
    if match:
        return match.group(1)
    
    # Fallback to original pattern for backward compatibility
    match = re.search(r"^output_([^_]+)", filename)
    if match:
        return match.group(1)
    return ""


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
            model=MODEL_NAME,
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
        if response_content is None:
            return "Error: No response content"
        response_data = json.loads(response_content)
        print(f"response_data: {response_data}")
        if "explanation" in response_data:
            print(response_data["explanation"])
            return response_data["explanation"]
        else:
            print("Warning: No explanations found in response")
            return "Error: No explanations found in response"

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
    actions_whole = read_actions()

    for action in actions_data:
        # Identify this action's ID
        current_id = action.get("actionId", "")

        # Find the additional data for this single action
        # (There may be many in 'actions_whole'; we find only the relevant one)
        single_action_additional_data = None
        for add_data in actions_whole:
            # Handle both actionId and ActionID field names
            add_data_id = add_data.get("ActionID") or add_data.get("actionId")
            if add_data_id == current_id:
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


def add_explanations_for_city(locode: str) -> bool:
    """
    Add explanations for a specific city by locode.
    Processes both mitigation and adaptation files for the city.
    
    Args:
        locode (str): The city locode (e.g., "BR VDS")
    
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        # 1. Create output folder if it doesn't exist
        OUTPUT_FOLDER.mkdir(parents=True, exist_ok=True)

        # 2. Find both mitigation and adaptation files for this city
        files = [f.name for f in PRIORITIZED_FOLDER.glob("*.json")]
        target_files = []
        
        for filename in files:
            city_code = extract_city_code(filename)
            if city_code == locode:
                target_files.append(filename)
        
        if not target_files:
            print(f"No prioritized files found for city {locode}")
            return False

        print(f"Found {len(target_files)} files for city {locode}: {target_files}")

        # 3. Load city data once for this city
        city_data = read_city_inventory(locode)

        success_count = 0
        
        # 4. Process each file (mitigation and adaptation)
        for target_file in target_files:
            try:
                input_path = PRIORITIZED_FOLDER / target_file

                # Load the prioritized file (which has a list of actions)
                with open(input_path, "r", encoding="utf-8") as inp:
                    actions_data = json.load(inp)

                # Generate an explanation per action and merge them
                updated_actions_data = update_actions_with_explanations(actions_data, city_data)

                print(f"Actions data updated for {target_file}")

                # Save updated file back to original location, overwriting the original
                output_path = OUTPUT_FOLDER / target_file
                with open(output_path, "w", encoding="utf-8") as outp:
                    json.dump(updated_actions_data, outp, indent=4, ensure_ascii=False)

                print(f"Updated file saved as {target_file}")
                success_count += 1
                
            except Exception as e:
                print(f"Error processing file {target_file}: {str(e)}")

        if success_count == len(target_files):
            print(f"Successfully processed all {success_count} files for city {locode}")
            return True
        else:
            print(f"Processed {success_count}/{len(target_files)} files for city {locode}")
            return success_count > 0

    except Exception as e:
        print(f"Error processing city {locode}: {str(e)}")
        return False


def main(locode: str = None):
    """
    Main function that can process either a single city or all cities.
    
    Args:
        locode (str, optional): If provided, process only this city. Otherwise, process all cities.
    """
    if locode:
        # Process single city
        success = add_explanations_for_city(locode)
        if success:
            print(f"Successfully added explanations for {locode}")
        else:
            print(f"Failed to add explanations for {locode}")
        return success
    else:
        # Process all cities (original behavior)
        # 1. Create output folder if it doesn't exist
        OUTPUT_FOLDER.mkdir(parents=True, exist_ok=True)

        # 2. List all files in data/prioritized
        files = [f.name for f in PRIORITIZED_FOLDER.glob("*.json")]

        for filename in files:
            input_path = PRIORITIZED_FOLDER / filename

            # 3. Extract city code from filename
            city_code = extract_city_code(filename)

            # 4. Load city data
            city_data = read_city_inventory(city_code)

            # 5. Load the prioritized file (which has a list of actions)
            with open(input_path, "r", encoding="utf-8") as inp:
                actions_data = json.load(inp)

            # 6. Generate an explanation per action and merge them
            updated_actions_data = update_actions_with_explanations(actions_data, city_data)

            print("Actions data updated for city", city_code)

            # 7. Save updated file back to original location, overwriting the original
            output_path = OUTPUT_FOLDER / filename
            with open(output_path, "w", encoding="utf-8") as outp:
                json.dump(updated_actions_data, outp, indent=4, ensure_ascii=False)

            print(f"Updated file saved as {filename}")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Add explanations to climate actions")
    parser.add_argument(
        "--locode", 
        type=str, 
        help="Process only the specified city locode (e.g., 'BRSER'). If not provided, processes all cities."
    )
    
    args = parser.parse_args()
    main(args.locode)
