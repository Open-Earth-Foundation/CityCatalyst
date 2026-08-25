"""Translate selected climate-action fields into another language.

Inputs:
- CLI args: ``--language`` is a two-letter target language code and ``--filename``
  is a JSON filename under ``app/prioritizer/data/excel``.
- Env vars: ``OPENAI_API_KEY`` authenticates OpenAI requests and
  ``OPENAI_MODEL_NAME_ACTION_TRANSLATION`` selects the translation model.

Outputs:
- Writes ``translation_<language>.json`` beside the input file and logs progress.

Usage (from the ``hiap`` project root):
- ``python -m app.prioritizer.scripts.translate_actions --language es --filename merged.json``
"""

import argparse
import json
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

from app.utils.logging_config import setup_logger

BASE_DIR = Path(__file__).parent.parent
logger = logging.getLogger(__name__)

OPENAI_MODEL_NAME_ACTION_TRANSLATION = "OPENAI_MODEL_NAME_ACTION_TRANSLATION"

FIELDS_TO_TRANSLATE = [
    "ActionName",
    "Description",
    "Dependencies",
    "KeyPerformanceIndicators",
    "EquityAndInclusionConsiderations",
]


def get_openai_client() -> OpenAI:
    """Load local configuration and construct the OpenAI client."""
    load_dotenv()
    return OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def translate_text(text: str | None, target_language: str | None) -> str | None:
    """Translate text, returning the original text when the API call fails."""
    if text is None or target_language is None:
        logger.warning("Text or target language is None; skipping translation")
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
        client = get_openai_client()
        response = client.chat.completions.create(
            model=os.environ[OPENAI_MODEL_NAME_ACTION_TRANSLATION],
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            reasoning_effort="none",
            seed=42,
        )
        translated_text = response.choices[0].message.content
        return translated_text.strip() if translated_text else None
    except Exception:
        logger.exception("Failed to translate text")
        return text


def translate_list(items: list[str], target_language: str) -> list[str]:
    """Translate a list while preserving its item boundaries."""
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


def translate_action(action: dict[str, object], target_language: str) -> dict[str, object]:
    """Translate the configured textual fields in one climate action."""
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


def parse_args() -> argparse.Namespace:
    """Parse translation command-line arguments."""
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
    return parser.parse_args()


def main() -> None:
    """Read climate actions, translate them, and write the translated JSON file."""
    args = parse_args()

    # Input and output paths (read from data/excel/{filename}, write translation_{language}.json into same folder)
    input_path = Path(BASE_DIR / "data/excel" / args.filename)
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")
    output_path = input_path.parent / f"translation_{args.language}.json"

    # Read input file
    logger.info("Reading actions from %s", input_path)
    with input_path.open("r", encoding="utf-8") as f:
        actions = json.load(f)

    # Translate actions
    logger.info("Translating %s actions to %s", len(actions), args.language)
    translated_actions = []
    for i, action in enumerate(actions, 1):
        logger.info(
            "Translating action %s/%s: %s",
            i,
            len(actions),
            action.get("ActionID", "Unknown ID"),
        )
        translated_action = translate_action(action, args.language)
        translated_actions.append(translated_action)

    # Write output file
    logger.info("Writing translated actions to %s", output_path)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(translated_actions, f, ensure_ascii=False, indent=2)

    logger.info("Translation completed successfully")


if __name__ == "__main__":
    setup_logger()
    main()
