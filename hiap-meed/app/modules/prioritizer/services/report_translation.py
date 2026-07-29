"""Translate one canonical English City Action Report in a single LLM call."""

from __future__ import annotations

import json
import logging
import re
from collections import Counter
from pathlib import Path

from openai import APIConnectionError, APIStatusError

from app.modules.prioritizer.llm_config import (
    get_output_plan_model,
    get_output_plan_temperature,
)
from app.modules.prioritizer.localization import validate_generated_language
from app.modules.prioritizer.report_models import (
    ReportChapterDraft,
    ReportChapterInput,
    ReportTranslationBatch,
)
from app.services.openai_client import create_openai_client

logger = logging.getLogger(__name__)

PROMPT_DIR = Path(__file__).resolve().parents[1] / "prompts"
SYSTEM_PROMPT_FILE_PATH = PROMPT_DIR / "city_action_report_translation_system.md"
PROMPT_FILE_PATH = PROMPT_DIR / "city_action_report_translation.md"
URL_PATTERN = re.compile(r"https?://[^\s)\]>]+")
URL_PLACEHOLDER_PATTERN = re.compile(r"\[\[URL_[A-Z0-9_]+_\d+\]\]")
MAX_TRANSLATION_ATTEMPTS = 2


class ReportTranslationValidationError(ValueError):
    """Raised when LLM translation output fails validation after its retry."""


class ReportTranslationProviderError(RuntimeError):
    """Raised when the translation provider fails transiently after SDK retries."""


def translate_output_plan(
    *,
    canonical_chapters: list[ReportChapterDraft],
    target_chapter_inputs: dict[str, list[ReportChapterInput]],
) -> tuple[dict[str, list[ReportChapterDraft]], dict[str, object]]:
    """
    Translate all canonical chapters into every target language in one call.

    The target chapter inputs provide deterministic localized titles and
    terminology. The returned drafts retain canonical source references and
    fail closed when language, chapter coverage, order, or URLs drift.
    """
    if not target_chapter_inputs:
        return {}, {"status": "skipped", "reason": "no_target_languages"}

    target_languages = list(target_chapter_inputs)
    _validate_target_inputs(
        canonical_chapters=canonical_chapters,
        target_chapter_inputs=target_chapter_inputs,
    )
    protected_chapters, url_placeholders_by_chapter = _protect_urls(canonical_chapters)
    translation_payload = _build_translation_payload(
        canonical_chapters=protected_chapters,
        target_chapter_inputs=target_chapter_inputs,
    )
    prompt = _build_prompt(translation_payload)
    system_prompt = SYSTEM_PROMPT_FILE_PATH.read_text(encoding="utf-8").strip()

    model_name = get_output_plan_model()
    if model_name is None:
        raise ValueError("The output_plan model must be configured in llm_config.yaml")

    logger.info(
        "Calling output-plan translation LLM API chapters=%s target_languages=%s model=%s",
        len(canonical_chapters),
        target_languages,
        model_name,
    )
    client = create_openai_client()
    attempts: list[dict[str, object]] = []
    parsed: ReportTranslationBatch | None = None
    translated_chapters: dict[str, list[ReportChapterDraft]] | None = None
    for attempt in range(1, MAX_TRANSLATION_ATTEMPTS + 1):
        try:
            completion = client.chat.completions.create(
                model=model_name,
                temperature=get_output_plan_temperature(),
                response_format=_translation_response_format(),
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
            )
        except APIConnectionError as error:
            raise ReportTranslationProviderError(
                "Report translation provider is temporarily unavailable"
            ) from error
        except APIStatusError as error:
            if error.status_code not in {408, 409, 429} and error.status_code < 500:
                raise
            raise ReportTranslationProviderError(
                "Report translation provider is temporarily unavailable"
            ) from error
        content = completion.choices[0].message.content
        try:
            if not content:
                raise ValueError("LLM did not return structured report translations")
            candidate = ReportTranslationBatch.model_validate_json(content)
            attempts.append(
                {"attempt": attempt, "parsed": candidate.model_dump(mode="json")}
            )
            translated_chapters = _build_translated_drafts(
                parsed=candidate,
                canonical_chapters=canonical_chapters,
                target_chapter_inputs=target_chapter_inputs,
                url_placeholders_by_chapter=url_placeholders_by_chapter,
            )
        except ValueError as error:
            attempts.append({"attempt": attempt, "validation_error": str(error)})
            if attempt == MAX_TRANSLATION_ATTEMPTS:
                raise ReportTranslationValidationError(str(error)) from error
            prompt = _build_retry_prompt(prompt)
            continue
        parsed = candidate
        break

    if parsed is None or translated_chapters is None:
        raise ValueError("LLM report translation validation failed")

    return translated_chapters, {
        "status": "completed",
        "provider": "openai",
        "model": model_name,
        "target_languages": target_languages,
        "prompt_text": prompt,
        "parsed": parsed.model_dump(mode="json"),
        "attempts": attempts,
    }


