import os
from typing import Optional
from openai import OpenAI
from langsmith.wrappers import wrap_openai
from langsmith import traceable
from dotenv import load_dotenv
from utils.logging_config import setup_logger
import logging
from prioritizer.models import Explanation

load_dotenv()

# Setup logging configuration
setup_logger()
logger = logging.getLogger(__name__)

# Initialize OpenAI and OpenRouter clients
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENAI_MODEL_NAME_EXPLANATIONS = os.getenv(
    "OPENAI_MODEL_NAME_EXPLANATIONS", "gpt-4.1-nano"
)

# Get LangSmith project name
LANGCHAIN_PROJECT_NAME_PRIORITIZER = os.getenv("LANGCHAIN_PROJECT_NAME_PRIORITIZER")

# Commented out: OpenRouter client
# openrouter_client = OpenAI(api_key=OPENROUTER_API_KEY, base_url="https://openrouter.ai/api/v1")
# MODEL_NAME = "google/gemini-2.5-flash-preview-05-20"

# Use OpenAI client
openai_client = wrap_openai(OpenAI(api_key=OPENAI_API_KEY))
# OPENAI_MODEL_NAME_EXPLANATION = "GPT-4.1 nano"


# DEPRECATED
# def generate_single_explanation(
#     city_data: dict,
#     single_action: dict,
#     rank: int,
# ) -> Optional[str]:
#     """
#     Generate a qualitative explanation for a single prioritized climate action.

#     This function uses city context, action details, the action's rank, and any additional data to build a prompt for an LLM (OpenAI GPT-4o). The LLM returns a 3-5 sentence explanation describing why the action is a priority for the city. The explanation's tone is influenced by the action's rank (higher rank = more positive tone), but the rank itself is not mentioned in the explanation.

#     Args:
#         city_data (dict): Contextual data for the city.
#         single_action (dict): The action to explain.
#         rank (int): The action's rank among the top prioritized actions (1 = highest priority).

#     Returns:
#         Optional[str]: The generated explanation string, or None if generation fails.
#     """
#     logger.info(
#         f"Generating explanation for action_id={single_action['ActionID']}, rank={rank}"
#     )
#     # Build the minimal prompt:
#     explanation_prompt = f"""
#     <task>
#     You have city context and exactly one action (plus optional additional data).
#     Return ONLY a string containing the explanation for the action.
#     Additionally you have the rank of the action.
#     The actions have been ranked from a total of about 240 actions. Therefore these are the top 20 actions.
#     The rank is a number between 1 and 20, where 1 is the highest priority and 20 is the lowest priority among the top selected 20 actions.
#     The rank is based on a tournament ranking algorithm and decided on by an ML model.
#     The rank is purely for your information, you should not mention it in the explanation.
#     However, you should use the rank to determine the tone of the explanation. The higher the rank, the more positive the tone. The lower the rank, the less positive the tone - but still positive as those are the top 20 actions.
#     Example: <explanation>


#     Constraints:
#     - The explanation must be 3-5 sentences describing why this action is a priority (or not).
#     - No numeric scores or internal model references.
#     - Do not mention other actions, only focus on this one.
#     - Do not mention the rank in the explanation.

#     # CITY DATA:
#     {city_data}

#     # CURRENT ACTION:
#     {single_action}

#     # RANK:
#     {rank}
#     </task>
#     """

#     try:
#         # Commented out: OpenRouter .parse usage
#         # completion = openrouter_client.beta.chat.completions.parse(
#         #     model=MODEL_NAME,
#         #     messages=[
#         #         {
#         #             "role": "system",
#         #             "content": (
#         #                 "You must return a JSON object with exactly two keys: "
#         #                 "'actionId' (matching the actionId in the input) and 'explanation'. "
#         #                 "No extra keys, no internal data."
#         #             ),
#         #         },
#         #         {"role": "user", "content": explanation_prompt},
#         #     ],
#         #     temperature=0,
#         #     response_format=ExplanationItem,
#         # )

#         # Use OpenAI client (normal endpoint, not parse)
#         completion = openai_client.chat.completions.create(
#             model=OPENAI_MODEL_NAME_EXPLANATIONS,
#             messages=[
#                 {
#                     "role": "system",
#                     "content": (
#                         "You are an expert climate action analyst. Return ONLY a string explanation for the action, following the user's instructions."
#                     ),
#                 },
#                 {"role": "user", "content": explanation_prompt},
#             ],
#             temperature=0,
#         )

#         # Extract the explanation string from the response
#         response_content = completion.choices[0].message.content
#         if response_content is None:
#             return "Error: No response content"

#         return response_content

#     except Exception as e:
#         logger.error(
#             f"Error generating explanation for action '{single_action['ActionID']}': {str(e)}"
#         )
#         return None


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
    # Build the prompt for multilingual
    explanation_prompt = f"""
    <task>
    Your task is to generate a JSON object where each key is a 2-letter ISO language code from this list: {languages}, and each value is a string explanation for the action in that language.
    </task>

    <input>
    Your input is:
    - city context
    - exactly one action
    - the rank of the action
    - a list of languages

    The actions have been ranked from a total of about 240 actions. Therefore these are the top 20 actions.
    The rank is a number between 1 and 20, where 1 is the highest priority and 20 is the lowest priority among the top selected 20 actions.
    The rank is based on a tournament ranking algorithm and decided on by an ML model.
    The rank is purely for your information, you should not mention it in the explanation.
    </input>

    <output>
    Each explanation must be 3-5 sentences describing why this action is a priority (or not) for the city, in the requested language.
    The explanation should be positive, with the tone influenced by the rank (higher rank = more positive tone, but do not mention the rank explicitly).
    Do not mention other actions, only focus on this one. Do not include numeric scores or internal model references. Do not mention the rank in the explanation.
    Only include the requested languages as keys in the JSON object. Do not include any extra keys or text.
    </output>

    <example_output>
    {{ 
        "en": <explanation in English>,
        "es": <explanation in Spanish>,
        "de": <explanation in German>
    }}
    </example_output>

    Constraints:
    - The explanation must be 3-5 sentences describing why this action is a priority (or not).
    - No numeric scores or internal model references.
    - Do not mention other actions, only focus on this one.
    - Do not mention the rank in the explanation.
    - Do not add any other text or keys to the JSON object.
    - Only output valid JSON without additional text or formatting like ```json ```.

    # CITY DATA:
    {city_data}

    # CURRENT ACTION:
    {single_action}

    # RANK:
    {rank}
    </task>
    """
    try:
        completion = openai_client.beta.chat.completions.parse(
            model=OPENAI_MODEL_NAME_EXPLANATIONS,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an expert climate action analyst and translator. Return ONLY a JSON object mapping language codes to explanation, following the user's instructions."
                    ),
                },
                {"role": "user", "content": explanation_prompt},
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
