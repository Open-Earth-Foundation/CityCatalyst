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
    _serialize_vector_results,
    retriever_vectorstore_national_strategy_tool,
)

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
    logger.info(
        f"Generating explanation for action_id={single_action['ActionID']}, rank={rank}, languages={languages}."
    )

    # Retrieve the national strategy from the vector store relevant to the action
    # Action type is a list of strings, extract the first element
    action_type = single_action.get("ActionType")
    if isinstance(action_type, list):
        action_type = action_type[0]

    action_name = single_action.get("ActionName")
    action_description = single_action.get("Description")

    # Retrieve vector-store context or fall back to an empty object if inputs are missing
    retrieved_national_strategy = {}
    if action_type is None or action_name is None or action_description is None:
        logger.warning(
            f"Action type, name, or description is None for action_id={single_action['ActionID']}"
        )
        logger.warning(
            f"Action type: {action_type}, Action name: {action_name}, Action description: {action_description}"
        )
    else:
        search_query = (
            f"Action name: {action_name}\n Action description: {action_description}"
        )

        retrieved_national_strategy = retriever_vectorstore_national_strategy_tool(
            action_type=action_type,
            search_query=search_query,
            country_code=country_code,
        )

    # Convert retrieved documents to a JSON-serializable structure
    national_strategy_for_prompt = _serialize_vector_results(
        retrieved_national_strategy
    )

    # Filter city data to not include the key 'ccra' if the action is a mitigation action
    # and exclude the keys 'stationaryEnergyEmissions', 'transportationEmissions', 'wasteEmissions', 'ippuEmissions', 'afoluEmissions', 'totalEmissions' if the action is an adaptation action
    # This is to make the prompt more concise and focused
    if action_type == "mitigation":
        city_data.pop("ccra", None)

    elif action_type == "adaptation":
        city_data.pop("stationaryEnergyEmissions", None)
        city_data.pop("transportationEmissions", None)
        city_data.pop("wasteEmissions", None)
        city_data.pop("ippuEmissions", None)
        city_data.pop("afoluEmissions", None)
        city_data.pop("totalEmissions", None)

    # Build the dynamic explanation model
    ExplanationModelDynamic = build_explanation_model(languages)

    # Build the system prompt for multilingual
    system_prompt = add_explanations_multilingual_system_prompt.format(
        national_strategy=json.dumps(
            national_strategy_for_prompt, indent=2, ensure_ascii=False
        ),
        city_data=json.dumps(city_data, indent=2, ensure_ascii=False),
        single_action=json.dumps(single_action, indent=2, ensure_ascii=False),
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
