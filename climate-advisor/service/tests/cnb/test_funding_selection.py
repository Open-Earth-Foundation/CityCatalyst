"""Database-backed funding browsing, persistence, and review invalidation contracts."""

import asyncio
from contextlib import asynccontextmanager
from functools import partial
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from app.models.cnb.concept_note_edits import (
    EditApplyRequest,
    EditPlanOutput,
    EditProposalRequest,
    PlannedTextChange,
)
from app.models.cnb.funding_catalogue import FundingSelectionRequest
from app.models.cnb.concept_note_structure import StructureChapter, StructureSaveRequest
from app.models.db.cnb_edit import ConceptNoteEditProposal
from app.models.db.cnb_reference import (
    CnbFunder,
    CnbFunderTemplate,
    CnbFundingOpportunity,
)
from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterRevision,
    ConceptNoteChapterValidation,
)
from app.models.db.concept_note import ConceptNoteContextBundle, ConceptNoteRun
from app.persistence.concept_notes.edits import (
    ConceptNoteEditRepository,
    EditOperationError,
)
from app.persistence.concept_notes.workspace import normalize_template_chapters
from app.persistence.concept_notes.structure import save_structure, structure_snapshot
from app.services.cnb.application_context import ConceptNoteApplicationContextService
from app.services.cnb.chapter_drafting import ConceptNoteChapterDraftService
from app.services.cnb.edits import ConceptNoteEditService
from app.services.cnb.funding_catalogue import load_funding_catalogue
from app.services.cnb.funding_selection import save_funding_selection
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from tests.test_concept_note_lifecycle import _ca_session, _workspace_repository


async def _programme(factory, funder_id, chapter_schema, **facts):
    """Persist a programme and its template with optional catalogue facts."""
    opportunity_id = uuid4()
    async with factory() as session, session.begin():
        session.add(
            CnbFundingOpportunity(
                funding_opportunity_id=opportunity_id,
                funder_id=funder_id,
                name="Urban grants",
                source_run_id="review-1",
                source_record_ref=str(opportunity_id),
                **facts,
            )
        )
        await session.flush()
        session.add(
            CnbFunderTemplate(
                funding_opportunity_id=opportunity_id,
                template_name="Urban grant application",
                chapter_schema=chapter_schema,
                required_fields=["budget"],
            )
        )
    return opportunity_id


async def _draft(workspace, run_id, chapter_schema, body_markdown):
    """Seed template chapters and return the first chapter with its draft revision."""
    await workspace.ensure_template_chapters(
        run_id=run_id, chapters=normalize_template_chapters(chapter_schema)
    )
    chapter = (await workspace.list_chapters(run_id=run_id))[0]
    await workspace.save_generated_chapter(
        chapter_id=chapter.chapter_id,
        body_markdown=body_markdown,
        missing_information=[],
    )
    return (await workspace.list_chapters(run_id=run_id))[0]


async def _seed(factory: async_sessionmaker[AsyncSession]) -> tuple[UUID, UUID, UUID]:
    """Create two funders, including a funder with no programme or template."""
    first, second = uuid4(), uuid4()
    async with factory() as session, session.begin():
        session.add_all(
            [
                CnbFunder(
                    funder_id=first,
                    name="Alpha Climate Fund",
                    country="Poland",
                    profile={"stated": {"priority": "Clean transport"}},
                ),
                CnbFunder(funder_id=second, name="Beta Foundation", profile={}),
            ]
        )
    opportunity_id = await _programme(
        factory,
        first,
        [
            {
                "chapter_ref": "summary",
                "title": "Project summary",
                "required": True,
                "required_fields": ["budget"],
            }
        ],
        min_award=10000,
        currency="EUR",
        summary="Grants for cities",
    )
    return first, second, opportunity_id


