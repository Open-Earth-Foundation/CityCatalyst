"""Translate one canonical English City Action Report in a single LLM call."""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path

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
MAX_TRANSLATION_ATTEMPTS = 2


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
    translation_payload = _build_translation_payload(
        canonical_chapters=canonical_chapters,
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
        completion = client.chat.completions.create(
            model=model_name,
            temperature=get_output_plan_temperature(),
            response_format=_translation_response_format(),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
        )
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
            )
        except ValueError:
            if attempt == MAX_TRANSLATION_ATTEMPTS:
                raise
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
        "preserve canonical chapter order, URLs, limitations, facts, and Markdown, "
        "and write all descriptive prose in each declared target language."
    )


def _build_translated_drafts(
    *,
    parsed: ReportTranslationBatch,
    canonical_chapters: list[ReportChapterDraft],
    target_chapter_inputs: dict[str, list[ReportChapterInput]],
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
            _validate_translated_content(
                canonical=canonical,
                translated_markdown=translated.markdown,
                translated_limitations=translated.limitations,
                language=language,
            )
            drafts.append(
                ReportChapterDraft(
                    key=canonical.key,
                    title=target_input.title,
                    markdown=translated.markdown,
                    source_refs=canonical.source_refs,
                    limitations=translated.limitations,
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
    canonical_urls = URL_PATTERN.findall(canonical.markdown)
    translated_urls = URL_PATTERN.findall(translated_markdown)
    if translated_urls != canonical_urls:
        raise ValueError(
            f"Translated chapter `{canonical.key}` changed canonical URLs"
        )
