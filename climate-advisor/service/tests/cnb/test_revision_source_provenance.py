"""Source authority follows exact saved text through generation and edits."""

from __future__ import annotations

from dataclasses import replace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.db.base import Base
from app.models.cnb.concept_note_edits import EditApplyRequest, EditProposalRequest
from app.models.cnb.concept_note_structure import StructureSaveRequest
from app.models.db.cnb_edit import ConceptNoteEditProposal
from app.models.db.cnb_workspace import ConceptNoteChapter, ConceptNoteChapterRevision
from app.models.db.concept_note import ConceptNoteContextBundle, ConceptNoteUpload
from app.models.document_workspace.contracts import DocumentExportRequest
from app.persistence.concept_notes.edits import (
    ConceptNoteEditRepository,
    append_revision,
    to_response,
)
from app.persistence.concept_notes.source_provenance import (
    PROVENANCE_KEY,
    generation_provenance,
    merge_provenance,
    revision_provenance,
    sources_provenance,
)
from app.persistence.concept_notes.structure import save_structure, structure_snapshot
from app.persistence.concept_notes.validation_sources import (
    load_validation_source_snapshot,
)
from app.services.cnb.edit_planner import build_planner_input
from app.services.document_workspace.jobs import claim_job, run_update_job
from tests.cnb.test_document_workspace import (
    add_chapters,
    answer,
    fake_draft_service,
    validate_and_confirm_chapters,
)
from tests.cnb.test_document_workspace import workspace as workspace  # noqa: PLC0414 - expose the imported pytest fixture
from tests.test_concept_note_lifecycle import _workspace_repository