async def _run(session: AsyncSession) -> ConceptNoteRun:
    """Persist an unconfigured run with a ready source bundle."""
    run = ConceptNoteRun(
        run_id=uuid4(),
        user_id="owner",
        name="Krakow transport",
        city_id=str(uuid4()),
        status="active",
        workflow_step="assembling_context",
        context_summary={"context_bundle": {"status": "ready"}},
        permission_summary={},
        idempotency_key=uuid4(),
        request_fingerprint="a" * 64,
    )
    session.add(run)
    await session.flush()
    session.add(
        ConceptNoteContextBundle(
            run_id=run.run_id,
            context_bundle={
                "cc_context": {"city": {"name": "Krakow"}},
                "similar_projects": [{"name": "Old match"}],
            },
        )
    )
    await session.commit()
    return run


def _selection(
    funder=None,
    opportunity=None,
    previous_funder=None,
    previous_opportunity=None,
    acknowledge=False,
):
    return FundingSelectionRequest(
        funder_id=funder,
        selected_funding_opportunity_id=opportunity,
        expected_funder_id=previous_funder,
        expected_funding_opportunity_id=previous_opportunity,
        acknowledge_draft_review=acknowledge,
    )


@asynccontextmanager
async def _funded_draft(body_markdown):
    """Provide an independently stored run and a draft for its selected template."""
    async with (
        _workspace_repository() as (workspace, factory),
        _ca_session() as session,
    ):
        first, second, opportunity_id = await _seed(factory)
        run = await _run(session)
        context = await save_funding_selection(
            session, run, _selection(first, opportunity_id), reference_factory=factory
        )
        chapter = await _draft(
            workspace, run.run_id, context.template.chapter_schema, body_markdown
        )
        yield workspace, factory, session, run, first, second, opportunity_id, chapter


async def test_catalogue_includes_all_funders_and_nested_template():
    async with _workspace_repository() as (_, factory):
        first, second, opportunity_id = await _seed(factory)
        result = await load_funding_catalogue(factory)
        assert [item.id for item in result.funders] == [first, second]
        assert result.funders[0].profile["stated"]["priority"] == "Clean transport"
        opportunity = result.funders[0].opportunities[0]
        assert opportunity.id == opportunity_id
        assert opportunity.template.required_fields == ["budget"]
        assert opportunity.template.chapter_schema[0]["title"] == "Project summary"
        assert result.funders[1].opportunities == []


async def test_selection_persists_on_reload_switches_and_clears_context():
    async with _workspace_repository() as (_, factory), _ca_session() as session:
        first, second, opportunity_id = await _seed(factory)
        run = await _run(session)
        save = partial(save_funding_selection, session, run, reference_factory=factory)
        result = await save(_selection(first, opportunity_id))
        assert result.funder.id == first
        assert result.template.name == "Urban grant application"
        session.expire_all()
        await session.refresh(run)
        assert run.funder_id == first
        assert run.selected_funding_opportunity_id == opportunity_id
        bundle = await session.get(ConceptNoteContextBundle, run.run_id)
        assert (
            bundle.context_bundle["funder_context"]["funder"]["name"]
            == "Alpha Climate Fund"
        )
        assert bundle.context_bundle["similar_projects"] == []
        assert bundle.context_bundle["cc_context"]["city"]["name"] == "Krakow"
        result = await save(
            _selection(
                second, previous_funder=first, previous_opportunity=opportunity_id
            )
        )
        assert result.funder.id == second
        assert result.opportunity is None and result.template is None
        result = await save(_selection(previous_funder=second))
        assert result.funder is None
        assert bundle.context_bundle["funder_context"] is None


async def test_rejects_incompatible_programme_and_stale_selection_without_saving():
    async with _workspace_repository() as (_, factory), _ca_session() as session:
        first, second, opportunity_id = await _seed(factory)
        run = await _run(session)
        save = partial(save_funding_selection, session, run, reference_factory=factory)
        with pytest.raises(HTTPException) as invalid:
            await save(_selection(second, opportunity_id))
        assert invalid.value.status_code == 422
        assert run.funder_id is None
        with pytest.raises(HTTPException) as stale:
            await save(_selection(first, opportunity_id, previous_funder=second))
        assert stale.value.status_code == 409
        assert run.funder_id is None


