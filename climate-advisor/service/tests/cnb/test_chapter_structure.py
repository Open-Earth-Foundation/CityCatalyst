"""Regression coverage for chapter structure guards, persistence and chat acceptance."""

from __future__ import annotations

import asyncio
import json
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from agents.tool_context import ToolContext
from app.db.cnb import CnbBase
from app.models.cnb.concept_note_edits import (
    EditApplyRequest,
    EditPlanOutput,
    EditProposalRequest,
)
from app.models.cnb.concept_note_structure import (
    StructureChapter,
    StructureProposal,
    StructureSaveRequest,
    StructureState,
)
from app.models.db import cnb_reference  # noqa: F401
from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterRevision,
    ConceptNoteGap,
)
from app.persistence.concept_notes.edits import (
    ConceptNoteEditRepository,
    EditOperationError,
    lock_run,
)
from app.persistence.concept_notes.structure import (
    save_structure,
    structure_snapshot,
    validate_structure,
)
from app.persistence.concept_notes.workspace import (
    ConceptNoteWorkspaceRepository,
    WorkspaceTemplateChapter,
)
from app.services.cnb.edit_session import DraftEditSession
from app.services.cnb.edits import ConceptNoteEditService
from app.tools.concept_note_draft_tools import build_draft_tools
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


def test_all_titles_editable_but_template_identity_and_removal_protected():
    chapter = StructureChapter(
        chapter_id=uuid4(),
        template_section_id="summary",
        required=True,
        title="Summary",
    )
    validate_structure(
        [chapter],
        [
            chapter.model_copy(
                update={"title": "Renamed", "description": "New guidance"}
            )
        ],
    )
    for after in [
        [],
        [chapter.model_copy(update={"required": False})],
        [StructureChapter(chapter_id=uuid4(), title="Other")],
    ]:
        with pytest.raises(EditOperationError):
            validate_structure([chapter], after)
    with pytest.raises(ValidationError):
        StructureChapter(chapter_id=uuid4(), title="   ")
    with pytest.raises(ValidationError):
        StructureChapter(chapter_id=uuid4(), title="First\nSecond")