def _validate_target_inputs(
    *,
    canonical_chapters: list[ReportChapterDraft],
    target_chapter_inputs: dict[str, list[ReportChapterInput]],
) -> None:
    """Require every target language to match canonical chapter coverage and order."""
    canonical_keys = [chapter.key for chapter in canonical_chapters]
    for language, chapter_inputs in target_chapter_inputs.items():
        if language == "en":
            raise ValueError("English must not be passed as a report target language")
        if [chapter.key for chapter in chapter_inputs] != canonical_keys:
            raise ValueError(
                f"Target chapter inputs for `{language}` do not match English order"
            )


def _build_translation_payload(
    *,
    canonical_chapters: list[ReportChapterDraft],
    target_chapter_inputs: dict[str, list[ReportChapterInput]],
) -> dict[str, object]:
    """Build the model-visible canonical report and localized terminology payload."""
    return {
        "source_language": "en",
        "target_languages": list(target_chapter_inputs),
        "canonical_chapters": [
            chapter.model_dump(mode="json") for chapter in canonical_chapters
        ],
        "terminology_by_language": {
            language: [
                {
                    "key": chapter.key,
                    "title": chapter.title,
                    "terminology": chapter.terminology,
                }
                for chapter in chapter_inputs
            ]
            for language, chapter_inputs in target_chapter_inputs.items()
        },
    }


def _protect_urls(
    canonical_chapters: list[ReportChapterDraft],
) -> tuple[list[ReportChapterDraft], dict[str, dict[str, str]]]:
    """Protect URLs in canonical Markdown and limitations with stable placeholders."""
    placeholders_by_chapter: dict[str, dict[str, str]] = {}
    protected_chapters: list[ReportChapterDraft] = []
    for chapter in canonical_chapters:
        placeholders: dict[str, str] = {}

        def replace_url(match: re.Match[str]) -> str:
            """Return the next stable placeholder for one canonical URL."""
            placeholder = f"[[URL_{chapter.key.upper()}_{len(placeholders) + 1}]]"
            placeholders[placeholder] = match.group(0)
            return placeholder

        protected_markdown = URL_PATTERN.sub(replace_url, chapter.markdown)
        protected_limitations = [
            URL_PATTERN.sub(replace_url, limitation)
            for limitation in chapter.limitations
        ]
        protected_chapters.append(
            chapter.model_copy(
                update={
                    "markdown": protected_markdown,
                    "limitations": protected_limitations,
                }
            )
        )
        placeholders_by_chapter[chapter.key] = placeholders
    return protected_chapters, placeholders_by_chapter


def _restore_urls(
    *,
    translated_markdown: str,
    translated_limitations: list[str],
    placeholders: dict[str, str],
    chapter_key: str,
) -> tuple[str, list[str]]:
    """Restore URLs after validating placeholders across one translated chapter."""
    translated_fields = [translated_markdown, *translated_limitations]
    found_placeholders = [
        placeholder
        for field in translated_fields
        for placeholder in URL_PLACEHOLDER_PATTERN.findall(field)
    ]
    unexpected_placeholders = sorted(set(found_placeholders) - set(placeholders))
    invalid_urls = [
        url
        for placeholder, url in placeholders.items()
        if sum(field.count(placeholder) for field in translated_fields) != 1
    ]
    if invalid_urls or unexpected_placeholders:
        details: list[str] = []
        if invalid_urls:
            details.append(f"missing or duplicated URLs: {invalid_urls}")
        if unexpected_placeholders:
            details.append(f"unexpected placeholders: {unexpected_placeholders}")
        raise ValueError(
            f"Translated chapter `{chapter_key}` did not preserve URL placeholders; "
            + "; ".join(details)
        )
    def restore_field_urls(field: str) -> str:
        """Restore every canonical URL placeholder in one translated field."""
        for placeholder, url in placeholders.items():
            field = field.replace(placeholder, url)
        return field

    return restore_field_urls(translated_markdown), [
        restore_field_urls(limitation) for limitation in translated_limitations
    ]