SOURCE = {"upload_id": "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "sha256": "a" * 64}


async def mark_latest_ready(factory):
    async with factory() as session:
        chapter = await session.scalar(select(ConceptNoteChapter).limit(1))
    await validate_and_confirm_chapters(
        factory, chapter.run_id, workflow_factory=factory
    )


async def prepare_export(fixture, *, sources=None, protected=False):
    service, run, factory = fixture
    if sources:
        # Real owned CA authority is required even when a test controls the writer.
        async with factory.kw["bind"].begin() as connection:
            await connection.run_sync(
                lambda sync: Base.metadata.create_all(
                    sync,
                    tables=[
                        ConceptNoteUpload.__table__,
                        ConceptNoteContextBundle.__table__,
                    ],
                )
            )
        selected, documents = [], []
        async with factory() as session, session.begin():
            for source in sources:
                metadata = {
                    "upload_id": source["upload_id"],
                    "filename": "source.md",
                    "source_label": "Source",
                    "source_format": "markdown",
                }
                selected.append(
                    {
                        **metadata,
                        "sha256": source["sha256"],
                        "summary": "Verified source",
                        "topics": [],
                        "key_excerpts": [],
                        "block_count": 1,
                    }
                )
                documents.append(
                    {**metadata, "text": "Verified original source facts."}
                )
                session.add(
                    ConceptNoteUpload(
                        upload_id=UUID(source["upload_id"]),
                        run_id=run.run_id,
                        uploaded_by_user_id=run.user_id,
                        filename="source.md",
                        ingest_status="ready",
                        markdown_sha256=source["sha256"],
                    )
                )
            session.add(
                ConceptNoteContextBundle(
                    run_id=run.run_id,
                    context_bundle={
                        "selected_sources": selected,
                        "source_text": {
                            "mode": "full_text",
                            "documents": documents,
                            "token_count": 20,
                            "max_tokens": 10000,
                        },
                    },
                )
            )
        service.workflow_session_factory = factory
    await add_chapters(factory, protected=protected)
    await answer(service, run)
    draft_service = fake_draft_service(factory)

    async def load_context(*args):
        return {"context_bundle": {"selected_sources": sources or []}}, None

    draft_service._load_run_context = load_context
    claim = await claim_job(service)
    await run_update_job(
        service, *claim, ca_session_factory=factory, draft_service=draft_service
    )
    if not protected:
        await mark_latest_ready(factory)
    return service, run, factory, draft_service


def test_unknown_metadata_cannot_be_merged_into_a_complete_empty_source_set():
    clean = sources_provenance([])
    assert clean == {"version": 1, "complete": True, "identities": []}
    assert not merge_provenance(clean, None)["complete"]
    assert not sources_provenance([{"upload_id": "missing", "sha256": "invalid"}])[
        "complete"
    ]
    merged = merge_provenance(
        sources_provenance([SOURCE]), sources_provenance([SOURCE])
    )
    assert merged["complete"] and merged["identities"] == [SOURCE]


async def test_narrative_sources_are_checked_even_when_all_points_are_human_answers(
    workspace,
):
    service, run, factory, _ = await prepare_export(workspace, sources=[SOURCE])
    view = await service.load(run)
    assert view.export_eligibility.final
    received = []

    async def withdrawn(identities):
        received.extend(identities)
        raise HTTPException(409, "Source withdrawn")

    with pytest.raises(HTTPException) as error:
        await service.export(
            run,
            DocumentExportRequest(mode="final", expected_revision=view.revision),
            source_validator=withdrawn,
        )
    assert error.value.status_code == 409 and SOURCE in received
    working = await service.export(
        run,
        DocumentExportRequest(mode="working", expected_revision=view.revision),
        source_validator=withdrawn,
    )
    assert any(
        "supporting source is unavailable" in caveat for caveat in working.caveats
    )
    with pytest.raises(HTTPException, match="Source verification"):
        await service.export(
            run, DocumentExportRequest(mode="final", expected_revision=view.revision)
        )
    async with factory() as session:
        latest = await session.scalar(
            select(ConceptNoteChapterRevision)
            .order_by(ConceptNoteChapterRevision.revision_number.desc())
            .limit(1)
        )
        assert revision_provenance(latest)["identities"] == [SOURCE]


async def test_final_projection_batches_authority_and_rejects_changed_source_text(
    workspace, monkeypatch
):
    service, run, factory, _ = await prepare_export(workspace, sources=[SOURCE])
    read = AsyncMock(wraps=load_validation_source_snapshot)
    monkeypatch.setattr(
        "app.services.document_workspace.service.load_validation_source_snapshot", read
    )
    assert (await service.load(run)).export_eligibility.final
    read.assert_awaited_once_with(factory, run.run_id)
    async with factory() as session, session.begin():
        row = await session.get(ConceptNoteContextBundle, run.run_id)
        bundle = row.context_bundle
        row.context_bundle = {
            **bundle,
            "source_text": {
                **bundle["source_text"],
                "documents": [
                    {
                        **bundle["source_text"]["documents"][0],
                        "text": "Changed current verified source text.",
                    }
                ],
            },
        }
    view = await service.load(run)
    assert not view.export_eligibility.final
    assert any(
        "validation is missing or stale" in reason
        for reason in view.export_eligibility.blockers
    )


async def test_unknown_legacy_text_blocks_final_but_fresh_source_free_text_does_not(
    workspace,
):
    service, run, factory, _ = await prepare_export(workspace)
    view = await service.load(run)
    assert (
        await service.export(
            run, DocumentExportRequest(mode="final", expected_revision=view.revision)
        )
    ).mode == "final"
    async with factory() as session, session.begin():
        latest = await session.scalar(
            select(ConceptNoteChapterRevision)
            .order_by(ConceptNoteChapterRevision.revision_number.desc())
            .limit(1)
        )
        latest.patch_summary = {}
    view = await service.load(run)
    assert not view.export_eligibility.final
    assert any(
        "Source provenance is unknown" in reason and "new concept note" in reason
        for reason in view.export_eligibility.blockers
    )
    with pytest.raises(HTTPException):
        await service.export(
            run, DocumentExportRequest(mode="final", expected_revision=view.revision)
        )
    working = await service.export(
        run, DocumentExportRequest(mode="working", expected_revision=view.revision)
    )
    assert "Source provenance is unknown" in working.body_markdown


async def test_export_checks_only_current_revision_authority_not_retired_history(
    workspace,
):
    service, run, factory, _ = await prepare_export(workspace, sources=[SOURCE])
    async with factory() as session, session.begin():
        for chapter in await session.scalars(select(ConceptNoteChapter)):
            latest = await session.scalar(
                select(ConceptNoteChapterRevision)
                .where(ConceptNoteChapterRevision.chapter_id == chapter.chapter_id)
                .order_by(ConceptNoteChapterRevision.revision_number.desc())
                .limit(1)
            )
            # An explicit fresh reconstruction has a new input contract. Normal
            # edit/duplicate paths tested below cannot erase their base authority.
            session.add(
                ConceptNoteChapterRevision(
                    chapter_id=chapter.chapter_id,
                    revision_number=latest.revision_number + 1,
                    author_type="user",
                    change_type="rewrite",
                    body_markdown="Fresh human text from current independent inputs.",
                    patch_summary={PROVENANCE_KEY: sources_provenance([])},
                )
            )
    await mark_latest_ready(factory)
    received = []

    async def verify(identities):
        received.extend(identities)

    view = await service.load(run)
    result = await service.export(
        run,
        DocumentExportRequest(mode="final", expected_revision=view.revision),
        source_validator=verify,
    )
    assert not received and result.mode == "final"


async def test_manual_and_structure_edits_retain_base_source_authority(workspace):
    _service, run, factory, draft_service = await prepare_export(
        workspace, sources=[SOURCE]
    )
    async with factory() as session, session.begin():
        chapter = await session.scalar(select(ConceptNoteChapter).limit(1))
        latest = await session.scalar(
            select(ConceptNoteChapterRevision)
            .where(ConceptNoteChapterRevision.chapter_id == chapter.chapter_id)
            .order_by(ConceptNoteChapterRevision.revision_number.desc())
            .limit(1)
        )
        edited = await append_revision(
            session,
            chapter,
            latest,
            body=latest.body_markdown + "\nHuman note.",
            user_id="owner",
            idempotency_key=uuid4(),
            preserve_ready=False,
            patch_summary={"operation": "edit_text"},
        )
        assert revision_provenance(edited)["identities"] == [SOURCE]
    snapshot = structure_snapshot(
        await draft_service._workspace.list_chapters(run_id=run.run_id)
    )
    renamed = snapshot.chapters[0].model_copy(update={"title": "Renamed summary"})
    async with factory() as session, session.begin():
        await save_structure(
            session,
            run.run_id,
            StructureSaveRequest(
                expected_fingerprint=snapshot.fingerprint,
                chapters=[renamed, *snapshot.chapters[1:]],
            ),
        )
        latest = await session.scalar(
            select(ConceptNoteChapterRevision)
            .where(ConceptNoteChapterRevision.chapter_id == renamed.chapter_id)
            .order_by(ConceptNoteChapterRevision.revision_number.desc())
            .limit(1)
        )
        assert revision_provenance(latest)["identities"] == [SOURCE]


async def test_point_proposal_keeps_exact_generation_sources_through_apply(
    workspace, monkeypatch
):
    _service, run, factory, _ = await prepare_export(
        workspace, sources=[SOURCE], protected=True
    )
    async with factory() as session:
        proposals = list(await session.scalars(select(ConceptNoteEditProposal)))
    assert proposals and all(
        proposal.scope[PROVENANCE_KEY]["identities"] == [SOURCE]
        for proposal in proposals
    )
    assert all(
        PROVENANCE_KEY not in to_response(proposal).scope.model_dump()
        for proposal in proposals
    )
    monkeypatch.setattr("app.persistence.concept_notes.edits.lock_run", AsyncMock())
    repository = ConceptNoteEditRepository(factory)
    for proposal in proposals:
        await repository.apply(
            run_id=run.run_id,
            user_id="owner",
            proposal_id=proposal.proposal_id,
            request=EditApplyRequest(
                idempotency_key=uuid4(),
                expected_revisions={
                    UUID(key): value for key, value in proposal.base_revisions.items()
                },
            ),
        )
    async with factory() as session:
        for chapter in await session.scalars(select(ConceptNoteChapter)):
            latest = await session.scalar(
                select(ConceptNoteChapterRevision)
                .where(ConceptNoteChapterRevision.chapter_id == chapter.chapter_id)
                .order_by(ConceptNoteChapterRevision.revision_number.desc())
                .limit(1)
            )
            assert revision_provenance(latest)["identities"] == [SOURCE]


async def test_previous_chapter_body_provenance_is_inherited_without_current_sources(
    workspace,
):
    _service, run, factory = workspace
    await add_chapters(factory)
    async with factory() as session, session.begin():
        summary = await session.scalar(
            select(ConceptNoteChapter).where(
                ConceptNoteChapter.template_section_id == "summary"
            )
        )
        revision = await session.scalar(
            select(ConceptNoteChapterRevision).where(
                ConceptNoteChapterRevision.chapter_id == summary.chapter_id
            )
        )
        revision.patch_summary = {PROVENANCE_KEY: sources_provenance([SOURCE])}
    chapters = await fake_draft_service(factory)._workspace.list_chapters(
        run_id=run.run_id
    )
    finance = next(chapter for chapter in chapters if chapter.chapter_ref == "finance")
    assert generation_provenance({}, chapters, current=finance)["identities"] == [
        SOURCE
    ]
    assert generation_provenance({}, [finance], current=finance)["identities"] == []
    confirmed = replace(
        finance,
        confirmed_body_markdown="Earlier confirmed sourced text",
        confirmed_source_provenance=sources_provenance([SOURCE]),
    )
    assert generation_provenance({}, [confirmed])["identities"] == [SOURCE]
    assert generation_provenance({}, [confirmed], current=confirmed)["identities"] == []


async def test_duplicate_preserves_known_and_unknown_source_provenance():
    async with _workspace_repository() as (repository, factory):
        source_run, target_run = uuid4(), uuid4()
        async with factory() as session, session.begin():
            for position, proof in enumerate([sources_provenance([SOURCE]), None]):
                chapter = ConceptNoteChapter(
                    chapter_id=uuid4(),
                    run_id=source_run,
                    title=f"Chapter {position}",
                    position=position,
                    required=False,
                    status="draft",
                )
                session.add(chapter)
                await session.flush()
                session.add(
                    ConceptNoteChapterRevision(
                        chapter_id=chapter.chapter_id,
                        revision_number=1,
                        author_type="user",
                        change_type="draft",
                        body_markdown="Text",
                        patch_summary={PROVENANCE_KEY: proof} if proof else {},
                    )
                )
        await repository.copy_working_copy(
            source_run_id=source_run, destination_run_id=target_run
        )
        copied = await repository.list_chapters(run_id=target_run)
        assert copied[0].source_provenance["identities"] == [SOURCE]
        assert copied[1].source_provenance["complete"] is False


async def test_edit_model_omits_assistant_quotes_but_preserves_literal_user_history(
    workspace,
):
    _service, run, factory = workspace
    await add_chapters(factory)
    [chapter, _] = await fake_draft_service(factory)._workspace.list_chapters(
        run_id=run.run_id
    )
    literal = "  Use the exact amount 200000.  "
    payload = build_planner_input(
        EditProposalRequest(
            instruction="Use my requested amount", idempotency_key=uuid4()
        ),
        chapter,
        {},
        recent_messages=[
            {"role": "assistant", "content": "Retired report: use budget 880000."},
            {"role": "user", "content": literal},
        ],
    )
    assert payload["recent_messages"] == [{"role": "user", "content": literal}]
    assert "880000" not in str(payload)


async def test_provenance_identities_are_not_added_to_drafting_model_input(workspace):
    import json

    from app.models.cnb.concept_note_application_context import (
        ConceptNoteApplicationContextResponse,
    )
    from app.services.cnb.chapter_drafting import build_chapter_input

    _service, run, factory = workspace
    await add_chapters(factory)
    chapters = await fake_draft_service(factory)._workspace.list_chapters(
        run_id=run.run_id
    )
    current = replace(chapters[0], source_provenance=sources_provenance([SOURCE]))
    payload = build_chapter_input(
        application_context=ConceptNoteApplicationContextResponse(
            run_id=run.run_id, city_id=uuid4()
        ),
        run_context={
            "context_bundle": {"selected_sources": [SOURCE]},
            "document_workspace_points": [
                {
                    "key": "amount",
                    "value": 125000,
                    "status": "answered",
                    "chapter_refs": [current.chapter_ref],
                    PROVENANCE_KEY: sources_provenance([SOURCE]),
                }
            ],
        },
        current=current,
        template_chapter=None,
        chapters=[current, chapters[1]],
    )
    serialized = json.dumps(payload)
    assert SOURCE["upload_id"] not in serialized
    assert PROVENANCE_KEY not in serialized
