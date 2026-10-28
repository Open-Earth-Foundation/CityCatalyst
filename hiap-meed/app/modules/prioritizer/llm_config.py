"""LLM-specific configuration helpers for prioritizer features."""

from __future__ import annotations

from app.config.llm_settings import get_llm_settings


def get_alignment_other_preference_mapping_model() -> str | None:
    """Return configured model name for alignment other-preference mapping."""
    value = get_llm_settings().models.alignment_other_preference.name.strip()
    if not value:
        return None
    return value


def get_alignment_other_preference_mapping_temperature() -> float:
    """Return configured temperature for alignment other-preference mapping."""
    return get_llm_settings().models.alignment_other_preference.temperature


def is_explanations_enabled() -> bool:
    """Return global feature switch for LLM explanation generation."""
    return bool(get_llm_settings().features.explanations_enabled)


def get_explanations_model() -> str | None:
    """Return configured explanation model name, if set."""
    value = get_llm_settings().models.explanations.name.strip()
    if not value:
        return None
    return value


def get_explanations_temperature() -> float:
    """Return configured explanation model temperature."""
    return get_llm_settings().models.explanations.temperature


def get_explanation_translations_model() -> str | None:
    """Return configured translation model name, if set."""
    value = get_llm_settings().models.explanation_translations.name.strip()
    if not value:
        return None
    return value


def get_explanation_translations_temperature() -> float:
    """Return configured explanation translation model temperature."""
    return get_llm_settings().models.explanation_translations.temperature


def get_output_plan_model() -> str | None:
    """Return configured output-plan report model name, if set."""
    value = get_llm_settings().models.output_plan.name.strip()
    if not value:
        return None
    return value


def get_output_plan_temperature() -> float:
    """Return configured output-plan report model temperature."""
    return get_llm_settings().models.output_plan.temperature


def is_free_text_exclusion_resolution_enabled() -> bool:
    """Return feature switch for preview-time LLM exclusion resolution."""
    return bool(get_llm_settings().features.free_text_exclusions_enabled)


def get_free_text_exclusion_model() -> str | None:
    """Return configured model name for free-text exclusion resolution."""
    value = get_llm_settings().models.free_text_exclusions.name.strip()
    if not value:
        return None
    return value


def get_free_text_exclusion_temperature() -> float:
    """Return configured temperature for free-text exclusion resolution."""
    return get_llm_settings().models.free_text_exclusions.temperature