async def test_existing_draft_requires_acknowledgement_and_preserves_text():
    async with (
        _workspace_repository() as (workspace, factory),
        _ca_session() as session,
    ):
        first, _, opportunity_id = await _seed(factory)
        run = await _run(session)
        save = partial(save_funding_selection, session, run, reference_factory=factory)
        draft = await _draft(
            workspace,
            run.run_id,
            [{"chapter_ref": "summary", "title": "Project summary"}],
            "Keep this project text.",
        )
        chapter_id, revision_id = draft.chapter_id, draft.revision_id
        async with factory() as reference, reference.begin():
            revision = await reference.get(ConceptNoteChapterRevision, revision_id)
            revision.author_type = "user"
            chapter = await reference.get(ConceptNoteChapter, chapter_id)
            chapter.status = "ready"
            chapter.user_locked = True
            chapter.confirmed_revision_id = revision_id
            reference.add(
                ConceptNoteChapterValidation(
                    chapter_id=chapter_id,
                    validated_revision_id=revision_id,
                    validation_input_fingerprint="a" * 64,
                    status="ready",
                    findings=[],
                )
            )
            proposal_id = uuid4()
            reference.add(
                ConceptNoteEditProposal(
                    proposal_id=proposal_id,
                    run_id=run.run_id,
                    actor_user_id="owner",
                    idempotency_key=uuid4(),
                    request_fingerprint="b" * 64,
                    instruction="Use the former funder's priorities",
                    scope={},
                    base_revisions={},
                    changes=[],
                    status="proposed",
                )
            )
        with pytest.raises(HTTPException) as unconfirmed:
            await save(_selection(first, opportunity_id))
        assert unconfirmed.value.status_code == 409
        await save(_selection(first, opportunity_id, acknowledge=True))
        async with factory() as reference:
            chapter = await reference.get(ConceptNoteChapter, chapter_id)
            revision = await reference.get(ConceptNoteChapterRevision, revision_id)
            assert chapter.status == "needs_review"
            assert chapter.user_locked is False
            assert chapter.confirmed_revision_id is None
            assert revision.body_markdown == "Keep this project text."

            assert (
                await reference.scalar(
                    select(ConceptNoteChapterValidation).where(
                        ConceptNoteChapterValidation.chapter_id == chapter_id
                    )
                )
                is None
            )
            assert (
                await reference.get(ConceptNoteEditProposal, proposal_id)
            ).status == "stale"


@pytest.mark.parametrize(
    "section,status", [("context_bundle", "building"), ("draft_document", "running")]
)
async def test_selection_is_blocked_during_generation(section, status):
    async with _workspace_repository() as (_, factory), _ca_session() as session:
        first, _, opportunity_id = await _seed(factory)
        run = await _run(session)
        run.context_summary = {section: {"status": status}}
        await session.commit()
        with pytest.raises(HTTPException) as busy:
            await save_funding_selection(
                session,
                run,
                _selection(first, opportunity_id),
                reference_factory=factory,
            )
        assert busy.value.status_code == 409
        assert run.funder_id is None


def test_opportunity_requires_funder():
    with pytest.raises(ValidationError):
        _selection(opportunity=uuid4())


async def test_catalogue_empty_and_database_unavailable():
    async with _workspace_repository() as (_, factory):
        assert (await load_funding_catalogue(factory)).funders == []

    def unavailable():
        raise RuntimeError("Database unavailable")

    with pytest.raises(HTTPException) as failure:
        await load_funding_catalogue(unavailable)
    assert failure.value.status_code == 503


