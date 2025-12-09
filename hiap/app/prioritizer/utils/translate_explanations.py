import json
import logging
import os
from typing import Any, Dict, Optional, Type, cast

from dotenv import load_dotenv
from langsmith import traceable
from langsmith.wrappers import wrap_openai
from openai import OpenAI
from pydantic import BaseModel, create_model

from prioritizer.models import Explanation
from utils.logging_config import setup_logger

load_dotenv()
setup_logger()
logger = logging.getLogger(__name__)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY is not set")

OPENAI_MODEL_NAME_EXPLANATIONS_TRANSLATION = os.getenv(
    "OPENAI_MODEL_NAME_EXPLANATIONS_TRANSLATION"
)
if not OPENAI_MODEL_NAME_EXPLANATIONS_TRANSLATION:
    raise ValueError("OPENAI_MODEL_NAME_EXPLANATIONS_TRANSLATION is not set")

LANGCHAIN_PROJECT_NAME_PRIORITIZER = os.getenv("LANGCHAIN_PROJECT_NAME_PRIORITIZER")
if not LANGCHAIN_PROJECT_NAME_PRIORITIZER:
    raise ValueError("LANGCHAIN_PROJECT_NAME_PRIORITIZER is not set")


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


def _build_translation_model(language_codes: list[str]) -> Type[BaseModel]:
    """
    Build a dynamic schema that enforces one string field per target language.
    """
    fields: Dict[str, tuple[type, Any]] = {code: (str, ...) for code in language_codes}
    model = create_model("ExplanationTranslation", **fields)  # type: ignore[arg-type]
    return cast(Type[BaseModel], model)


TRANSLATION_SYSTEM_PROMPT = (
    "You are an expert climate policy translator. Translate the provided explanation "
    "from {source_language} into each requested language. Return ONLY JSON that matches "
    "the provided schema, filling every language key with natural, fluent text."
)


@traceable(run_type="llm", project_name=LANGCHAIN_PROJECT_NAME_PRIORITIZER)
def translate_explanation_text(
    explanation_text: str,
    source_language: str,
    target_languages: list[str],
) -> Optional[Explanation]:
    """
    Translate an existing explanation text from source_language into target_languages.
    """
    if not explanation_text.strip():
        logger.warning("translate_explanation_text received empty explanation text.")
        return None

    TranslationModel = _build_translation_model(target_languages)
    system_prompt = TRANSLATION_SYSTEM_PROMPT.format(source_language=source_language)

    # Chat completions expect message content to be a string or structured list, so we
    # serialize the payload to JSON.
    user_payload = json.dumps(
        {
            "source_language": source_language,
            "target_languages": target_languages,
            "text": explanation_text,
        },
        ensure_ascii=False,
    )

    try:
        completion = openai_client.beta.chat.completions.parse(
            model=OPENAI_MODEL_NAME_EXPLANATIONS_TRANSLATION,
            messages=[
                {
                    "role": "system",
                    "content": system_prompt,
                },
                {
                    "role": "user",
                    "content": user_payload,
                },
            ],
            temperature=0,
            response_format=TranslationModel,
            timeout=_get_openai_timeout_seconds(),
        )
        parsed = completion.choices[0].message.parsed
        if not isinstance(parsed, TranslationModel):
            logger.error(
                "translate_explanation_text received unexpected payload: %s", parsed
            )
            return None
        return Explanation(explanations=parsed.model_dump())
    except Exception as exc:
        logger.error("Translation generation failed: %s", str(exc), exc_info=True)
        return None