@pytest.fixture
async def workspace() -> AsyncIterator[
    tuple[ConceptNoteWorkspaceRepository, async_sessionmaker[AsyncSession], UUID]
]:
    url = os.getenv("CNB_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Requires an isolated CNB_TEST_DATABASE_URL")
    schema = f"structure_test_{uuid4().hex}"
    engine = create_async_engine(
        url.replace("postgresql://", "postgresql+asyncpg://"),
        connect_args={"server_settings": {"search_path": f"{schema},public"}},
        execution_options={"schema_translate_map": {None: schema}},
    )
    async with engine.begin() as connection:
        await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        await connection.execute(
            text("CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public")
        )
        await connection.run_sync(CnbBase.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    repository = ConceptNoteWorkspaceRepository(sessions)
    run_id = uuid4()
    await repository.ensure_template_chapters(
        run_id=run_id,
        chapters=[
            WorkspaceTemplateChapter(
                chapter_ref="summary",
                title="Summary",
                description="Summary guidance",
                required=True,
            ),
            WorkspaceTemplateChapter(
                chapter_ref="budget",
                title="Budget",
                description="Budget guidance",
                required=False,
            ),
        ],
    )
    chapters = await repository.list_chapters(run_id=run_id)
    for chapter in chapters:
        await repository.save_generated_chapter(
            chapter_id=chapter.chapter_id,
            body_markdown=f"## {chapter.title}\n\nOriginal content for {chapter.title}.",
            missing_information=[],
        )
    try:
        yield repository, sessions, run_id
    finally:
        async with engine.begin() as connection:
            await connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        await engine.dispose()


async def apply_direct(
    sessions: async_sessionmaker[AsyncSession],
    run_id: UUID,
    request: StructureSaveRequest,
) -> StructureState:
    async with sessions() as session, session.begin():
        await lock_run(session, run_id)
        return await save_structure(session, run_id, request)


async def test_real_save_reload_preserves_identity_content_gaps_and_duplicate(
    workspace,
):
    repository, sessions, run_id = workspace
    chapters = await repository.list_chapters(run_id=run_id)
    first_id = chapters[0].chapter_id
    gap_id = uuid4()
    async with sessions() as session, session.begin():
        session.add(
            ConceptNoteGap(
                gap_id=gap_id,
                run_id=run_id,
                chapter_id=first_id,
                field_key="cost",
                question="Cost?",
                why_asking="Need cost",
                severity="noncritical",
            )
        )
    before = structure_snapshot(chapters)
    custom = StructureChapter(
        chapter_id=uuid4(), title="Community", description="Discuss engagement"
    )
    after = [
        before.chapters[1],
        before.chapters[0].model_copy(
            update={"title": "Overview", "description": "New summary guidance"}
        ),
        custom,
    ]
    saved = await apply_direct(
        sessions,
        run_id,
        StructureSaveRequest(expected_fingerprint=before.fingerprint, chapters=after),
    )
    reloaded = await repository.list_chapters(run_id=run_id)
    assert structure_snapshot(reloaded) == saved
    assert [c.chapter_id for c in reloaded] == [c.chapter_id for c in after]
    renamed = reloaded[1]
    assert renamed.body_markdown == "## Overview\n\nOriginal content for Summary."
    assert renamed.revision_number == 2
    assert renamed.description == "New summary guidance"
    assert renamed.status == "needs_review"
    assert renamed.gaps[0].gap_id == gap_id
    assert reloaded[0].revision_number == 1
    # A custom chapter is soft-deleted without deleting its historical content.
    await apply_direct(
        sessions,
        run_id,
        StructureSaveRequest(
            expected_fingerprint=saved.fingerprint, chapters=after[:-1]
        ),
    )
    async with sessions() as session:
        assert (
            await session.get(ConceptNoteChapter, custom.chapter_id)
        ).status == "deleted"
    destination = uuid4()
    try:
        await repository.copy_working_copy(
            source_run_id=run_id, destination_run_id=destination
        )
        copied = await repository.list_chapters(run_id=destination)
        assert [c.title for c in copied] == ["Budget", "Overview"]
        assert copied[1].description == renamed.description
        assert copied[1].body_markdown == renamed.body_markdown
    finally:
        await repository.delete_run(run_id=destination)


async def test_two_writers_reject_stale_save_and_rollback_protected_removal(workspace):
    repository, sessions, run_id = workspace
    before = structure_snapshot(await repository.list_chapters(run_id=run_id))
    requests = [
        StructureSaveRequest(
            expected_fingerprint=before.fingerprint,
            chapters=[
                before.chapters[0].model_copy(update={"title": title}),
                before.chapters[1],
            ],
        )
        for title in ["First", "Second"]
    ]
    results = await asyncio.gather(
        *(apply_direct(sessions, run_id, request) for request in requests),
        return_exceptions=True,
    )
    assert (
        sum(
            isinstance(result, EditOperationError) and result.code == "stale_structure"
            for result in results
        )
        == 1
    )
    current = structure_snapshot(await repository.list_chapters(run_id=run_id))
    with pytest.raises(EditOperationError, match="cannot be removed"):
        await apply_direct(
            sessions,
            run_id,
            StructureSaveRequest(
                expected_fingerprint=current.fingerprint, chapters=[current.chapters[0]]
            ),
        )
    assert structure_snapshot(await repository.list_chapters(run_id=run_id)) == current


async def test_chat_preview_does_not_mutate_and_acceptance_replays_once(workspace):
    repository, sessions, run_id = workspace
    before = structure_snapshot(await repository.list_chapters(run_id=run_id))
    after = [
        before.chapters[1],
        before.chapters[0].model_copy(update={"title": "New summary"}),
    ]
    edits = ConceptNoteEditRepository(sessions)
    proposal, _ = await edits.start(
        run_id=run_id,
        user_id="owner",
        request=EditProposalRequest(
            instruction="Rename and reorder", idempotency_key=uuid4()
        ),
    )
    preview = await edits.finish(
        run_id=run_id,
        user_id="owner",
        proposal_id=proposal.proposal_id,
        base_revisions={},
        changes=[],
        structure=StructureProposal(before=before, after=after),
    )
    assert structure_snapshot(await repository.list_chapters(run_id=run_id)) == before
    assert (
        await edits.get(
            run_id=run_id, user_id="owner", proposal_id=proposal.proposal_id
        )
    ).structure == preview.structure
    with pytest.raises(EditOperationError):
        await edits.get(
            run_id=run_id, user_id="other", proposal_id=proposal.proposal_id
        )
    request = EditApplyRequest(idempotency_key=uuid4(), expected_revisions={})
    applied = await edits.apply(
        run_id=run_id,
        user_id="owner",
        proposal_id=proposal.proposal_id,
        request=request,
    )
    assert applied.status == "applied"
    assert (
        await edits.apply(
            run_id=run_id,
            user_id="owner",
            proposal_id=proposal.proposal_id,
            request=request,
        )
        == applied
    )
    current = await repository.list_chapters(run_id=run_id)
    assert [c.title for c in current] == ["Budget", "New summary"]
    assert current[1].revision_number == 2


async def test_chat_proposal_cannot_apply_after_content_changes(workspace):
    repository, sessions, run_id = workspace
    before = structure_snapshot(await repository.list_chapters(run_id=run_id))
    edits = ConceptNoteEditRepository(sessions)
    proposal, _ = await edits.start(
        run_id=run_id,
        user_id="owner",
        request=EditProposalRequest(instruction="Reorder", idempotency_key=uuid4()),
    )
    await edits.finish(
        run_id=run_id,
        user_id="owner",
        proposal_id=proposal.proposal_id,
        base_revisions={},
        changes=[],
        structure=StructureProposal(
            before=before, after=list(reversed(before.chapters))
        ),
    )
    async with sessions() as session, session.begin():
        session.add(
            ConceptNoteChapterRevision(
                chapter_id=before.chapters[0].chapter_id,
                revision_number=2,
                author_type="user",
                change_type="edit_text",
                body_markdown="New body",
            )
        )
    with pytest.raises(EditOperationError) as error:
        await edits.apply(
            run_id=run_id,
            user_id="owner",
            proposal_id=proposal.proposal_id,
            request=EditApplyRequest(idempotency_key=uuid4(), expected_revisions={}),
        )
    assert error.value.code == "stale_structure"
    assert (await repository.list_chapters(run_id=run_id))[
        0
    ].body_markdown == "New body"


async def test_agent_structural_tool_uses_server_ids_and_rejects_template_deletion(
    workspace,
):
    repository, _, run_id = workspace
    chapters = await repository.list_chapters(run_id=run_id)
    session = DraftEditSession(
        EditProposalRequest(instruction="Rename Summary", idempotency_key=uuid4()),
        chapters,
        {},
        [],
    )
    tool = next(
        tool
        for tool in build_draft_tools(session, {})
        if tool.name == "propose_structure"
    )
    context = ToolContext(
        context=None,
        tool_name="propose_structure",
        tool_call_id="structure",
        tool_arguments="{}",
    )
    items = [
        {
            "chapter_position": c.position,
            "title": "Overview" if c.position == 0 else c.title,
            "description": c.description,
        }
        for c in chapters
    ]
    response = await tool.on_invoke_tool(context, json.dumps({"chapters": items}))
    assert response["ok"] is True
    assert session.plan.structure.after[0].chapter_id == chapters[0].chapter_id
    assert (await repository.list_chapters(run_id=run_id))[0].title == "Summary"
    response = await tool.on_invoke_tool(context, json.dumps({"chapters": items[:1]}))
    assert response["ok"] is False
    assert "cannot be removed" in response["message"]
    assert session.plan is None


async def test_existing_template_description_initializes_once_and_clear_persists(
    workspace,
):
    repository, sessions, run_id = workspace
    chapters = await repository.list_chapters(run_id=run_id)
    async with sessions() as session, session.begin():
        row = await session.get(ConceptNoteChapter, chapters[0].chapter_id)
        row.description = None
    template = [
        WorkspaceTemplateChapter(
            chapter_ref="summary",
            title="Original template title",
            description="Original template guidance",
            required=True,
        )
    ]
    await repository.ensure_template_chapters(run_id=run_id, chapters=template)
    current = structure_snapshot(await repository.list_chapters(run_id=run_id))
    assert current.chapters[0].title == "Summary"
    assert current.chapters[0].description == "Original template guidance"
    await apply_direct(
        sessions,
        run_id,
        StructureSaveRequest(
            expected_fingerprint=current.fingerprint,
            chapters=[
                current.chapters[0].model_copy(update={"description": ""}),
                current.chapters[1],
            ],
        ),
    )
    await repository.ensure_template_chapters(run_id=run_id, chapters=template)
    assert (await repository.list_chapters(run_id=run_id))[0].description == ""


async def test_description_changes_invalidate_validation_but_keep_body(workspace):
    repository, sessions, run_id = workspace
    chapters = await repository.list_chapters(run_id=run_id)
    original = chapters[0]
    before = await repository.load_validation_context(
        run_id=run_id, chapter_id=original.chapter_id, template_fingerprint="a" * 64
    )
    state = structure_snapshot(chapters)
    await apply_direct(
        sessions,
        run_id,
        StructureSaveRequest(
            expected_fingerprint=state.fingerprint,
            chapters=[
                state.chapters[0].model_copy(
                    update={"description": "Changed requirements"}
                ),
                state.chapters[1],
            ],
        ),
    )
    after = await repository.load_validation_context(
        run_id=run_id, chapter_id=original.chapter_id, template_fingerprint="a" * 64
    )
    assert before.fingerprint != after.fingerprint
    current = (await repository.list_chapters(run_id=run_id))[0]
    assert current.body_markdown == original.body_markdown
    assert current.revision_number == original.revision_number
    assert current.status == "needs_review"


async def test_structural_refinement_replaces_prior_preview_without_applying(workspace):
    workspace_repo, sessions, run_id = workspace
    before = structure_snapshot(await workspace_repo.list_chapters(run_id=run_id))
    repository = ConceptNoteEditRepository(sessions)
    old, _ = await repository.start(
        run_id=run_id,
        user_id="owner",
        request=EditProposalRequest(instruction="Reorder", idempotency_key=uuid4()),
    )
    await repository.finish(
        run_id=run_id,
        user_id="owner",
        proposal_id=old.proposal_id,
        base_revisions={},
        changes=[],
        structure=StructureProposal(
            before=before, after=list(reversed(before.chapters))
        ),
    )
    after = [
        before.chapters[1],
        before.chapters[0].model_copy(update={"title": "Refined overview"}),
    ]
    planner = SimpleNamespace(
        plan=AsyncMock(
            return_value=EditPlanOutput(
                intent="edit", structure=StructureProposal(before=before, after=after)
            )
        )
    )
    service = ConceptNoteEditService(
        repository, workspace_repo, planner, workflow_sessions=None
    )

    @asynccontextmanager
    async def context(
        run: SimpleNamespace,
    ) -> AsyncIterator[tuple[SimpleNamespace, dict[str, object]]]:
        yield run, {}

    service.locked_context = context
    request = EditProposalRequest(
        instruction="Also rename the summary",
        idempotency_key=uuid4(),
        refines_proposal_id=old.proposal_id,
    )
    result = await service._propose(
        SimpleNamespace(run_id=run_id, user_id="owner"), request, recent_messages=None
    )
    assert result.structure.after == after
    assert result.status == "proposed"
    assert (
        await repository.get(
            run_id=run_id, user_id="owner", proposal_id=old.proposal_id
        )
    ).status == "rejected"
    assert (
        structure_snapshot(await workspace_repo.list_chapters(run_id=run_id)) == before
    )


@pytest.mark.parametrize(
    "body,expected",
    [
        ("## Summary\r\n\r\nParagraph", "## Renamed\r\n\r\nParagraph"),
        ("```markdown\n## Summary\n```", "```markdown\n## Summary\n```"),
    ],
)
async def test_rename_changes_only_the_leading_chapter_heading(
    workspace, body, expected
):
    repository, sessions, run_id = workspace
    chapter = (await repository.list_chapters(run_id=run_id))[0]
    async with sessions() as session, session.begin():
        session.add(
            ConceptNoteChapterRevision(
                chapter_id=chapter.chapter_id,
                revision_number=2,
                author_type="user",
                change_type="edit_text",
                body_markdown=body,
            )
        )
    state = structure_snapshot(await repository.list_chapters(run_id=run_id))
    await apply_direct(
        sessions,
        run_id,
        StructureSaveRequest(
            expected_fingerprint=state.fingerprint,
            chapters=[
                state.chapters[0].model_copy(update={"title": "Renamed"}),
                state.chapters[1],
            ],
        ),
    )
    assert (await repository.list_chapters(run_id=run_id))[0].body_markdown == expected