async def test_drafting_reloads_current_funding_before_seeding_chapters():
    async with _workspace_repository() as (_, factory), _ca_session() as session:
        first, second, opportunity_id = await _seed(factory)
        run = await _run(session)
        await save_funding_selection(
            session, run, _selection(first, opportunity_id), reference_factory=factory
        )
        service = object.__new__(ConceptNoteChapterDraftService)
        service._ca_session_factory = async_sessionmaker(
            session.bind, expire_on_commit=False
        )
        service._application_context = ConceptNoteApplicationContextService(
            session_factory=factory
        )
        service._workspace = SimpleNamespace(
            ensure_template_chapters=AsyncMock(),
            list_chapters=AsyncMock(return_value=[]),
        )
        stale_run = SimpleNamespace(
            run_id=run.run_id,
            user_id=run.user_id,
            funder_id=second,
            selected_funding_opportunity_id=None,
        )
        result, build_id = await service.start(stale_run)
        assert result.status == "running"
        assert build_id is not None
        chapters = service._workspace.ensure_template_chapters.await_args.kwargs[
            "chapters"
        ]
        assert chapters[0].title == "Project summary"


@pytest.mark.parametrize("new_refs", [["budget"], ["summary", "budget"], []])
async def test_incompatible_template_switch_preserves_selection_and_draft(new_refs):
    async with _funded_draft("Keep the original draft.") as fixture:
        workspace, factory, session, run, first, second, opportunity_id, chapter = (
            fixture
        )
        new_opportunity = await _programme(
            factory, second, [{"chapter_ref": ref, "title": ref} for ref in new_refs]
        )
        with pytest.raises(HTTPException) as error:
            await save_funding_selection(
                session,
                run,
                _selection(second, new_opportunity, first, opportunity_id, True),
                reference_factory=factory,
            )
        assert error.value.status_code == 409
        assert error.value.detail["code"] == "funding_template_incompatible"
        await session.rollback()
        await session.refresh(run)
        assert (run.funder_id, run.selected_funding_opportunity_id) == (
            first,
            opportunity_id,
        )
        after = (await workspace.list_chapters(run_id=run.run_id))[0]
        assert after.chapter_id == chapter.chapter_id
        assert after.chapter_ref == "summary"
        assert after.body_markdown == "Keep the original draft."
        assert after.status == "draft"


async def test_compatible_switch_preserves_run_title_heading_and_guidance():
    async with _funded_draft("## Project summary\n\nKeep this text.") as fixture:
        workspace, factory, session, run, first, second, opportunity_id, chapter = (
            fixture
        )
        before = structure_snapshot(await workspace.list_chapters(run_id=run.run_id))
        async with factory() as reference, reference.begin():
            await save_structure(
                reference,
                run.run_id,
                StructureSaveRequest(
                    expected_fingerprint=before.fingerprint,
                    chapters=[
                        before.chapters[0].model_copy(
                            update={
                                "title": "My overview",
                                "description": "Run-specific guidance",
                            }
                        )
                    ],
                ),
            )
        renamed = (await workspace.list_chapters(run_id=run.run_id))[0]
        new_opportunity = await _programme(
            factory,
            second,
            [
                {
                    "chapter_ref": "summary",
                    "title": "Executive overview",
                    "required": False,
                }
            ],
        )
        await save_funding_selection(
            session,
            run,
            _selection(second, new_opportunity, first, opportunity_id, True),
            reference_factory=factory,
        )
        after = (await workspace.list_chapters(run_id=run.run_id))[0]
        assert after.title == "My overview" and after.required is False
        assert after.description == "Run-specific guidance"
        assert after.revision_id == renamed.revision_id
        assert after.chapter_id == chapter.chapter_id
        assert after.body_markdown == "## My overview\n\nKeep this text."
        assert after.status == "needs_review"


