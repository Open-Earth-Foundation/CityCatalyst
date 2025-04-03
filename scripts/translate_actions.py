"""
This script translates the climate actions into the specified language.

It translates the following fields:
- ActionName
- Description
- Dependencies
- KeyPerformanceIndicators
- EquityAndInclusionConsiderations

Execute the script with the following command:
python scripts/translate_actions.py --language <language_code>

Example:
python scripts/translate_actions.py --language es
"""

import argparse
import json
import os
from openai import OpenAI
from pathlib import Path
from typing import Dict, Any, List
from dotenv import load_dotenv

BASE_DIR = Path(__file__).parent.parent

# Load environment variables
load_dotenv()

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

FIELDS_TO_TRANSLATE = [
    "ActionName",
    "Description",
    "Dependencies",
    "KeyPerformanceIndicators",
    "EquityAndInclusionConsiderations",
]


def translate_text(text: str, target_language: str) -> str | None:
    """
    Translate text using OpenAI API
    """
    if text is None:
        return None

    system_prompt = """
<role>
You are a translator specializing in climate action implementation plans.
</role>

<task>
Your task is to translate the given climate actions into the specified language. 
Try to keep the same tone and style as the original text.
If you cannot translate a specific word or phrase e.g. because it is a proper noun or a scientific term, leave it in English.
</task>

<input>
text to translate: The input are the climate actions.
target language: The target language that the text should be translated into. It is a 2 letter ISO language code like "en", "es", "pt", etc.
</input>

<important>
Do not add any additional text or formatting to the output like ```json```, ```html```, ```markdown```, etc.
You return only the plain translated text.
</important>
"""

    user_prompt = f"""
The target language is: 
{target_language}

This is the climate actions: 
{text}
"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.0,
            seed=42,
        )
        translated_text = response.choices[0].message.content
        return translated_text.strip() if translated_text else None
    except Exception as e:
        print(f"Error translating text: {e}")
        return text


def translate_list(items: List[str], target_language: str) -> List[str]:
    """
    Translate a list of strings
    """
    if not items:
        return items

    # Join items with a special separator for bulk translation
    separator = " ||| "
    combined_text = separator.join(items)

    # Translate the combined text
    translated_text = translate_text(combined_text, target_language)

    # Split back into list
    if translated_text:
        return [item.strip() for item in translated_text.split(separator)]
    return items


def translate_action(action: Dict[str, Any], target_language: str) -> Dict[str, Any]:
    """
    Translate specific fields in an action
    """
    translated_action = action.copy()

    for field in FIELDS_TO_TRANSLATE:
        if field not in action:
            continue

        value = action[field]
        if isinstance(value, list):
            translated_action[field] = translate_list(value, target_language)
        elif isinstance(value, str):
            translated_action[field] = translate_text(value, target_language)

    return translated_action


def main():
    parser = argparse.ArgumentParser(
        description="Translate climate actions to specified language"
    )
    parser.add_argument(
        "--language",
        type=str,
        required=True,
        help="Target language code (e.g., es, fr, de)",
    )
    args = parser.parse_args()

    # Input and output paths
    input_path = Path(
        BASE_DIR
        / "data/climate_actions/output/merged_individual_adaptation_effectiveness.json"
    )
    output_dir = Path(BASE_DIR / "data/climate_actions/output/translations")
    output_path = (
        output_dir / f"merged_individual_adaptation_effectiveness_{args.language}.json"
    )

    # Create output directory if it doesn't exist
    output_dir.mkdir(parents=True, exist_ok=True)

    # Read input file
    print(f"Reading actions from {input_path}")
    with open(input_path, "r", encoding="utf-8") as f:
        actions = json.load(f)

    # Translate actions
    print(f"Translating {len(actions)} actions to {args.language}")
    translated_actions = []
    for i, action in enumerate(actions, 1):
        print(
            f"Translating action {i}/{len(actions)}: {action.get('ActionID', 'Unknown ID')}"
        )
        translated_action = translate_action(action, args.language)
        translated_actions.append(translated_action)

    # Write output file
    print(f"Writing translated actions to {output_path}")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(translated_actions, f, ensure_ascii=False, indent=2)

    print("Translation completed successfully!")


if __name__ == "__main__":
    main()
