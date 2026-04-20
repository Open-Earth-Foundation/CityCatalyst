"""LLM-assisted free-text mapping to action co-benefit taxonomy."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from app.modules.prioritizer.config import (
    get_alignment_other_preference_mapping_model,
)
from app.services.openai_client import create_openai_client

logger = logging.getLogger(__name__)

CoBenefitKey = Literal[
    "air_quality",
    "cost_of_living",
    "habitat",
    "housing",
    "mobility",
    "stakeholder_engagement",
    "water_quality",
]

ALLOWED_CO_BENEFIT_KEYS: tuple[CoBenefitKey, ...] = (
    "air_quality",
    "cost_of_living",
    "habitat",
    "housing",
    "mobility",
    "stakeholder_engagement",
    "water_quality",
)

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
    """Resolve city free text into co-benefit keys with fail-open fallback behavior."""
    normalized_text = (city_preference_other_text or "").strip()
    available_key_set = set(available_co_benefit_keys)
    if not normalized_text:
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
            city_preference_other_text=normalized_text,
            available_co_benefit_keys=available_co_benefit_keys,
            model_name=model_name,
        )
    except Exception as error:
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

    # Step 3: Keep only taxonomy keys present in this action set.
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
    *, action_co_benefit_keys: set[str], resolved_preferred_co_benefits: list[str]
) -> tuple[float, list[str]]:
    """Score action overlap against resolved city-preferred co-benefit keys."""
    if not resolved_preferred_co_benefits:
        return 0.0, []

    # Future implementation note: this temporary heuristic is intentionally simple.
    # Replace with richer product-defined co-benefit weighting when requirements settle.
    matched_preferred = sorted(
        key
        for key in set(resolved_preferred_co_benefits)
        if key in action_co_benefit_keys
    )
    # Score is the share of preferred co-benefits that this action matches.
    # matched_preferred is the list of co-benefit keys that this action matches.
    # resolved_preferred_co_benefits is the list of all preferred co-benefit keys.
    score = len(matched_preferred) / len(set(resolved_preferred_co_benefits))
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
    system_prompt = _read_system_prompt_template()
    client = create_openai_client()
    completion = client.chat.completions.parse(
        model=model_name,
        temperature=0,
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
            available_co_benefit_keys, ensure_ascii=True
        ),
    )


def _read_prompt_template() -> str:
    """Read co-benefit mapping prompt template from markdown file."""
    return PROMPT_FILE_PATH.read_text(encoding="utf-8")


def _read_system_prompt_template() -> str:
    """Read system prompt template used for co-benefit mapping."""
    return SYSTEM_PROMPT_FILE_PATH.read_text(encoding="utf-8").strip()
