"""Canonical explanation translation helpers."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from pydantic import BaseModel, Field

from app.modules.prioritizer.llm_config import (
    get_explanation_translations_model,
    get_explanation_translations_temperature,
)
from app.modules.prioritizer.localization import (
    terminology_for_translation,
    validate_generated_language,
)
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
            "The explanation_translations model must be configured in llm_config.yaml when translations are requested"
        )

    actions_payload = [
        {
            "action_id": action_id,
            "canonical_explanation": canonical_explanations_by_action_id[action_id],
        }
        for action_id in sorted(canonical_explanations_by_action_id.keys())
    ]
    terminology = terminology_for_translation(normalized_target_languages)
    prompt = _build_prompt(
        source_language="en",
        target_languages=normalized_target_languages,
        actions_payload=actions_payload,
        terminology=terminology,
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
        temperature=get_explanation_translations_temperature(),
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
    _validate_translation_languages(translations_by_action_id)
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
            "terminology": terminology,
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
    # Track the cleaned translations we will return plus any contract violations.
    translations_by_action_id: dict[str, dict[str, str]] = {}
    warning_action_ids: list[str] = []
    unexpected_action_ids: set[str] = set()
    duplicate_action_ids: set[str] = set()
    unknown_languages_by_action_id: dict[str, set[str]] = {}
    duplicate_languages_by_action_id: dict[str, set[str]] = {}

    # Validate each action row and normalize the translated text we keep.
    for row in translation_rows:
        action_id = row.action_id.strip()
        if action_id not in expected_action_ids:
            unexpected_action_ids.add(action_id)
            continue
        if action_id in translations_by_action_id:
            duplicate_action_ids.add(action_id)
            continue

        cleaned_translations: dict[str, str] = {}
        for translation in row.translations:
            language = translation.language.strip().lower()
            if language not in target_languages:
                unknown_languages_by_action_id.setdefault(action_id, set()).add(language)
                continue
            if language in cleaned_translations:
                duplicate_languages_by_action_id.setdefault(action_id, set()).add(
                    language
                )
                continue
            cleaned_text = " ".join(translation.text.strip().split())
            if cleaned_text:
                cleaned_translations[language] = cleaned_text

        translations_by_action_id[action_id] = cleaned_translations
        if row.source_language_warning:
            warning_action_ids.append(action_id)

    # Confirm that the LLM returned one complete translation set per action.
    missing_action_ids = sorted(expected_action_ids - set(translations_by_action_id.keys()))
    incomplete_languages_by_action_id = {
        action_id: sorted(set(target_languages) - set(translations.keys()))
        for action_id, translations in translations_by_action_id.items()
        if set(translations.keys()) != set(target_languages)
    }
    if (
        unexpected_action_ids
        or duplicate_action_ids
        or unknown_languages_by_action_id
        or duplicate_languages_by_action_id
        or missing_action_ids
        or incomplete_languages_by_action_id
    ):
        # Fail fast with one explicit error so callers never receive partial translations silently.
        error_details: list[str] = []
        if unexpected_action_ids:
            error_details.append(
                f"unexpected action IDs {sorted(unexpected_action_ids)}"
            )
        if duplicate_action_ids:
            error_details.append(f"duplicate action rows {sorted(duplicate_action_ids)}")
        if unknown_languages_by_action_id:
            error_details.append(
                "unexpected languages "
                f"{_sorted_detail_map(unknown_languages_by_action_id)}"
            )
        if duplicate_languages_by_action_id:
            error_details.append(
                "duplicate language rows "
                f"{_sorted_detail_map(duplicate_languages_by_action_id)}"
            )
        if missing_action_ids:
            error_details.append(f"missing action rows {missing_action_ids}")
        if incomplete_languages_by_action_id:
            error_details.append(
                "missing target-language coverage "
                f"{incomplete_languages_by_action_id}"
            )
        raise ValueError(
            "LLM translation output did not satisfy the required action/language coverage: "
            + "; ".join(error_details)
        )

    return translations_by_action_id, sorted(set(warning_action_ids))


def _build_translation_warnings(*, warning_action_ids: list[str]) -> list[str]:
    """Build public top-level warnings from internal per-action language flags."""
    if not warning_action_ids:
        return []
    return [
        "One or more canonical explanations labeled as English appeared non-English or mixed-language. Translations were still returned."
    ]


def _validate_translation_languages(
    translations_by_action_id: dict[str, dict[str, str]],
) -> None:
    """Require each substantive translation to use its declared target language."""
    for action_id, translations in translations_by_action_id.items():
        for language, translated_text in translations.items():
            validate_generated_language(
                translated_text,
                language,
                content_label=(
                    f"Translation for action `{action_id}` and language `{language}`"
                ),
            )


def _sorted_detail_map(detail_map: dict[str, set[str]]) -> dict[str, list[str]]:
    """Convert a string->set mapping into a deterministic string->sorted-list mapping."""
    return {
        action_id: sorted(values)
        for action_id, values in sorted(detail_map.items())
    }


def _build_prompt(
    *,
    source_language: str,
    target_languages: list[str],
    actions_payload: list[dict[str, str]],
    terminology: dict[str, object],
) -> str:
    """Build translation prompt from markdown template and canonical explanation rows."""
    template = _read_prompt_template()
    return template.format(
        source_language=source_language,
        target_languages=json.dumps(target_languages, ensure_ascii=False),
        terminology_json=json.dumps(terminology, ensure_ascii=False, indent=2),
        actions_json=json.dumps(actions_payload, ensure_ascii=False, indent=2),
    )


def _read_prompt_template() -> str:
    """Read explanation translation prompt template from markdown file."""
    return PROMPT_FILE_PATH.read_text(encoding="utf-8")


def _read_system_prompt_template() -> str:
    """Read explanation translation system prompt template from markdown file."""
    return SYSTEM_PROMPT_FILE_PATH.read_text(encoding="utf-8").strip()
