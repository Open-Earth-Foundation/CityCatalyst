import os
import json
from typing import Optional, Type, Dict, Any, cast
from pydantic import create_model, BaseModel
from openai import OpenAI
from langsmith.wrappers import wrap_openai
from langsmith import traceable
from dotenv import load_dotenv
from utils.logging_config import setup_logger
import logging
from prioritizer.models import Explanation
from prioritizer.prompts.add_explanations_prompt import (
    add_explanations_multilingual_system_prompt,
)

load_dotenv()

# Setup logging configuration
setup_logger()
logger = logging.getLogger(__name__)

# Initialize OpenAI and OpenRouter clients
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Check if API key is set
if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY is not set")

OPENAI_MODEL_NAME_EXPLANATIONS = os.getenv(
    "OPENAI_MODEL_NAME_EXPLANATIONS", "gpt-4.1-nano"
)

# Get LangSmith project name
LANGCHAIN_PROJECT_NAME_PRIORITIZER = os.getenv("LANGCHAIN_PROJECT_NAME_PRIORITIZER")

# Use OpenAI client
openai_client = wrap_openai(OpenAI(api_key=OPENAI_API_KEY))


def build_explanation_model(language_codes: list[str]) -> Type[BaseModel]:
    """
    Build a dynamic Pydantic model with the given language codes as fields.
    OpenAI API requires models with defined fields for structured output.
    We build a dynamic model with the given language codes as fields.

    Args:
        language_codes (list[str]): List of 2-letter ISO language codes.

    Returns:
        Type[BaseModel]: A Pydantic model with the given language codes as fields.
    """
    fields: Dict[str, tuple[type, Any]] = {code: (str, ...) for code in language_codes}

    model = create_model("Explanation", **fields)  # type: ignore
    return cast(Type[BaseModel], model)


@traceable(run_type="llm", project_name=LANGCHAIN_PROJECT_NAME_PRIORITIZER)
def generate_multilingual_explanation(
    country_strategy: dict,
    city_data: dict,
    single_action: dict,
    rank: int,
    languages: list[str],
) -> Optional[Explanation]:
    """
    Generate qualitative explanation for a single prioritized climate action in multiple languages.

    Args:
        country_strategy (dict): Contextual data for the country strategy.
        city_data (dict): Contextual data for the city.
        single_action (dict): The action to explain.
        rank (int): The action's rank among the top prioritized actions (1 = highest priority).
        languages (list[str]): List of 2-letter ISO language codes for the explanation.

    Returns:
        Optional[dict[str, str]]: Dictionary mapping language codes to explanation strings, or None if generation fails.
    """
    logger.info(
        f"Generating explanation for action_id={single_action['ActionID']}, rank={rank}, languages={languages}."
    )

    # Filter the country_strategy dictionary to only include specified keys
    # This is a workaround to avoid the model from hallucinating and including irrelevant details from the country strategy
    # actions here refers to the actions in the country strategy like "AGR.I.01"
    filtered_country_strategy = {}
    if isinstance(country_strategy, dict):
        for category, actions in country_strategy.items():
            if isinstance(actions, list):
                filtered_actions = []
                for action in actions:
                    if isinstance(action, dict):
                        filtered_action = {
                            "action_code": action.get("action_code"),
                            "action_name": action.get("action_name"),
                            "action_description": action.get("action_description"),
                        }
                        filtered_actions.append(filtered_action)
                filtered_country_strategy[category] = filtered_actions
            else:
                filtered_country_strategy[category] = actions

    # Build the dynamic explanation model
    ExplanationModelDynamic = build_explanation_model(languages)

    # Build the system prompt for multilingual
    system_prompt = add_explanations_multilingual_system_prompt.format(
        country_strategy=json.dumps(filtered_country_strategy, indent=2),
        city_data=json.dumps(city_data, indent=2),
        single_action=json.dumps(single_action, indent=2),
        rank=rank,
        languages=languages,
    )
    try:
        completion = openai_client.beta.chat.completions.parse(
            model=OPENAI_MODEL_NAME_EXPLANATIONS,
            messages=[
                {
                    "role": "system",
                    "content": system_prompt,
                },
            ],
            temperature=0,
            response_format=ExplanationModelDynamic,
        )
        explanation_obj = completion.choices[0].message.parsed

        if not isinstance(explanation_obj, ExplanationModelDynamic):
            logger.error(
                f"Parsed response is not an Explanation object: {explanation_obj}"
            )
            return None

        # Wrap the flat fields into .explanations using the Explanation model
        wrapped_explanation = Explanation(explanations=explanation_obj.model_dump())

        # Return the explanation object
        return wrapped_explanation

    except Exception as e:
        logger.error(
            f"Error generating multilingual explanation for action '{single_action['ActionID']}': {str(e)}"
        )
        return None
