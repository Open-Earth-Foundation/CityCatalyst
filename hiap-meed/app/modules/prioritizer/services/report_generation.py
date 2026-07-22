"""LLM-backed chapter generation for output-plan reports."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from pydantic import BaseModel, ConfigDict

from app.modules.prioritizer.llm_config import (
    get_output_plan_model,
    get_output_plan_temperature,
)
from app.modules.prioritizer.localization import validate_generated_language
from app.modules.prioritizer.models import CityActionReportChapter
from app.modules.prioritizer.report_models import (
    ReportChapterDraft,
    ReportChapterInput,
    ReportGenerationResult,
)
from app.services.openai_client import create_openai_client

logger = logging.getLogger(__name__)

MAX_LANGUAGE_ATTEMPTS = 2

PROMPT_DIR = Path(__file__).resolve().parents[1] / "prompts"
SYSTEM_PROMPT_FILE_PATH = PROMPT_DIR / "city_action_report_system.md"
CHAPTER_PROMPT_FILES: dict[str, Path] = {
    "snapshot": PROMPT_DIR / "city_action_report_snapshot.md",
    "the_action": PROMPT_DIR / "city_action_report_the_action.md",
    "action_impact": PROMPT_DIR / "city_action_report_action_impact.md",
    "city_fit": PROMPT_DIR / "city_action_report_city_fit.md",
    "policy_backing": PROMPT_DIR / "city_action_report_policy_backing.md",
    "legal_mandate_delivery": PROMPT_DIR
    / "city_action_report_legal_mandate_delivery.md",
    "financing_precedents_pathway": PROMPT_DIR
    / "city_action_report_financing_precedents_pathway.md",
    "sources_assumptions": PROMPT_DIR / "city_action_report_sources_assumptions.md",
}


class OutputPlanChapterResponse(BaseModel):
    """Structured chapter response returned by the LLM."""

    model_config = ConfigDict(extra="forbid")

    markdown: str
    source_refs: list[str]
    limitations: list[str]


def generate_output_plan_chapters(
    *,
    chapter_inputs: list[ReportChapterInput],
    use_llm: bool = True,
) -> ReportGenerationResult:
    """
    Generate output-plan chapters from curated chapter inputs.

    Inputs:
    - one chapter input per Notion report section
    - `use_llm=False` for context-only debug and deterministic tests

    Outputs:
    - ordered response chapters and provider I/O diagnostics

    Side effects:
    - calls OpenAI when `use_llm=True`
    """
    if not use_llm:
        chapters = [
            _build_deterministic_chapter(chapter_input)
            for chapter_input in chapter_inputs
        ]
        return ReportGenerationResult(
            chapters=chapters,
            llm_io={"status": "skipped", "reason": "debug_context_only"},
        )

    model_name = get_output_plan_model()
    if model_name is None:
        raise ValueError("The output_plan model must be configured in llm_config.yaml")

    system_prompt = _read_system_prompt()
    client = create_openai_client()
    chapters: list[ReportChapterDraft] = []
    llm_calls: list[dict[str, object]] = []

    for chapter_input in chapter_inputs:
        # Build one isolated prompt per chapter to avoid context bleed.
        prompt = _build_chapter_prompt(chapter_input)
        logger.info(
            "Calling output-plan LLM API chapter=%s model=%s",
            chapter_input.key,
            model_name,
        )
        parsed: OutputPlanChapterResponse | None = None
        attempts: list[dict[str, object]] = []
        for attempt in range(1, MAX_LANGUAGE_ATTEMPTS + 1):
            completion = client.chat.completions.create(
                model=model_name,
                temperature=get_output_plan_temperature(),
                response_format=_output_plan_response_format(),
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
            )
            content = completion.choices[0].message.content
            if not content:
                raise ValueError(
                    "LLM did not return structured output for chapter "
                    f"`{chapter_input.key}`"
                )
            candidate = OutputPlanChapterResponse.model_validate_json(content)
            attempts.append({"attempt": attempt, "parsed": candidate.model_dump()})
            try:
                _validate_chapter_output(candidate, chapter_input)
            except ValueError:
                if attempt == MAX_LANGUAGE_ATTEMPTS:
                    raise
                prompt = _build_language_retry_prompt(prompt, chapter_input.language)
                continue
            parsed = candidate
            break

        if parsed is None:
            raise ValueError(
                f"LLM output validation failed for chapter `{chapter_input.key}`"
            )
        draft = ReportChapterDraft(
            key=chapter_input.key,
            title=chapter_input.title,
            markdown=parsed.markdown,
            source_refs=parsed.source_refs,
            limitations=parsed.limitations,
        )
        chapters.append(draft)
        llm_calls.append(
            {
                "chapter": chapter_input.key,
                "model": model_name,
                "prompt_text": prompt,
                "parsed": draft.model_dump(mode="json"),
                "attempts": attempts,
            }
        )

    return ReportGenerationResult(
        chapters=chapters,
        llm_io={
            "status": "completed",
            "provider": "openai",
            "model": model_name,
            "chapters": llm_calls,
        },
    )


def _build_deterministic_chapter(
    chapter_input: ReportChapterInput,
) -> ReportChapterDraft:
    """Build a deterministic Markdown chapter for debug and tests."""
    facts_json = json.dumps(chapter_input.facts, ensure_ascii=False, indent=2)
    limitations = chapter_input.limitations + chapter_input.notion_deferred
    markdown = (
        f"## {chapter_input.title}\n\n"
        "This draft was generated from structured report context without an LLM call.\n\n"
        "```json\n"
        f"{facts_json}\n"
        "```"
    )
    return ReportChapterDraft(
        key=chapter_input.key,
        title=chapter_input.title,
        markdown=markdown,
        source_refs=chapter_input.source_refs,
        limitations=list(dict.fromkeys(limitations)),
    )


def _build_chapter_prompt(chapter_input: ReportChapterInput) -> str:
    """Build one chapter prompt from the chapter-specific markdown template."""
    template = _read_chapter_prompt(chapter_input.key)
    return template.format(
        chapter_input_json=json.dumps(
            _model_visible_chapter_input(chapter_input),
            ensure_ascii=False,
            indent=2,
        )
    )


def _output_plan_response_format() -> dict[str, object]:
    """Return the strict JSON Schema used for one report chapter response."""
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "output_plan_chapter_response",
            "strict": True,
            "schema": OutputPlanChapterResponse.model_json_schema(),
        },
    }


def _model_visible_chapter_input(chapter_input: ReportChapterInput) -> dict[str, object]:
    """
    Return chapter input fields that are appropriate for user-facing prose.

    Internal planning and guardrail fields stay in diagnostics artifacts, but
    the LLM should not see them as content it might summarize into Markdown.
    """
    payload = chapter_input.model_dump(mode="json")
    payload.pop("notion_coverage", None)
    payload.pop("notion_deferred", None)
    payload.pop("unsupported_claims", None)
    return payload


def aggregate_localized_chapters(
    *,
    languages: list[str],
    chapters_by_language: dict[str, list[ReportChapterDraft]],
) -> list[CityActionReportChapter]:
    """Aggregate validated single-language drafts into the public i18n contract."""
    expected_languages = set(languages)
    if set(chapters_by_language) != expected_languages:
        raise ValueError("Generated chapter languages do not match the request")

    # Use the first requested language as the stable chapter-order reference.
    reference_chapters = chapters_by_language[languages[0]]
    chapters: list[CityActionReportChapter] = []
    for index, reference in enumerate(reference_chapters):
        localized_drafts: dict[str, ReportChapterDraft] = {}
        for language in languages:
            language_chapters = chapters_by_language[language]
            if index >= len(language_chapters):
                raise ValueError(f"Missing `{language}` chapter at index {index}")
            draft = language_chapters[index]
            if draft.key != reference.key:
                raise ValueError("Generated chapter order differs between languages")
            localized_drafts[language] = draft

        source_refs: list[str] = []
        for language in languages:
            for source_ref in localized_drafts[language].source_refs:
                if source_ref not in source_refs:
                    source_refs.append(source_ref)
        chapters.append(
            CityActionReportChapter(
                key=reference.key,
                title={
                    language: localized_drafts[language].title
                    for language in languages
                },
                markdown={
                    language: localized_drafts[language].markdown
                    for language in languages
                },
                limitations={
                    language: localized_drafts[language].limitations
                    for language in languages
                },
                source_refs=source_refs,
            )
        )
    return chapters


def _validate_chapter_output(
    output: OutputPlanChapterResponse, chapter_input: ReportChapterInput
) -> None:
    """Validate provenance and dominant language before exposing LLM output."""
    unexpected_refs = set(output.source_refs) - set(chapter_input.source_refs)
    if unexpected_refs:
        raise ValueError(
            f"Chapter `{chapter_input.key}` returned unknown source refs: "
            f"{sorted(unexpected_refs)}"
        )
    validate_generated_language(
        "\n".join([output.markdown, *output.limitations]),
        chapter_input.language,
        content_label=f"Chapter `{chapter_input.key}`",
    )


def _build_language_retry_prompt(prompt: str, language: str) -> str:
    """Add a focused retry instruction after a mixed/wrong-language response."""
    return (
        f"{prompt}\n\n"
        f"Correction: rewrite every descriptive sentence and every UI-visible label "
        f"in `{language}`. Keep only official names, identifiers, URLs, abbreviations, "
        "and legal citations in their source form."
    )


def _read_system_prompt() -> str:
    """Read the shared output-plan system prompt."""
    return SYSTEM_PROMPT_FILE_PATH.read_text(encoding="utf-8").strip()


def _read_chapter_prompt(chapter_key: str) -> str:
    """Read the prompt template for one output-plan chapter."""
    prompt_path = CHAPTER_PROMPT_FILES[chapter_key]
    return prompt_path.read_text(encoding="utf-8").strip()
