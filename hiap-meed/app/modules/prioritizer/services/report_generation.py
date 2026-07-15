"""LLM-backed chapter generation for output-plan reports."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from pydantic import BaseModel, Field

from app.modules.prioritizer.llm_config import (
    get_output_plan_model,
    get_output_plan_temperature,
)
from app.modules.prioritizer.models import CityActionReportChapter
from app.modules.prioritizer.report_models import (
    ReportChapterDraft,
    ReportChapterInput,
    ReportGenerationResult,
)
from app.services.openai_client import create_openai_client

logger = logging.getLogger(__name__)

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

    markdown: str
    source_refs: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


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
    chapters: list[CityActionReportChapter] = []
    llm_calls: list[dict[str, object]] = []

    for chapter_input in chapter_inputs:
        # Build one isolated prompt per chapter to avoid context bleed.
        prompt = _build_chapter_prompt(chapter_input)
        logger.info(
            "Calling output-plan LLM API chapter=%s model=%s",
            chapter_input.key,
            model_name,
        )
        completion = client.chat.completions.parse(
            model=model_name,
            temperature=get_output_plan_temperature(),
            response_format=OutputPlanChapterResponse,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
        )
        parsed = completion.choices[0].message.parsed
        if parsed is None:
            raise ValueError(
                f"LLM did not return parsable output for chapter `{chapter_input.key}`"
            )
        draft = ReportChapterDraft(
            key=chapter_input.key,
            title=chapter_input.title,
            markdown=parsed.markdown,
            source_refs=parsed.source_refs,
            limitations=parsed.limitations,
        )
        chapters.append(_to_response_chapter(draft))
        llm_calls.append(
            {
                "chapter": chapter_input.key,
                "model": model_name,
                "prompt_text": prompt,
                "parsed": draft.model_dump(mode="json"),
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
) -> CityActionReportChapter:
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
    return CityActionReportChapter(
        key=chapter_input.key,
        title=chapter_input.title,
        markdown=markdown,
        source_refs=chapter_input.source_refs,
        limitations=list(dict.fromkeys(limitations)),
    )


def _to_response_chapter(draft: ReportChapterDraft) -> CityActionReportChapter:
    """Convert an internal chapter draft to the public response model."""
    return CityActionReportChapter(
        key=draft.key,
        title=draft.title,
        markdown=draft.markdown,
        source_refs=draft.source_refs,
        limitations=draft.limitations,
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


def _read_system_prompt() -> str:
    """Read the shared output-plan system prompt."""
    return SYSTEM_PROMPT_FILE_PATH.read_text(encoding="utf-8").strip()


def _read_chapter_prompt(chapter_key: str) -> str:
    """Read the prompt template for one output-plan chapter."""
    prompt_path = CHAPTER_PROMPT_FILES[chapter_key]
    return prompt_path.read_text(encoding="utf-8").strip()
