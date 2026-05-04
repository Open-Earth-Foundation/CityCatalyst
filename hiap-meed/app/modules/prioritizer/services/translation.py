"""Canonical explanation translation helpers."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from pydantic import BaseModel, Field

from app.modules.prioritizer.config import get_explanation_translations_model
from app.services.openai_client import create_openai_client


logger = logging.getLogger(__name__)

PROMPT_FILE_PATH = (
    Path(__file__).resolve().parents[1] / "prompts" / "explanation_translation.md"
)
SYSTEM_PROMPT_FILE_PATH = (
    Path(__file__).resolve().parents[1]
    / "prompts"
    / "explanation_translation_system.md"
)


class TranslationItem(BaseModel):
    """One translated text row for a single target language."""

    language: str
    text: str


class ActionTranslationRow(BaseModel):
    """Structured translation row returned by the LLM for one action."""

    action_id: str
    translations: list[TranslationItem]
    source_language_warning: bool


class TranslationBatch(BaseModel):
    """Top-level translation output returned by the LLM."""

    translations: list[ActionTranslationRow]


def translate_explanations(
    *,
    canonical_explanations_by_action_id: dict[str, str],
    target_languages: list[str],
) -> tuple[dict[str, dict[str, str]], list[str], dict[str, object]]:
    """
    Translate canonical English explanations into requested target languages.

    The LLM returns an internal per-action `source_language_warning` flag. This
    service aggregates flagged action IDs into public top-level warning strings
    for the API response instead of exposing the raw flag directly.
    """
    normalized_target_languages = [
        language.strip().lower() for language in target_languages if language.strip()
    ]
    if not canonical_explanations_by_action_id or not normalized_target_languages:
        return {}, [], {"status": "skipped", "reason": "no_translation_work"}

    model_name = get_explanation_translations_model()
    if model_name is None:
        raise ValueError(
            "HIAP_MEED_EXPLANATION_TRANSLATIONS_MODEL must be set when translations are requested"
        )

    actions_payload = [
        {
            "action_id": action_id,
            "canonical_explanation": canonical_explanations_by_action_id[action_id],
        }
        for action_id in sorted(canonical_explanations_by_action_id.keys())
    ]
    prompt = _build_prompt(
        source_language="en",
        target_languages=normalized_target_languages,
        actions_payload=actions_payload,
    )
    system_prompt = _read_system_prompt_template()
    logger.info(
        "Calling explanation translation LLM API actions=%s target_languages=%s model=%s",
        len(actions_payload),
        normalized_target_languages,
        model_name,
    )

    client = create_openai_client()
    completion = client.chat.completions.parse(
        model=model_name,
        temperature=0,
        response_format=TranslationBatch,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
    )
    parsed = completion.choices[0].message.parsed
    if parsed is None:
        raise ValueError("LLM did not return parsable translation output")

    translations_by_action_id, warning_action_ids = _rows_to_translations(
        translation_rows=parsed.translations,
        expected_action_ids=set(canonical_explanations_by_action_id.keys()),
        target_languages=normalized_target_languages,
    )
    warnings = _build_translation_warnings(warning_action_ids=warning_action_ids)
    llm_io_payload = {
        "status": "completed",
        "provider": "openai",
        "model": model_name,
        "request_context": {
            "source_language": "en",
            "target_languages": normalized_target_languages,
            "ranked_action_ids": sorted(canonical_explanations_by_action_id.keys()),
        },
        "llm_input": {
            "system_prompt": system_prompt,
            "prompt_text": prompt,
            "actions_payload": actions_payload,
        },
        "llm_output": {
            "parsed": parsed.model_dump(mode="json"),
            "translations_by_action_id": translations_by_action_id,
            "warning_action_ids": warning_action_ids,
            "warnings": warnings,
        },
    }
    return translations_by_action_id, warnings, llm_io_payload


def _rows_to_translations(
    *,
    translation_rows: list[ActionTranslationRow],
    expected_action_ids: set[str],
    target_languages: list[str],
) -> tuple[dict[str, dict[str, str]], list[str]]:
    """Convert structured translation rows into validated action-language mappings."""
    translations_by_action_id: dict[str, dict[str, str]] = {}
    warning_action_ids: list[str] = []

    for row in translation_rows:
        action_id = row.action_id.strip()
        if action_id not in expected_action_ids:
            continue

        cleaned_translations: dict[str, str] = {}
        for translation in row.translations:
            language = translation.language.strip().lower()
            if language not in target_languages:
                continue
            cleaned_text = " ".join(translation.text.strip().split())
            if cleaned_text:
                cleaned_translations[language] = cleaned_text

        if cleaned_translations:
            translations_by_action_id[action_id] = cleaned_translations
        if row.source_language_warning:
            warning_action_ids.append(action_id)

    return translations_by_action_id, sorted(set(warning_action_ids))


def _build_translation_warnings(*, warning_action_ids: list[str]) -> list[str]:
    """Build public top-level warnings from internal per-action language flags."""
    if not warning_action_ids:
        return []
    return [
        "One or more canonical explanations labeled as English appeared non-English or mixed-language. Translations were still returned."
    ]


def _build_prompt(
    *,
    source_language: str,
    target_languages: list[str],
    actions_payload: list[dict[str, str]],
) -> str:
    """Build translation prompt from markdown template and canonical explanation rows."""
    template = _read_prompt_template()
    return template.format(
        source_language=source_language,
        target_languages=json.dumps(target_languages, ensure_ascii=False),
        actions_json=json.dumps(actions_payload, ensure_ascii=False, indent=2),
    )


def _read_prompt_template() -> str:
    """Read explanation translation prompt template from markdown file."""
    return PROMPT_FILE_PATH.read_text(encoding="utf-8")


def _read_system_prompt_template() -> str:
    """Read explanation translation system prompt template from markdown file."""
    return SYSTEM_PROMPT_FILE_PATH.read_text(encoding="utf-8").strip()
