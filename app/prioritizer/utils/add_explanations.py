import os
from typing import Optional
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


@traceable(run_type="llm", project_name=LANGCHAIN_PROJECT_NAME_PRIORITIZER)
def generate_multilingual_explanation(
    city_data: dict,
    single_action: dict,
    rank: int,
    languages: list[str],
) -> Optional[Explanation]:
    """
    Generate qualitative explanation for a single prioritized climate action in multiple languages.

    Args:
        city_data (dict): Contextual data for the city.
        single_action (dict): The action to explain.
        rank (int): The action's rank among the top prioritized actions (1 = highest priority).
        languages (list[str]): List of 2-letter ISO language codes for the explanation.

    Returns:
        Optional[dict[str, str]]: Dictionary mapping language codes to explanation strings, or None if generation fails.
    """
    logger.info(
        f"Generating explanation for action_id={single_action['ActionID']}, rank={rank}, languages={languages}"
    )
    # Build the system prompt for multilingual
    system_prompt = add_explanations_multilingual_system_prompt.format(
        city_data=city_data,
        single_action=single_action,
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
            response_format=Explanation,
        )
        explanation_obj = completion.choices[0].message.parsed

        if not isinstance(explanation_obj, Explanation):
            logger.error(
                f"Parsed response is not an Explanation object: {explanation_obj}"
            )
            return None

        return Explanation(
            en=explanation_obj.en,
            es=explanation_obj.es,
            pt=explanation_obj.pt,
        )
    except Exception as e:
        logger.error(
            f"Error generating multilingual explanation for action '{single_action['ActionID']}': {str(e)}"
        )
        return None