def _build_prompt(translation_payload: dict[str, object]) -> str:
    """Render the report translation prompt from the runtime payload."""
    template = PROMPT_FILE_PATH.read_text(encoding="utf-8").strip()
    return template.format(
        translation_input_json=json.dumps(
            translation_payload,
            ensure_ascii=False,
            indent=2,
        )
    )


def _translation_response_format() -> dict[str, object]:
    """Return the strict JSON Schema for batched report translations."""
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "output_plan_translation_response",
            "strict": True,
            "schema": ReportTranslationBatch.model_json_schema(),
        },
    }


def _build_retry_prompt(prompt: str) -> str:
    """Add a focused correction after an invalid report translation."""
    return (
        f"{prompt}\n\n"
        "Correction: return every requested language and chapter exactly once, "
        "preserve canonical chapter order, every [[URL_<CHAPTER>_<N>]] placeholder "
        "exactly once in its corresponding Markdown or limitation field, "
        "limitations, facts, and Markdown, "
        "and write all descriptive prose in each declared target language."
    )


def _build_translated_drafts(
    *,
    parsed: ReportTranslationBatch,
    canonical_chapters: list[ReportChapterDraft],
    target_chapter_inputs: dict[str, list[ReportChapterInput]],
    url_placeholders_by_chapter: dict[str, dict[str, str]],
) -> dict[str, list[ReportChapterDraft]]:
    """Validate the translation batch and build localized report drafts."""
    expected_languages = set(target_chapter_inputs)
    rows_by_language = {}
    for row in parsed.translations:
        if row.language in rows_by_language:
            raise ValueError(f"Duplicate report translation for `{row.language}`")
        rows_by_language[row.language] = row
    if set(rows_by_language) != expected_languages:
        raise ValueError("Translated report languages do not match the request")

    translated_by_language: dict[str, list[ReportChapterDraft]] = {}
    for language, chapter_inputs in target_chapter_inputs.items():
        translated_rows = rows_by_language[language].chapters
        expected_keys = [chapter.key for chapter in canonical_chapters]
        if [chapter.key for chapter in translated_rows] != expected_keys:
            raise ValueError(
                f"Translated chapter order for `{language}` does not match English"
            )

        drafts: list[ReportChapterDraft] = []
        for canonical, target_input, translated in zip(
            canonical_chapters,
            chapter_inputs,
            translated_rows,
            strict=True,
        ):
            translated_markdown, translated_limitations = _restore_urls(
                translated_markdown=translated.markdown,
                translated_limitations=translated.limitations,
                placeholders=url_placeholders_by_chapter[canonical.key],
                chapter_key=canonical.key,
            )
            _validate_translated_content(
                canonical=canonical,
                translated_markdown=translated_markdown,
                translated_limitations=translated_limitations,
                language=language,
            )
            drafts.append(
                ReportChapterDraft(
                    key=canonical.key,
                    title=target_input.title,
                    markdown=translated_markdown,
                    source_refs=canonical.source_refs,
                    limitations=translated_limitations,
                )
            )
        translated_by_language[language] = drafts
    return translated_by_language


def _validate_translated_content(
    *,
    canonical: ReportChapterDraft,
    translated_markdown: str,
    translated_limitations: list[str],
    language: str,
) -> None:
    """Require target-language prose and preserve every canonical URL."""
    if not translated_markdown.strip():
        raise ValueError(f"Translated chapter `{canonical.key}` returned blank Markdown")
    if len(translated_limitations) != len(canonical.limitations):
        raise ValueError(
            f"Translated chapter `{canonical.key}` changed limitation coverage"
        )
    validate_generated_language(
        "\n".join([translated_markdown, *translated_limitations]),
        language,
        content_label=f"Translated chapter `{canonical.key}`",
    )
    canonical_urls = URL_PATTERN.findall(
        "\n".join([canonical.markdown, *canonical.limitations])
    )
    translated_urls = URL_PATTERN.findall(
        "\n".join([translated_markdown, *translated_limitations])
    )
    if translated_urls != canonical_urls:
        canonical_counts = Counter(canonical_urls)
        translated_counts = Counter(translated_urls)
        missing_urls = list((canonical_counts - translated_counts).elements())
        unexpected_urls = list((translated_counts - canonical_counts).elements())
        details: list[str] = []
        if missing_urls:
            details.append(f"missing URLs: {missing_urls}")
        if unexpected_urls:
            details.append(f"unexpected URLs: {unexpected_urls}")
        if not details:
            details.append("URL order changed")
        raise ValueError(
            f"Translated chapter `{canonical.key}` changed canonical URLs; "
            + "; ".join(details)
        )