async def test_compatible_funding_switch_preserves_reordered_template_and_custom_chapters():
    async with _funded_draft("Original text.") as fixture:
        workspace, factory, session, run, first, second, opportunity_id, chapter = (
            fixture
        )
        # Extend the fixture to two template chapters and put a custom chapter first.
        async with factory() as reference, reference.begin():
            reference.add(
                ConceptNoteChapter(
                    chapter_id=uuid4(),
                    run_id=run.run_id,
                    template_section_id="budget",
                    title="My budget",
                    description="Budget guidance",
                    position=1,
                    required=False,
                    status="empty",
                )
            )
        before = structure_snapshot(await workspace.list_chapters(run_id=run.run_id))
        custom = StructureChapter(
            chapter_id=uuid4(), title="Community", description="Local priorities"
        )
        ordered = [custom, before.chapters[1], before.chapters[0]]
        async with factory() as reference, reference.begin():
            await save_structure(
                reference,
                run.run_id,
                StructureSaveRequest(
                    expected_fingerprint=before.fingerprint,
                    chapters=ordered,
                ),
            )
        new_opportunity = await _programme(
            factory,
            second,
            [
                {"chapter_ref": "summary", "title": "Summary", "required": False},
                {"chapter_ref": "budget", "title": "Budget", "required": True},
            ],
        )
        await save_funding_selection(
            session,
            run,
            _selection(second, new_opportunity, first, opportunity_id, True),
            reference_factory=factory,
        )
        after = await workspace.list_chapters(run_id=run.run_id)
        assert [item.chapter_id for item in after] == [
            item.chapter_id for item in ordered
        ]
        assert [item.title for item in after] == [item.title for item in ordered]
        assert [item.description for item in after] == [
            item.description for item in ordered
        ]
        assert [item.required for item in after] == [False, True, False]
        assert after[2].revision_id == chapter.revision_id
        assert after[2].body_markdown == "Original text."


async def test_edit_registration_reloads_funding_and_blocks_switch_until_finished(
    monkeypatch,
):
    async with _funded_draft("Improve the city.") as fixture:
        workspace, factory, session, run, first, second, opportunity_id, chapter = (
            fixture
        )
        save = partial(save_funding_selection, session, run, reference_factory=factory)
        # Simulate a request authorized before another tab changes the funding.
        stale_run = SimpleNamespace(
            run_id=run.run_id,
            user_id=run.user_id,
            status="active",
            funder_id=first,
            selected_funding_opportunity_id=opportunity_id,
        )
        await save(_selection(second, None, first, opportunity_id, True))
        planning = asyncio.Event()
        finish_planning = asyncio.Event()

        async def plan(request, chapters, context, **kwargs):
            assert context["funder_context"]["funder"]["id"] == str(second)
            planning.set()
            await finish_planning.wait()
            return EditPlanOutput(
                intent="edit",
                changes=[
                    PlannedTextChange(
                        chapter_id=chapter.chapter_id,
                        start=0,
                        before="Improve the city.",
                        after="Make the city better.",
                        kind="wording",
                        group_id="wording",
                        semantic_support="preserved",
                    )
                ],
            )

        service = ConceptNoteEditService(
            ConceptNoteEditRepository(factory),
            workspace,
            SimpleNamespace(plan=plan),
            workflow_sessions=async_sessionmaker(session.bind, expire_on_commit=False),
        )
        task = asyncio.create_task(
            service._propose(
                stale_run,
                EditProposalRequest(
                    instruction="Improve the wording.", idempotency_key=uuid4()
                ),
                recent_messages=None,
            )
        )
        try:
            await asyncio.wait_for(planning.wait(), timeout=5)
            with pytest.raises(HTTPException) as busy:
                await save(_selection(first, opportunity_id, second, None, True))
            assert busy.value.status_code == 409
            await session.rollback()
            await session.refresh(run)
        finally:
            finish_planning.set()
        proposal = await asyncio.wait_for(task, timeout=5)
        assert proposal.status == "proposed"
        await save(_selection(first, opportunity_id, second, None, True))
        # SQLite has no advisory locks; exercise the real status/revision checks.
        monkeypatch.setattr("app.persistence.concept_notes.edits.lock_run", AsyncMock())
        with pytest.raises(EditOperationError) as stale:
            await service.apply(
                run,
                proposal.proposal_id,
                EditApplyRequest(
                    idempotency_key=uuid4(),
                    expected_revisions={chapter.chapter_id: 1},
                ),
            )
        assert stale.value.code == "proposal_not_pending"
        after = (await workspace.list_chapters(run_id=run.run_id))[0]
        assert after.body_markdown == "Improve the city." and after.revision_number == 1
