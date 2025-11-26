"""
This script translates the climate actions into the specified language.

It translates the following fields:
- ActionName
- Description
- Dependencies
- KeyPerformanceIndicators
- EquityAndInclusionConsiderations

Execute the script with the following command:
python hiap/app/prioritizer/scripts/translate_actions.py --language <language_code> --filename <filename.json>

Example:
python hiap/app/prioritizer/scripts/translate_actions.py --language es --filename merged.json
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


def translate_text(text: str | None, target_language: str | None) -> str | None:
    """
    Translate text using OpenAI API
    """
    if text is None or target_language is None:
        print("Text or target language is None - skipping translation")
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
            model="gpt-4.1",
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
    parser.add_argument(
        "--filename",
        type=str,
        required=True,
        help="Input JSON filename located under data/excel (e.g., merged.json)",
    )
    args = parser.parse_args()

    # Input and output paths (read from data/excel/{filename}, write translation_{language}.json into same folder)
    input_path = Path(BASE_DIR / "data/excel" / args.filename)
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")
    output_path = input_path.parent / f"translation_{args.language}.json"

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
