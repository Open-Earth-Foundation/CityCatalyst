"""Check a drafted chapter's claims against its inputs and correct unsupported ones.

One model call per chapter reviews the draft with the same messages the drafter
received. The model proposes replacements; Python applies only those that match
one exact passage, leave headings and existing markers untouched, and bring a
structured gap for every marker they add, so supported text never changes and
the draft keeps its marker/gap parity. A failed check keeps the draft as written.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from agents import Agent, ModelSettings, OpenAIChatCompletionsModel, Runner
from app.models.cnb.concept_note_draft import (
    ChapterSupportReview,
    ChapterSupportRevision,
    ConceptNoteChapterDraftOutput,
)
from app.services.openrouter_client import build_openrouter_client_options
from app.utils.cnb_information_markers import (
    INFORMATION_NEEDED_PATTERN,
    information_marker_key,
    information_needed_markers,
)
from openai import AsyncOpenAI

from app.config import Settings

logger = logging.getLogger(__name__)
DRAFT_MESSAGE_HEADER = "CONCEPT_NOTE_DRAFT"
_HEADING = re.compile(r"^#{1,6} ", re.MULTILINE)


class ChapterSupportCheckError(RuntimeError):
    """The support checker could not be configured or returned no valid review."""


async def check_chapter_support(
    messages: list[dict[str, str]],
    draft: ConceptNoteChapterDraftOutput,
    *,
    settings: Settings,
    runner: Any = Runner,
) -> tuple[ConceptNoteChapterDraftOutput, list[dict[str, Any]]]:
    """Return the corrected draft and a record of every proposed revision.

    ``messages`` are the drafter's input messages. Provider or output failures
    are logged and leave the draft unchanged rather than failing drafting.
    """
    try:
        review = await review_chapter_support(messages, draft, settings=settings, runner=runner)
    except ChapterSupportCheckError as exc:
        logger.warning("Concept Note support check unavailable error=%s", exc)
        return draft, []
    corrected, records = apply_support_review(draft, review)
    logger.info(
        "Concept Note support check revisions=%s applied=%s",
        len(records),
        sum(record["applied"] for record in records),
    )
    return corrected, records


async def review_chapter_support(
    messages: list[dict[str, str]],
    draft: ConceptNoteChapterDraftOutput,
    *,
    settings: Settings,
    runner: Any = Runner,
) -> ChapterSupportReview:
    """Ask the configured checker which draft passages the inputs do not support."""
    models = settings.llm.models
    model_config = models.cnb_chapter_support_checker or models.cnb_chapter_drafter
    if model_config is None:
        raise ChapterSupportCheckError("No support-checker model is configured")
    options = build_openrouter_client_options(
        settings,
        missing_api_key_message="OpenRouter API key is required for the support check",
        error_cls=ChapterSupportCheckError,
    )
    client = AsyncOpenAI(**options.kwargs)
    try:
        agent = Agent(
            name="Concept Note chapter support checker",
            instructions=settings.llm.prompts.get_prompt("cnb_chapter_support_check"),
            model=OpenAIChatCompletionsModel(model=model_config.name, openai_client=client),
            model_settings=ModelSettings(
                temperature=0.0,
                include_usage=True,
                reasoning={"effort": model_config.reasoning_effort},
            ),
            output_type=ChapterSupportReview,
            tools=[],
        )
        draft_message = {
            "role": "user",
            "content": f"{DRAFT_MESSAGE_HEADER}\n{draft.model_dump_json()}",
        }
        result = await runner.run(agent, [*messages, draft_message])
        return ChapterSupportReview.model_validate(result.final_output)
    except Exception as exc:
        raise ChapterSupportCheckError(type(exc).__name__) from exc
    finally:
        await client.close()


def apply_support_review(
    draft: ConceptNoteChapterDraftOutput, review: ChapterSupportReview
) -> tuple[ConceptNoteChapterDraftOutput, list[dict[str, Any]]]:
    """Apply every safe revision in order; record why any other was skipped."""
    body = draft.body_markdown
    gaps = list(draft.missing_information)
    used_keys = {gap.field_key for gap in gaps}
    offered = {information_marker_key(gap.question): gap for gap in review.gaps}
    records: list[dict[str, Any]] = []
    for revision in review.revisions:
        added = [offered.get(information_marker_key(m)) for m in information_needed_markers(revision.after)]
        problem = _revision_problem(body, revision, added, used_keys)
        records.append({**revision.model_dump(), "applied": problem is None, "skipped": problem})
        if problem is not None:
            continue
        body = body.replace(revision.before, revision.after, 1)
        gaps += [gap for gap in added if gap is not None]
        used_keys |= {gap.field_key for gap in added if gap is not None}
    corrected = draft.model_copy(update={"body_markdown": body, "missing_information": gaps})
    return corrected, records


def _revision_problem(
    body: str,
    revision: ChapterSupportRevision,
    added: list[Any],
    used_keys: set[str],
) -> str | None:
    """Why a revision cannot be applied safely, or None when it can."""
    if body.count(revision.before) != 1:
        return "passage not found exactly once"
    start = body.index(revision.before)
    end = start + len(revision.before)
    if any(start < m.end() and end > m.start() for m in INFORMATION_NEEDED_PATTERN.finditer(body)):
        return "touches an existing marker"
    if _HEADING.search(revision.before) or _HEADING.search(revision.after):
        return "touches a heading"
    if any(gap is None for gap in added):
        return "new marker without a structured gap"
    keys = [gap.field_key for gap in added]
    if len(set(keys)) != len(keys) or set(keys) & used_keys:
        return "gap key already used"
    return None

