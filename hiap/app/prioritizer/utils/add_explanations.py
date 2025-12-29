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
from utils.vector_store_retrievers import (
    get_national_strategy_for_prompt,
)
from utils.prompt_data_filters import build_prompt_inputs

load_dotenv()

# Setup logging configuration
setup_logger()
logger = logging.getLogger(__name__)

# Initialize OpenAI and OpenRouter clients
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY is not set")

OPENAI_MODEL_NAME_EXPLANATIONS = os.getenv("OPENAI_MODEL_NAME_EXPLANATIONS")
if not OPENAI_MODEL_NAME_EXPLANATIONS:
    raise ValueError("OPENAI_MODEL_NAME_EXPLANATIONS is not set")


# Get LangSmith project name
LANGCHAIN_PROJECT_NAME_PRIORITIZER = os.getenv("LANGCHAIN_PROJECT_NAME_PRIORITIZER")
if not LANGCHAIN_PROJECT_NAME_PRIORITIZER:
    raise ValueError("LANGCHAIN_PROJECT_NAME_PRIORITIZER is not set")


# Use OpenAI client with client-level timeout and retries (overrideable via env)
def _get_openai_timeout_seconds() -> float:
    try:
        return float(os.getenv("OPENAI_TIMEOUT_SECONDS", "60"))
    except Exception:
        return 60.0


def _get_openai_max_retries() -> int:
    try:
        return int(os.getenv("OPENAI_MAX_RETRIES", "3"))
    except Exception:
        return 3


openai_client = wrap_openai(
    OpenAI(
        api_key=OPENAI_API_KEY,
        timeout=_get_openai_timeout_seconds(),
        max_retries=_get_openai_max_retries(),
    )
)


def build_explanation_model(language_codes: list[str]) -> Type[BaseModel]:
    """
    Build a dynamic Pydantic schema with one required string field per language code.

    The model is created on the fly so that its fields exactly match the provided
    language codes and nothing else. This is important for the OpenAI
    `response_format` parameter: it tells the model to return JSON that has *only*
    these keys and validates that all of them are present.

    Example
    -------
    If ``language_codes = ["en", "de", "fr"]``, this function is roughly equivalent to

        class Explanation(BaseModel):
            en: str
            de: str
            fr: str

    which ensures that the LLM must output a JSON object with the keys
    ``"en"``, ``"de"``, and ``"fr"`` filled with explanation text.

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
    country_code: str,
    city_data: dict,
    single_action: dict,
    rank: int,
    languages: list[str],
) -> Optional[Explanation]:
    """
    Generate qualitative explanation for a single prioritized climate action in multiple languages.

    Args:
        country_code (str): The country code of the city.
        city_data (dict): Contextual data for the city.
        single_action (dict): The action to explain.
        rank (int): The action's rank among the top prioritized actions (1 = highest priority).
        languages (list[str]): List of 2-letter ISO language codes for the explanation.

    Returns:
        Optional[dict[str, str]]: Dictionary mapping language codes to explanation strings, or None if generation fails.
    """
    logger.debug(
        f"Generating explanation for action_id={single_action['ActionID']}, rank={rank}, languages={languages}."
    )

    # Retrieve the national strategy from the vector store relevant to the action
    # Action type is expected to be a list of strings; use the first element if present
    action_type_list = single_action.get("ActionType")
    action_type: Optional[str] = None
    if isinstance(action_type_list, list) and len(action_type_list) > 0:
        action_type = action_type_list[0]
    else:
        logger.warning(
            f"Action type missing or malformed for action_id={single_action.get('ActionID')}; proceeding without action type"
        )

    action_name = single_action.get("ActionName")
    action_description = single_action.get("Description")

    # Retrieve vector-store context or fall back to an empty list if inputs are missing
    national_strategy_for_prompt = get_national_strategy_for_prompt(
        country_code=country_code,
        action_type=action_type,
        action_name=action_name,
        action_description=action_description,
        action_id=str(single_action["ActionID"]),
    )

    # Build shallow-copied and pruned dictionaries for the prompt
    city_data_for_prompt, single_action_for_prompt = build_prompt_inputs(
        city_data=city_data, action_data=single_action, action_type=action_type
    )

    # Build the dynamic explanation model
    ExplanationModelDynamic = build_explanation_model(languages)

    # Build the system prompt for multilingual
    system_prompt = add_explanations_multilingual_system_prompt.format(
        national_strategy=json.dumps(
            national_strategy_for_prompt, indent=2, ensure_ascii=False
        ),
        city_data=json.dumps(city_data_for_prompt, indent=2, ensure_ascii=False),
        single_action=json.dumps(
            single_action_for_prompt, indent=2, ensure_ascii=False
        ),
        rank=rank,
        languages=languages,
    )
    try:
        completion = openai_client.beta.chat.completions.parse(
            model=OPENAI_MODEL_NAME_EXPLANATIONS,  # type: ignore
            messages=[
                {
                    "role": "system",
                    "content": system_prompt,
                },
            ],
            temperature=0,
            response_format=ExplanationModelDynamic,
            # Per-request timeout (falls back to client default if omitted)
            timeout=_get_openai_timeout_seconds(),
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
