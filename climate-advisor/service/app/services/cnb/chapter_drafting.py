"""Independent, sequential chapter drafting for Concept Note Builder runs."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from agents import Agent, ModelSettings, OpenAIChatCompletionsModel, Runner
from app.config import Settings, get_settings
from app.db.cnb_reference import get_cnb_reference_session_factory
from app.db.session import get_session_factory
from app.models.cnb.concept_note_application_context import (
    ApplicationContextIncludedSources,
    ConceptNoteApplicationContextResponse,
)
from app.models.cnb.concept_note_draft import (
    ConceptNoteChapterDraftOutput,
    ConceptNoteDraftChapterResponse,
    ConceptNoteDraftResponse,
)
from app.models.db.concept_note import (
    ConceptNoteContextBundle as ConceptNoteContextBundleRow,
)
from app.models.db.concept_note import ConceptNoteRun
from app.persistence.concept_notes.context_bundle import normalize_bundle
from app.persistence.concept_notes.workspace import (
    ConceptNoteWorkspaceRepository,
    WorkspaceChapterSnapshot,
    WorkspaceTemplateChapter,
    normalize_template_chapters,
)
from app.services.cnb.application_context import (
    ConceptNoteApplicationContextService,
    included_sources_from_bundle,
)
from app.services.openrouter_client import build_openrouter_client_options
from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

logger = logging.getLogger(__name__)
ChapterGenerator = Callable[
    [dict[str, Any]], Awaitable[ConceptNoteChapterDraftOutput]
]
_BACKGROUND_DRAFTS: set[asyncio.Task[None]] = set()
CHAPTER_DRAFT_RECONCILE_INTERVAL_SECONDS = 300
CHAPTER_DRAFT_STALE_AFTER = timedelta(hours=1)


class ChapterDraftingError(Exception):
    """Stable internal failure raised by the dedicated drafting workflow."""

    code = "chapter_drafting_conflict"
    status_code = 409


class ChapterDraftingTemplateError(ChapterDraftingError):
    """The selected application template cannot seed a drafting workspace."""

    code = "concept_note_template_invalid"
    status_code = 422


class ChapterDraftingRunUnavailableError(ChapterDraftingError):
    """The requested drafting run is missing or is not owned by the caller."""

    code = "concept_note_run_unavailable"
    status_code = 404


class ConceptNoteChapterDraftService:
    """Materialize a template and generate all missing chapters in order."""

    def __init__(
        self,
        ca_session_factory: async_sessionmaker[AsyncSession],
        *,
        cnb_session_factory: async_sessionmaker[AsyncSession] | None = None,
        settings: Settings | None = None,
        generate_chapter: ChapterGenerator | None = None,
        runner: Any = Runner,
    ) -> None:
        self._ca_session_factory = ca_session_factory
        self._cnb_session_factory = (
            cnb_session_factory or get_cnb_reference_session_factory()
        )
        self._workspace = ConceptNoteWorkspaceRepository(self._cnb_session_factory)
        self._application_context = ConceptNoteApplicationContextService(
            session_factory=self._cnb_session_factory
        )
        self._settings = settings or get_settings()
        self._generate_chapter_override = generate_chapter
        self._runner = runner

    async def load_state(self, run: ConceptNoteRun) -> ConceptNoteDraftResponse:
        """Return persisted chapter state without starting generation."""
        chapters = await self._workspace.list_chapters(run_id=run.run_id)
        return _build_state_response(
            run_id=run.run_id,
            progress=_draft_progress(run.context_summary),
            chapters=chapters,
        )

    async def start(
        self,
        run: ConceptNoteRun,
    ) -> tuple[ConceptNoteDraftResponse, UUID | None]:
        """Materialize chapters and acquire a new resumable drafting lease."""
        _, included_sources = await self._load_run_context(run.run_id, run.user_id)
        application_context = await self._application_context.load_for_run(
            run,
            included_sources=included_sources,
        )
        template_chapters = _require_template(application_context)
        await self._workspace.ensure_template_chapters(
            run_id=run.run_id,
            chapters=template_chapters,
        )
        chapters = await self._workspace.list_chapters(run_id=run.run_id)
        build_id = await self._begin_draft(
            run_id=run.run_id,
            user_id=run.user_id,
            chapters=chapters,
        )
        progress = await self._load_progress(run.run_id, run.user_id)
        return (
            _build_state_response(
                run_id=run.run_id,
                progress=progress,
                chapters=chapters,
            ),
            build_id,
        )

    async def draft_all(
        self,
        *,
        run_id: UUID,
        user_id: str,
        build_id: UUID,
    ) -> None:
        """Generate every missing chapter, persisting each before continuing."""
        try:
            run = await self._load_owned_run(run_id, user_id)
            run_context, included_sources = await self._load_run_context(
                run_id,
                user_id,
            )
            application_context = await self._application_context.load_for_run(
                run,
                included_sources=included_sources,
            )
            template_chapters = _require_template(application_context)
            template_by_ref = {
                chapter.chapter_ref: chapter for chapter in template_chapters
            }
            while await self._lease_is_active(run_id, user_id, build_id):
                chapters = await self._workspace.list_chapters(run_id=run_id)
                current = next(
                    (chapter for chapter in chapters if chapter.body_markdown is None),
                    None,
                )
                if current is None:
                    await self._complete_draft(run_id, user_id, build_id, chapters)
                    return

                if not await self._mark_current_chapter(
                    run_id,
                    user_id,
                    build_id,
                    current,
                    chapters,
                ):
                    return

                generated = await self._generate_chapter(
                    _build_chapter_input(
                        application_context=application_context,
                        run_context=run_context,
                        current=current,
                        template_chapter=template_by_ref.get(
                            current.chapter_ref or ""
                        ),
                        chapters=chapters,
                    )
                )

                # A newer start/resume request supersedes this worker.
                if not await self._lease_is_active(run_id, user_id, build_id):
                    return
                await self._workspace.save_generated_chapter(
                    chapter_id=current.chapter_id,
                    body_markdown=generated.body_markdown,
                    missing_information=[
                        item.strip()
                        for item in generated.missing_information
                        if item.strip()
                    ],
                )
                refreshed = await self._workspace.list_chapters(run_id=run_id)
                if not await self._record_completed_count(
                    run_id,
                    user_id,
                    build_id,
                    refreshed,
                ):
                    return
        except Exception:
            logger.exception(
                "Concept Note sequential drafting failed run_id=%s build_id=%s",
                run_id,
                build_id,
            )
            await self._fail_draft(run_id, user_id, build_id)

    async def _generate_chapter(
        self,
        payload: dict[str, Any],
    ) -> ConceptNoteChapterDraftOutput:
        if self._generate_chapter_override is not None:
            return await self._generate_chapter_override(payload)

        settings = self._settings
        model_config = (
            settings.llm.models.cnb_chapter_drafter
            or settings.llm.models.cnb_source_synthesizer
        )
        try:
            options = build_openrouter_client_options(
                settings,
                missing_api_key_message=(
                    "OpenRouter API key is required for Concept Note chapter drafting"
                ),
                error_cls=ChapterDraftingError,
            )
            client = AsyncOpenAI(**options.kwargs)
            agent = Agent(
                name="Concept Note chapter drafter",
                instructions=settings.llm.prompts.get_prompt(
                    "cnb_chapter_drafting"
                ),
                model=OpenAIChatCompletionsModel(
                    model=model_config.name,
                    openai_client=client,
                ),
                model_settings=ModelSettings(
                    temperature=0.0,
                    include_usage=True,
                    reasoning={"effort": model_config.reasoning_effort},
                ),
                output_type=ConceptNoteChapterDraftOutput,
                tools=[],
            )
            try:
                result = await self._runner.run(
                    agent,
                    json.dumps(payload, ensure_ascii=False),
                )
                return ConceptNoteChapterDraftOutput.model_validate(
                    result.final_output
                )
            finally:
                await client.close()
        except ChapterDraftingError:
            raise
        except Exception as exc:
            raise ChapterDraftingError("Chapter generation failed") from exc

    async def _begin_draft(
        self,
        *,
        run_id: UUID,
        user_id: str,
        chapters: list[WorkspaceChapterSnapshot],
    ) -> UUID | None:
        completed = _completed_count(chapters)
        async with self._ca_session_factory() as session, session.begin():
            run = await _require_owned_run(session, run_id, user_id, lock=True)
            if chapters and completed == len(chapters):
                run.workflow_step = "editing_document"
                run.context_summary = _replace_draft_progress(
                    run.context_summary,
                    {
                        "status": "complete",
                        "build_id": None,
                        "current_chapter_id": None,
                        "completed_chapters": completed,
                        "total_chapters": len(chapters),
                        "error_code": None,
                    },
                )
                return None

            build_id = uuid4()
            run.workflow_step = "drafting_document"
            run.context_summary = _replace_draft_progress(
                run.context_summary,
                {
                    "status": "running",
                    "build_id": str(build_id),
                    "current_chapter_id": None,
                    "completed_chapters": completed,
                    "total_chapters": len(chapters),
                    "error_code": None,
                    "started_at": datetime.now(UTC).isoformat(),
                },
            )
            return build_id

    async def _load_owned_run(self, run_id: UUID, user_id: str) -> ConceptNoteRun:
        async with self._ca_session_factory() as session:
            return await _require_owned_run(session, run_id, user_id)

    async def _load_progress(self, run_id: UUID, user_id: str) -> dict[str, Any]:
        run = await self._load_owned_run(run_id, user_id)
        return _draft_progress(run.context_summary)

    async def _load_run_context(
        self,
        run_id: UUID,
        user_id: str,
    ) -> tuple[dict[str, Any], ApplicationContextIncludedSources]:
        """Snapshot the persisted run and complete source-aware bundle."""
        async with self._ca_session_factory() as session:
            run = await _require_owned_run(session, run_id, user_id)
            bundle_row = await session.get(ConceptNoteContextBundleRow, run_id)
            bundle = normalize_bundle(
                bundle_row.context_bundle if bundle_row is not None else None
            )
            run_context = {
                "run": {
                    "run_id": str(run.run_id),
                    "name": run.name,
                    "city_id": run.city_id,
                    "project_id": run.project_id,
                },
                "context_bundle_status": (
                    run.context_summary.get("context_bundle", {})
                    if isinstance(run.context_summary, dict)
                    else {}
                ),
                "context_bundle": bundle.model_dump(mode="json"),
            }
            return run_context, included_sources_from_bundle(bundle)

    async def _lease_is_active(
        self,
        run_id: UUID,
        user_id: str,
        build_id: UUID,
    ) -> bool:
        progress = await self._load_progress(run_id, user_id)
        return progress.get("status") == "running" and progress.get(
            "build_id"
        ) == str(build_id)

    async def _mark_current_chapter(
        self,
        run_id: UUID,
        user_id: str,
        build_id: UUID,
        current: WorkspaceChapterSnapshot,
        chapters: list[WorkspaceChapterSnapshot],
    ) -> bool:
        return await self._update_progress(
            run_id,
            user_id,
            build_id,
            {
                "current_chapter_id": str(current.chapter_id),
                "completed_chapters": _completed_count(chapters),
                "total_chapters": len(chapters),
            },
        )

    async def _record_completed_count(
        self,
        run_id: UUID,
        user_id: str,
        build_id: UUID,
        chapters: list[WorkspaceChapterSnapshot],
    ) -> bool:
        return await self._update_progress(
            run_id,
            user_id,
            build_id,
            {
                "current_chapter_id": None,
                "completed_chapters": _completed_count(chapters),
                "total_chapters": len(chapters),
            },
        )

    async def _update_progress(
        self,
        run_id: UUID,
        user_id: str,
        build_id: UUID,
        updates: dict[str, Any],
    ) -> bool:
        async with self._ca_session_factory() as session, session.begin():
            run = await _require_owned_run(session, run_id, user_id, lock=True)
            progress = _draft_progress(run.context_summary)
            if progress.get("status") != "running" or progress.get(
                "build_id"
            ) != str(build_id):
                return False
            run.context_summary = _replace_draft_progress(
                run.context_summary,
                {**progress, **updates},
            )
            return True

    async def _complete_draft(
        self,
        run_id: UUID,
        user_id: str,
        build_id: UUID,
        chapters: list[WorkspaceChapterSnapshot],
    ) -> None:
        async with self._ca_session_factory() as session, session.begin():
            run = await _require_owned_run(session, run_id, user_id, lock=True)
            progress = _draft_progress(run.context_summary)
            if progress.get("build_id") != str(build_id):
                return
            run.workflow_step = "editing_document"
            run.context_summary = _replace_draft_progress(
                run.context_summary,
                {
                    **progress,
                    "status": "complete",
                    "current_chapter_id": None,
                    "completed_chapters": _completed_count(chapters),
                    "total_chapters": len(chapters),
                    "error_code": None,
                    "completed_at": datetime.now(UTC).isoformat(),
                },
            )

    async def _fail_draft(
        self,
        run_id: UUID,
        user_id: str,
        build_id: UUID,
    ) -> None:
        try:
            async with self._ca_session_factory() as session, session.begin():
                run = await _require_owned_run(session, run_id, user_id, lock=True)
                progress = _draft_progress(run.context_summary)
                if progress.get("build_id") != str(build_id):
                    return
                run.context_summary = _replace_draft_progress(
                    run.context_summary,
                    {
                        **progress,
                        "status": "failed",
                        "error_code": "chapter_generation_failed",
                    },
                )
        except Exception:
            logger.exception(
                "Failed to persist Concept Note drafting failure run_id=%s",
                run_id,
            )


def schedule_chapter_drafting(
    *,
    service: ConceptNoteChapterDraftService,
    run_id: UUID,
    user_id: str,
    build_id: UUID,
) -> None:
    """Retain one background sequential drafting process until it terminates."""
    task = asyncio.create_task(
        service.draft_all(
            run_id=run_id,
            user_id=user_id,
            build_id=build_id,
        )
    )
    _BACKGROUND_DRAFTS.add(task)

    def release(completed: asyncio.Task[None]) -> None:
        _BACKGROUND_DRAFTS.discard(completed)
        try:
            completed.result()
        except Exception:
            logger.exception("Concept Note background drafting task crashed")

    task.add_done_callback(release)


async def recover_stale_drafts(
    *,
    session_factory: async_sessionmaker[AsyncSession],
    stale_before: datetime,
) -> int:
    """Mark interrupted chapter-drafting leases retryable after their cutoff."""
    async with session_factory() as session, session.begin():
        query = (
            select(ConceptNoteRun)
            .where(
                ConceptNoteRun.status == "active",
                ConceptNoteRun.updated_at < stale_before,
                (
                    ConceptNoteRun.context_summary["draft_document"][
                        "status"
                    ].as_string()
                    == "running"
                ),
            )
            .with_for_update(skip_locked=True)
        )
        runs = list((await session.scalars(query)).all())
        recovered_at = datetime.now(UTC)
        recovered = 0
        for run in runs:
            progress = _draft_progress(run.context_summary)
            if progress.get("status") != "running":
                continue
            run.context_summary = _replace_draft_progress(
                run.context_summary,
                {
                    **progress,
                    "status": "failed",
                    "current_chapter_id": None,
                    "error_code": "chapter_drafting_interrupted",
                    "retryable": True,
                },
            )
            run.updated_at = recovered_at
            recovered += 1
        return recovered


async def run_chapter_drafting_reconciler(
    *,
    interval_seconds: float = CHAPTER_DRAFT_RECONCILE_INTERVAL_SECONDS,
    stale_after: timedelta = CHAPTER_DRAFT_STALE_AFTER,
) -> None:
    """Periodically make interrupted chapter-drafting leases retryable."""
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            recovered = await recover_stale_drafts(
                session_factory=get_session_factory(),
                stale_before=datetime.now(UTC) - stale_after,
            )
            if recovered:
                logger.warning(
                    "Recovered %s interrupted Concept Note chapter drafts",
                    recovered,
                )
        except Exception:
            logger.exception("Concept Note chapter-drafting reconciliation failed")


def get_chapter_draft_service() -> ConceptNoteChapterDraftService | None:
    """Provide the drafting service, or an unavailable marker without storage."""
    try:
        return ConceptNoteChapterDraftService(get_session_factory())
    except Exception:
        logger.exception("Concept Note chapter drafting is unavailable")
        return None


async def _require_owned_run(
    session: AsyncSession,
    run_id: UUID,
    user_id: str,
    *,
    lock: bool = False,
) -> ConceptNoteRun:
    statement = select(ConceptNoteRun).where(ConceptNoteRun.run_id == run_id)
    if lock:
        statement = statement.with_for_update()
    run = await session.scalar(statement)
    if run is None or run.user_id != user_id:
        raise ChapterDraftingRunUnavailableError("Concept Note run is unavailable")
    return run


def _require_template(
    application_context: ConceptNoteApplicationContextResponse,
) -> list[WorkspaceTemplateChapter]:
    if application_context.template is None:
        raise ChapterDraftingTemplateError(
            "A selected application template is required"
        )
    try:
        chapters = normalize_template_chapters(
            application_context.template.chapter_schema
        )
    except ValueError as exc:
        raise ChapterDraftingTemplateError("The selected template is invalid") from exc
    if not chapters:
        raise ChapterDraftingTemplateError("The selected template has no chapters")
    return chapters


def _build_chapter_input(
    *,
    application_context: ConceptNoteApplicationContextResponse,
    run_context: dict[str, Any],
    current: WorkspaceChapterSnapshot,
    template_chapter: WorkspaceTemplateChapter | None,
    chapters: list[WorkspaceChapterSnapshot],
) -> dict[str, Any]:
    """Build the exact prompt payload, including every earlier chapter body."""
    return {
        "application_context": application_context.model_dump(mode="json"),
        "run_context": run_context,
        "chapter": {
            "chapter_ref": current.chapter_ref,
            "title": current.title,
            "description": (
                template_chapter.description if template_chapter is not None else None
            ),
            "position": current.position,
            "required": current.required,
        },
        "previous_chapters": [
            {
                "chapter_ref": chapter.chapter_ref,
                "title": chapter.title,
                "body_markdown": chapter.body_markdown,
            }
            for chapter in chapters
            if chapter.position < current.position
            and chapter.body_markdown is not None
        ],
    }


def _build_state_response(
    *,
    run_id: UUID,
    progress: dict[str, Any],
    chapters: list[WorkspaceChapterSnapshot],
) -> ConceptNoteDraftResponse:
    completed = _completed_count(chapters)
    stored_status = progress.get("status")
    if stored_status in {"running", "failed", "complete"}:
        status = stored_status
    elif chapters and completed == len(chapters):
        status = "complete"
    else:
        status = "not_started"
    return ConceptNoteDraftResponse(
        run_id=run_id,
        status=status,
        completed_chapters=completed,
        total_chapters=len(chapters),
        current_chapter_id=_as_uuid(progress.get("current_chapter_id")),
        error_code=_as_text(progress.get("error_code")),
        chapters=[
            ConceptNoteDraftChapterResponse(
                chapter_id=chapter.chapter_id,
                template_section_id=chapter.chapter_ref,
                title=chapter.title,
                position=chapter.position,
                status=chapter.status,
                required=chapter.required,
                user_locked=chapter.user_locked,
                body_markdown=chapter.body_markdown,
                missing_information=chapter.missing_information,
                revision_number=chapter.revision_number,
            )
            for chapter in chapters
        ],
    )


def _completed_count(chapters: list[WorkspaceChapterSnapshot]) -> int:
    return sum(chapter.body_markdown is not None for chapter in chapters)


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


def _as_text(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _as_uuid(value: Any) -> UUID | None:
    try:
        return UUID(str(value)) if value else None
    except (TypeError, ValueError):
        return None
