"""Hidden first chat turn that summarises a finished Concept Note drafting pass.

The CNB frontend requests this turn once per drafting build. The service owns
the prompt and trigger text, so the client cannot inject instructions, and the
build claim on the run keeps the overview from being posted twice.
"""

from __future__ import annotations

import json
import logging
from typing import Any
from uuid import UUID

from app.models.cnb.concept_note_draft import ConceptNoteDraftResponse
from app.models.db.concept_note import ConceptNoteRun
from app.services.thread_service import ThreadService
from app.utils.concept_note_context import extract_concept_note_run_id
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config.settings import PromptsConfig

logger = logging.getLogger(__name__)

CONCEPT_NOTE_TURN_OPTION = "concept_note_turn"
DRAFT_OVERVIEW_TURN = "draft_overview"
DRAFT_OVERVIEW_REQUEST = "CONCEPT_NOTE_DRAFT_OVERVIEW_REQUEST"
DRAFT_OVERVIEW_JSON_MARKER = "CONCEPT_NOTE_DRAFT_OVERVIEW_JSON"
DRAFT_OVERVIEW_UNAVAILABLE = "concept_note_draft_overview_unavailable"
BODY_EXCERPT_CHARS = 2_500

_OVERVIEW_STATUSES = frozenset({"complete", "failed"})
_OPEN_GAP_STATES = frozenset({"open", "processing"})


def is_draft_overview_turn(options: Any) -> bool:
    """Return whether the request asks for the hidden drafting overview turn."""
    return (
        isinstance(options, dict)
        and options.get(CONCEPT_NOTE_TURN_OPTION) == DRAFT_OVERVIEW_TURN
    )


def overview_pending(progress: dict[str, Any]) -> bool:
    """Return whether a finished drafting build still needs its overview."""
    build_id = progress.get("build_id")
    return (
        progress.get("status") in _OVERVIEW_STATUSES
        and bool(build_id)
        and progress.get("overview_build_id") != build_id
    )


def draft_overview_instructions(prompts: PromptsConfig) -> str:
    """Compose the CNB chat instructions with the overview turn instructions."""
    return (
        f"{prompts.compose_prompt('cnb_chat')}\n\n"
        "<turn_instructions>\n"
        f"{prompts.get_prompt('cnb_draft_overview')}\n"
        "</turn_instructions>"
    )


async def claim_draft_overview(
    *,
    session_factory: async_sessionmaker[AsyncSession] | None,
    thread_id: str | UUID,
    user_id: str,
) -> tuple[UUID, str]:
    """Reserve the overview for the thread's current drafting build.

    Returns the run and claimed build identifiers. Raises 409 when the draft is
    still running, never ran, or already has its overview.
    """
    if session_factory is None:
        raise HTTPException(503, detail={"code": "cnb_storage_unavailable"})
    try:
        async with session_factory() as session, session.begin():
            thread = await ThreadService(session).get_thread_for_user(
                thread_id, user_id
            )
            run_id = extract_concept_note_run_id(thread.context)
            run = (
                await session.scalar(
                    select(ConceptNoteRun)
                    .where(ConceptNoteRun.run_id == UUID(run_id))
                    .with_for_update()
                )
                if run_id
                else None
            )
            if (
                run is None
                or run.user_id != user_id
                or run.thread_id != thread.thread_id
            ):
                raise _unavailable()
            progress = _draft_progress(run.context_summary)
            if not overview_pending(progress):
                raise _unavailable()
            build_id = str(progress["build_id"])
            run.context_summary = _replace_draft_progress(
                run.context_summary,
                {**progress, "overview_build_id": build_id},
            )
            return run.run_id, build_id
    except HTTPException:
        raise
    except (OSError, SQLAlchemyError, ValueError) as exc:
        logger.exception("Failed to claim Concept Note draft overview")
        raise HTTPException(503, detail={"code": "cnb_storage_unavailable"}) from exc


async def release_draft_overview(
    *,
    session_factory: async_sessionmaker[AsyncSession] | None,
    run_id: UUID,
    user_id: str,
    build_id: str,
) -> None:
    """Make a failed overview turn retryable if the build has not changed."""
    if session_factory is None:
        return
    try:
        async with session_factory() as session, session.begin():
            run = await session.scalar(
                select(ConceptNoteRun)
                .where(ConceptNoteRun.run_id == run_id)
                .with_for_update()
            )
            if run is None or run.user_id != user_id:
                return
            progress = _draft_progress(run.context_summary)
            if progress.get("overview_build_id") != build_id:
                return
            run.context_summary = _replace_draft_progress(
                run.context_summary,
                {**progress, "overview_build_id": None},
            )
    except Exception:
        logger.exception(
            "Failed to release Concept Note draft overview run_id=%s", run_id
        )


async def load_draft_overview_message(
    *,
    session_factory: async_sessionmaker[AsyncSession],
    run_id: UUID,
    user_id: str,
    ui_locale: str | None,
) -> dict[str, str]:
    """Load the persisted draft as the user-role runtime-data message."""
    # Imported here because chapter drafting imports this module.
    from app.services.cnb.chapter_drafting import get_chapter_draft_service

    service = get_chapter_draft_service()
    if service is None:
        raise RuntimeError("Concept Note chapter drafting is unavailable")
    async with session_factory() as session:
        run = await session.get(ConceptNoteRun, run_id)
    if run is None or run.user_id != user_id:
        raise RuntimeError("Concept Note run is unavailable")
    draft = await service.load_state(run)
    facts = build_draft_overview_facts(draft, ui_locale=ui_locale)
    return {
        "role": "user",
        "content": (
            f"{DRAFT_OVERVIEW_JSON_MARKER}\n{json.dumps(facts, ensure_ascii=False)}"
        ),
    }


def build_draft_overview_facts(
    draft: ConceptNoteDraftResponse,
    *,
    ui_locale: str | None,
) -> dict[str, Any]:
    """Build the model-facing draft facts without identifiers or gap keys."""
    return {
        "ui_locale": ui_locale,
        "draft_status": draft.status,
        "completed_chapters": draft.completed_chapters,
        "total_chapters": draft.total_chapters,
        "chapters": [
            {
                "title": chapter.title,
                "required": chapter.required,
                "drafted": chapter.body_markdown is not None,
                "body_excerpt": (
                    chapter.body_markdown[:BODY_EXCERPT_CHARS]
                    if chapter.body_markdown is not None
                    else None
                ),
                "body_truncated": len(chapter.body_markdown or "") > BODY_EXCERPT_CHARS,
                "open_gaps": [
                    {"question": gap.question, "severity": gap.severity}
                    for gap in chapter.gaps
                    if gap.state in _OPEN_GAP_STATES
                ],
            }
            for chapter in sorted(draft.chapters, key=lambda item: item.position)
        ],
    }


def _unavailable() -> HTTPException:
    return HTTPException(
        409,
        detail={
            "code": DRAFT_OVERVIEW_UNAVAILABLE,
            "message": "No finished Concept Note draft is waiting for an overview.",
        },
    )


def _draft_progress(summary: Any) -> dict[str, Any]:
    if not isinstance(summary, dict):
        return {}
    progress = summary.get("draft_document")
    return progress if isinstance(progress, dict) else {}


def _replace_draft_progress(summary: Any, progress: dict[str, Any]) -> dict[str, Any]:
    return {
        **(summary if isinstance(summary, dict) else {}),
        "draft_document": progress,
    }
