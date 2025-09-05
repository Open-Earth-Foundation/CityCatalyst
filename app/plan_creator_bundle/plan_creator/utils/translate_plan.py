import os
from typing import Optional
from plan_creator_bundle.plan_creator.models import PlanResponse
from openai import OpenAI
from langsmith.wrappers import wrap_openai
from langsmith import traceable
import logging
from utils.logging_config import setup_logger
from plan_creator_bundle.plan_creator.prompts.translate_plan_prompt import (
    translate_plan_system_prompt,
)

# Setup logging configuration
setup_logger()
logger = logging.getLogger(__name__)

# Initialize OpenAI and OpenRouter clients
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY is not set")

OPENAI_MODEL_NAME_PLAN_TRANSLATION = os.getenv("OPENAI_MODEL_NAME_PLAN_TRANSLATION")
if not OPENAI_MODEL_NAME_PLAN_TRANSLATION:
    raise ValueError("OPENAI_MODEL_NAME_PLAN_TRANSLATION is not set")

# Get LangSmith project name
LANGCHAIN_PROJECT_NAME_PLAN_TRANSLATION = os.getenv(
    "LANGCHAIN_PROJECT_NAME_PLAN_TRANSLATION"
)
if not LANGCHAIN_PROJECT_NAME_PLAN_TRANSLATION:
    raise ValueError("LANGCHAIN_PROJECT_NAME_PLAN_TRANSLATION is not set")


# Use OpenAI client
openai_client = wrap_openai(OpenAI(api_key=OPENAI_API_KEY))


@traceable(run_type="llm", project_name=LANGCHAIN_PROJECT_NAME_PLAN_TRANSLATION)
def translate_plan(
    input_plan: PlanResponse, input_language: str, output_language: str
) -> Optional[PlanResponse]:
    """
    Translate a plan from one language into another language.
    """

    # Short-circuit if languages are identical
    if input_language == output_language:
        logger.info("Input and output languages are the same - skipping translation.")
        return input_plan

    # Load the system prompt
    system_prompt = translate_plan_system_prompt.format(
        input_plan=input_plan.model_dump_json(indent=2),
        input_language=input_language,
        output_language=output_language,
    )

    try:
        completion = openai_client.beta.chat.completions.parse(
            model=OPENAI_MODEL_NAME_PLAN_TRANSLATION,  # type: ignore
            messages=[
                {
                    "role": "system",
                    "content": system_prompt,
                },
            ],
            temperature=0,
            response_format=PlanResponse,
        )
        plan_response_obj = completion.choices[0].message.parsed

        if not isinstance(plan_response_obj, PlanResponse):
            logger.error(
                f"Parsed response is not a PlanResponse object: {plan_response_obj}"
            )
            return None

        # Update the language in the metadata
        plan_response_obj.metadata.language = output_language

        # Return the explanation object
        return plan_response_obj

    except Exception as e:
        logger.error(
            f"Error generating plan translation for plan '{input_plan.metadata.actionId}' and city '{input_plan.metadata.locode}': {str(e)}"
        )
        return None
