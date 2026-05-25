"""LLM-assisted mapping helpers for optional free-text co-benefit preferences."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from app.modules.prioritizer.config import (
    get_alignment_other_preference_mapping_model,
)
from app.modules.prioritizer.utils.co_benefit_taxonomy import (
    ALLOWED_CO_BENEFIT_KEYS,
    CoBenefitKey,
)
from app.services.openai_client import create_openai_client

logger = logging.getLogger(__name__)
CO_BENEFIT_MAPPING_FREE_TEXT_MAX_CHARS = 400
CO_BENEFIT_MAPPING_PROMPT_MAX_CHARS = 20_000

PROMPT_FILE_PATH = (
    Path(__file__).resolve().parents[1] / "prompts" / "co_benefit_mapping.md"
)
SYSTEM_PROMPT_FILE_PATH = (
    Path(__file__).resolve().parents[1] / "prompts" / "co_benefit_mapping_system.md"
)


class CoBenefitMappingResponse(BaseModel):
    """Structured output returned by LLM co-benefit mapping."""

    mapped_co_benefits: list[CoBenefitKey] = Field(default_factory=list)
    unmappable_preference_fragments: list[str] = Field(default_factory=list)
def resolve_city_preferred_co_benefits(
    *,
    city_preference_other_text: str | None,
    available_co_benefit_keys: list[str],
) -> dict[str, object]:
    """Resolve free text into co-benefit keys for the optional helper path."""
    logger.warning(
        "Deprecated free-text co-benefit resolver invoked; active request flow should use direct checkbox values instead"
    )
    normalized_text = (city_preference_other_text or "").strip()
    truncated_text = _truncate_mapping_free_text(value=normalized_text)
    available_key_set = set(available_co_benefit_keys)
    if not truncated_text:
        return {
            "resolved_preferred_co_benefits": [],
            "unmappable_preference_fragments": [],
            "mapping_source": "fallback_blank_input",
            "provider": None,
            "model": None,
        }
    if not available_key_set:
        return {
            "resolved_preferred_co_benefits": [],
            "unmappable_preference_fragments": [],
            "mapping_source": "fallback_no_available_taxonomy",
            "provider": None,
            "model": None,
        }

    # Step 1: Resolve model/client configuration and fail open when missing.
    model_name = get_alignment_other_preference_mapping_model()
    if model_name is None:
        logger.warning(
            "Skipping co-benefit mapping because HIAP_MEED_ALIGNMENT_OTHER_PREFERENCE_MODEL is not set"
        )
        return {
            "resolved_preferred_co_benefits": [],
            "unmappable_preference_fragments": [],
            "mapping_source": "fallback_missing_model",
            "provider": "openai",
            "model": None,
        }

    try:
        # Step 2: Build prompt and request structured output from OpenAI.
        mapped_response = _resolve_from_llm(
            city_preference_other_text=truncated_text,
            available_co_benefit_keys=available_co_benefit_keys,
            model_name=model_name,
        )
    except Exception as error:
        truncated_length = len(truncated_text)
        prompt_too_large = "exceeds max length" in str(error).lower()
        if prompt_too_large:
            logger.warning(
                "Skipping co-benefit mapping because prompt length guard triggered model=%s input_characters=%s max_prompt_characters=%s available_keys=%s error=%s",
                model_name,
                truncated_length,
                CO_BENEFIT_MAPPING_PROMPT_MAX_CHARS,
                len(available_co_benefit_keys),
                error,
            )
        logger.warning(
            "Co-benefit mapping failed model=%s error=%s",
            model_name,
            error,
        )
        return {
            "resolved_preferred_co_benefits": [],
            "unmappable_preference_fragments": [],
            "mapping_source": "fallback_error",
            "provider": "openai",
            "model": model_name,
            "warning": str(error),
        }

    # Step 3: Keep only keys allowed for this request's co-benefit taxonomy.
    resolved_preferred_co_benefits = sorted(
        key
        for key in set(mapped_response.mapped_co_benefits)
        if key in available_key_set
    )
    return {
        "resolved_preferred_co_benefits": resolved_preferred_co_benefits,
        "unmappable_preference_fragments": mapped_response.unmappable_preference_fragments,
        "mapping_source": "llm",
        "provider": "openai",
        "model": model_name,
    }


def score_action_other_preference_component(
    *,
    action_co_benefits: dict[str, dict[str, Any]],
    resolved_preferred_co_benefits: list[str],
) -> tuple[float, list[str]]:
    """Score one action against the resolved city preference set on a `0..1` scale."""
    unique_preferred = sorted(set(resolved_preferred_co_benefits))
    if not unique_preferred:
        return 0.5, []

    # Only city-selected co-benefits count in the denominator.
    # If an action does not provide one preferred co-benefit, it contributes `0`
    # for that preference and lowers coverage relative to actions that do provide it.
    matched_preferred = sorted(
        key for key in unique_preferred if key in action_co_benefits
    )
    total = 0
    for key in unique_preferred:
        impact_numeric = action_co_benefits.get(key, {}).get("impact_numeric", 0)
        total += impact_numeric or 0

    # Normalize from the raw `-2..2` range into the block's canonical `0..1` range.
    min_possible = len(unique_preferred) * -2
    max_possible = len(unique_preferred) * 2
    score = (total - min_possible) / (max_possible - min_possible)
    return score, matched_preferred


def _resolve_from_llm(
    *,
    city_preference_other_text: str,
    available_co_benefit_keys: list[str],
    model_name: str,
) -> CoBenefitMappingResponse:
    """Call OpenAI parse endpoint and return typed co-benefit mapping output."""
    prompt = _build_prompt(
        city_preference_other_text=city_preference_other_text,
        available_co_benefit_keys=available_co_benefit_keys,
    )
    prompt_characters = len(prompt)
    if prompt_characters > CO_BENEFIT_MAPPING_PROMPT_MAX_CHARS:
        raise ValueError(
            "Co-benefit mapping prompt exceeds max length: "
            f"{prompt_characters}>{CO_BENEFIT_MAPPING_PROMPT_MAX_CHARS}"
        )

    system_prompt = _read_system_prompt_template()
    client = create_openai_client()
    completion = client.chat.completions.parse(
        model=model_name,
        temperature=0.0,
        response_format=CoBenefitMappingResponse,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
    )
    parsed = completion.choices[0].message.parsed
    if parsed is None:
        raise ValueError("OpenAI parse endpoint returned no parsed mapping payload")
    return parsed


def _build_prompt(
    *, city_preference_other_text: str, available_co_benefit_keys: list[str]
) -> str:
    """Build co-benefit mapping prompt from markdown template and context."""
    template = _read_prompt_template()
    return template.format(
        city_preference_other_text=city_preference_other_text,
        available_co_benefit_keys=json.dumps(
            available_co_benefit_keys, ensure_ascii=False
        ),
    )


def _truncate_mapping_free_text(*, value: str) -> str:
    """Clamp mapping free-text inputs to a fixed prompt-friendly length."""
    if len(value) <= CO_BENEFIT_MAPPING_FREE_TEXT_MAX_CHARS:
        return value

    logger.warning(
        "Truncating co-benefit mapping input from %s to %s characters",
        len(value),
        CO_BENEFIT_MAPPING_FREE_TEXT_MAX_CHARS,
    )
    return value[:CO_BENEFIT_MAPPING_FREE_TEXT_MAX_CHARS]


def _read_prompt_template() -> str:
    """Read co-benefit mapping prompt template from markdown file."""
    return PROMPT_FILE_PATH.read_text(encoding="utf-8")


def _read_system_prompt_template() -> str:
    """Read system prompt template used for co-benefit mapping."""
    return SYSTEM_PROMPT_FILE_PATH.read_text(encoding="utf-8").strip()
