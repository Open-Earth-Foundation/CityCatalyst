import os
import json
from typing import List, Dict
from openai import OpenAI
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from typing import Literal

# Load environment variables
load_dotenv()

# Initialize OpenAI client
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=OPENAI_API_KEY)

# Pydantic model definitions
class Biome(BaseModel):
    # The biome field is limited to the specified literal values.
    biome: Literal[
        "tropical_rainforest",
        "temperate_forest",
        "desert",
        "grassland_savanna",
        "tundra",
        "wetlands",
        "mountains",
        "boreal_forest_taiga",
        "coastal_marine",
        "none"
    ]

# File paths - using os.path.join for cross-platform compatibility
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ACTIONS_FOLDER = os.path.join(BASE_DIR, "data", "climate_actions", "output")
ACTION_DATA_FILE = "merged.json"
OUTPUT_FILE = "merged_with_biome.json"

def load_actions_data() -> List[Dict]:
    """Load the merged actions data from JSON file."""
    file_path = os.path.join(ACTIONS_FOLDER, ACTION_DATA_FILE)
    
    # Check if file exists
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Could not find the input file at: {file_path}")
    
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        raise ValueError(f"Error parsing JSON file: {str(e)}")
    except Exception as e:
        raise Exception(f"Error reading file: {str(e)}")

def get_biome_for_action(action: Dict) -> str:
    """Get biome information for a specific action using OpenAI API."""
    add_biome_prompt = f"""Given this climate action, determine the  biome for implementation.
    {action}
    
    Consider:
    1. You should add None if the action can be done in more then one biome it should be restricting process
    2. The action conditions and description sugesting that only one biome can be used
    3. The geographical regions where this action is commonly implemented
    4. This will be restrictive value to use the action add biome only if you are sure that the action can be done in only one biome
    
    """

    try:
        completion = client.beta.chat.completions.parse(
            model="o3-mini",
            messages=[
                {"role": "system", "content": "You must return a json object following the Biome schema. Remember if we have more then one biome that action can be done it it should be none"},
                {"role": "user", "content": add_biome_prompt}
            ],
            response_format=Biome
        )
        
        # Parse the response into our Pydantic model
        response_data = json.loads(completion.choices[0].message.content)
    except Exception as e:
        print(f"Error generating explanation: {str(e)}")
        # Fallback to a basic explanation if the API call fails
        return 

    return response_data['biome']

def update_actions_with_biome(actions: List[Dict]) -> List[Dict]:
    """Update each action with biome information."""
    for action in actions:
        if 'biome' not in action:
            action['biome'] = get_biome_for_action(action)
            print(f"Added biome for action: {action.get('actionName', '')}")
    
    return actions

def save_updated_actions(actions: List[Dict]):
    """Save the updated actions data to a new JSON file."""
    # Ensure output directory exists
    os.makedirs(ACTIONS_FOLDER, exist_ok=True)
    
    output_path = os.path.join(ACTIONS_FOLDER, OUTPUT_FILE)
    try:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(actions, f, indent=4, ensure_ascii=False)
        print(f"Saved updated actions to {output_path}")
    except Exception as e:
        raise Exception(f"Error saving output file: {str(e)}")

def main():
    try:
        # Load actions data
        print("Loading actions data...")
        actions = load_actions_data()
        
        # Update actions with biome information
        print("Updating actions with biome information...")
        updated_actions = update_actions_with_biome(actions)
        
        # Save updated actions
        print("Saving updated actions...")
        save_updated_actions(updated_actions)
        
        print("Process completed successfully!")
    except Exception as e:
        print(f"Error: {str(e)}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
