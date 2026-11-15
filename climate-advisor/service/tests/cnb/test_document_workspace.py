"""Real persistence tests for canonical points and durable chapter propagation."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import DefaultClause, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config.settings import get_settings
from app.db.base import Base
from app.db.cnb import CnbBase
from app.models.cnb.concept_note_application_context import ApplicationContextTemplate
from app.models.cnb.concept_note_draft import ConceptNoteChapterDraftOutput
from app.models.cnb.context_bundle import (
    SelectedSource,
    SourceExcerpt,
    SourceQueryResult,
)
from app.models.db.cnb_edit import ConceptNoteEditApplication, ConceptNoteEditProposal
from app.models.db.cnb_workspace import (
    ConceptNoteChapter,
    ConceptNoteChapterReview,
    ConceptNoteChapterRevision,
    ConceptNoteChapterValidation,
    ConceptNoteEvidenceLink,
    ConceptNoteGap,
    ConceptNoteGapResolution,
)
from app.models.db.concept_note import ConceptNoteRun
from app.models.db.document_workspace import (
    DocumentCandidate,
    DocumentDependency,
    DocumentExport,
    DocumentNeed,
    DocumentOperation,
    DocumentPoint,
    DocumentPointRevision,
    DocumentSetupSnapshot,
    DocumentSourceReading,
    DocumentUpdateJob,
    DocumentWorkspaceState,
)
from app.models.document_workspace.contracts import (
    DocumentExportRequest,
    DocumentPointCommand,
)
from app.persistence.concept_notes.workspace import ConceptNoteWorkspaceRepository
from app.services.cnb.source_analysis import SourcePage
from app.services.cnb.source_impact_review import RevalidationSource
from app.services.document_workspace.extraction import extract_source_candidates
from app.services.document_workspace.jobs import (
    claim_job,
    refresh_reviews,
    run_update_job,
)
from app.services.document_workspace.service import DocumentWorkspaceService

RUN_ID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
TEMPLATE_ID = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")


def template(*, allow_assumption: bool = False) -> ApplicationContextTemplate:
    return ApplicationContextTemplate(
        id=TEMPLATE_ID,
        name="Test application",
        chapter_schema=[
            {
                "chapter_ref": ref,
                "title": ref.title(),
                "required": True,
                "required_fields": [
                    {
                        "key": "requested_amount",
                        "label": "Requested amount",
                        "answer_type": "number",
                        "minimum": 1,
                        "allow_assumption": allow_assumption,
                    }
                ],
            }
            for ref in ["summary", "finance"]
        ],
    )


@pytest.fixture
async def workspace(tmp_path):
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{(tmp_path / 'points.db').as_posix()}"
    )
    factory = async_sessionmaker(engine, expire_on_commit=False)
    tables = [
        model.__table__
        for model in (
            DocumentWorkspaceState,
            DocumentSetupSnapshot,
            DocumentPoint,
            DocumentCandidate,
            DocumentPointRevision,
            DocumentOperation,
            DocumentNeed,
            DocumentDependency,
            DocumentUpdateJob,
            DocumentExport,
            DocumentSourceReading,
            ConceptNoteChapter,
            ConceptNoteChapterRevision,
            ConceptNoteGap,
            ConceptNoteGapResolution,
            ConceptNoteChapterValidation,
            ConceptNoteChapterReview,
            ConceptNoteEvidenceLink,
            ConceptNoteEditProposal,
            ConceptNoteEditApplication,
        )
    ]
    defaults = []
    for table in tables:
        for column in table.columns:
            if column.server_default is not None and "::jsonb" in str(
                column.server_default.arg
            ):
                defaults.append((column, column.server_default))
                column.server_default = DefaultClause(
                    text(str(column.server_default.arg).replace("::jsonb", ""))
                )
    try:
        async with engine.begin() as connection:
            await connection.run_sync(
                lambda sync: CnbBase.metadata.create_all(sync, tables=tables)
            )
            await connection.run_sync(
                lambda sync: Base.metadata.create_all(
                    sync, tables=[ConceptNoteRun.__table__]
                )
            )
    finally:
        for column, default in defaults:
            column.server_default = default
    run = ConceptNoteRun(
        run_id=RUN_ID,
        user_id="owner",
        name="Application",
        city_id=str(uuid4()),
        idempotency_key=uuid4(),
        request_fingerprint="0" * 64,
        custom_template={
            "id": str(TEMPLATE_ID),
            "template_name": "Test application",
            "chapter_schema": template().chapter_schema,
            "required_fields": [],
            "added_from": {"kind": "manual"},
        },
    )
    async with factory() as session, session.begin():
        session.add(run)
    service = DocumentWorkspaceService(factory)
    try:
        yield service, run, factory
    finally:
        await engine.dispose()


async def answer(service, run, value=125000, **kwargs):
    view = await service.load(run)
    return await service.command(
        run,
        "requested_amount",
        DocumentPointCommand(
            command="answer",
            expected_version=view.points[0].version,
            idempotency_key=str(uuid4()),
            value=value,
            **kwargs,
        ),
        user_id="owner",
    )


async def add_chapters(factory, *, protected=False):
    async with factory() as session, session.begin():
        for position, ref in enumerate(["summary", "finance"]):
            chapter = ConceptNoteChapter(
                chapter_id=uuid4(),
                run_id=RUN_ID,
                template_section_id=ref,
                title=ref.title(),
                position=position,
                required=True,
                status="ready" if protected else "draft",
            )
            revision = ConceptNoteChapterRevision(
                revision_id=uuid4(),
                chapter_id=chapter.chapter_id,
                revision_number=1,
                author_type="user" if protected else "agent",
                change_type="edit_text" if protected else "draft",
                body_markdown=f"## {ref.title()}\n\nOld amount.",
                patch_summary={
                    "source_provenance": {
                        "version": 1,
                        "complete": True,
                        "identities": [],
                    }
                },
            )
            session.add_all([chapter, revision])
            if protected:
                chapter.confirmed_revision_id = revision.revision_id


def fake_draft_service(factory, *, fail=False, during_generation=None):
    async def load_context(*args):
        return {}, None

    async def load_application(*args, **kwargs):
        from app.models.cnb.concept_note_application_context import (
            ConceptNoteApplicationContextResponse,
        )

        return ConceptNoteApplicationContextResponse(
            run_id=RUN_ID, city_id=uuid4(), template=template()
        )

    async def generate(payload):
        if during_generation:
            await during_generation()
        if fail:
            raise RuntimeError("controlled provider unavailable")
        return ConceptNoteChapterDraftOutput(
            body_markdown=f"## {payload['chapter']['title']}\n\nRequested amount: {payload['canonical_points'][0]['value']}."
        )

    return SimpleNamespace(
        _workspace=ConceptNoteWorkspaceRepository(factory),
        _application_context=SimpleNamespace(load_for_run=load_application),
        _load_run_context=load_context,
        _generate_chapter=generate,
    )


async def validate_and_confirm_chapters(factory, run_id):
    """Persist controlled validation outcomes through the real fingerprint boundary."""
    from app.services.cnb.application_context import (
        calculate_application_template_fingerprint,
    )

    repository = ConceptNoteWorkspaceRepository(factory)
    async with factory() as session:
        state = await session.get(DocumentWorkspaceState, run_id)
        snapshot = await session.scalar(
            select(DocumentSetupSnapshot).where(
                DocumentSetupSnapshot.run_id == run_id,
                DocumentSetupSnapshot.version == state.setup_version,
            )
        )
    template_fingerprint = calculate_application_template_fingerprint(
        ApplicationContextTemplate.model_validate(snapshot.snapshot)
    )
    for chapter in await repository.list_chapters(run_id=run_id):
        context = await repository.load_validation_context(
            run_id=run_id,
            chapter_id=chapter.chapter_id,
            template_fingerprint=template_fingerprint,
        )
        await repository.upsert_validation(
            run_id=run_id,
            chapter_id=chapter.chapter_id,
            template_fingerprint=template_fingerprint,
            expected_fingerprint=context.fingerprint,
            status="ready",
            findings=[],
        )
        await repository.confirm_chapter(
            run_id=run_id,
            chapter_id=chapter.chapter_id,
            expected_revision=chapter.revision_number,
            idempotency_key=uuid4(),
            user_id="owner",
            template_fingerprint=template_fingerprint,
        )


async def test_requirements_materialize_before_prose_and_shared_keys_are_unique(
    workspace,
):
    service, run, factory = workspace
    view = await service.load(run)
    assert view.setup.ready and len(view.points) == 1
    assert view.points[0].chapter_refs == ["finance", "summary"]
    assert view.overview.required_total == 1 and view.overview.required_covered == 0
    async with factory() as session:
        assert not list(await session.scalars(select(ConceptNoteChapter)))
        assert len(list(await session.scalars(select(DocumentDependency)))) == 2
        assert len(list(await session.scalars(select(DocumentSetupSnapshot)))) == 1
    assert (await service.load(run)).revision == view.revision


async def test_ambiguous_labels_are_not_fuzzy_merged_and_conflicting_shared_schema_rejected(
    workspace,
):
    service, run, _ = workspace
    configured = template()
    for chapter in configured.chapter_schema:
        chapter["required_fields"] = ["Budget"]
    await service.reconcile_template(run, configured)
    async with service.session_factory() as session:
        points = list(
            await session.scalars(
                select(DocumentPoint).where(DocumentPoint.active.is_(True))
            )
        )
    assert len(points) == 2 and points[0].semantic_key != points[1].semantic_key
    assert all(str(TEMPLATE_ID) not in point.semantic_key for point in points)
    configured = template()
    configured.chapter_schema[1]["required_fields"][0]["answer_type"] = "text"
    with pytest.raises(HTTPException) as error:
        await service.reconcile_template(run, configured)
    assert error.value.status_code == 422


async def test_legacy_aggregate_fields_do_not_duplicate_chapter_requirements(workspace):
    service, run, _ = workspace
    configured = template()
    configured.chapter_schema = [
        {
            "chapter_ref": "summary",
            "title": "Summary",
            "required": True,
            "required_fields": ["Project name", "Requested grant amount"],
        }
    ]
    configured.required_fields = [
        "Project name",
        "Requested grant amount",
        "Global policy",
    ]
    await service.reconcile_template(run, configured)
    view = await service.load(run)
    assert view.overview.required_total == 3
    assert sorted(point.label for point in view.points) == [
        "Global policy",
        "Project name",
        "Requested grant amount",
    ]
    assert next(
        point for point in view.points if point.label == "Project name"
    ).chapter_refs == ["summary"]


async def test_accepted_points_wait_for_first_prose_without_failure_or_retry_spending(
    workspace,
):
    service, run, factory = workspace
    await answer(service, run)
    claim = await claim_job(service)
    draft_service = fake_draft_service(factory, fail=True)
    await run_update_job(
        service, *claim, ca_session_factory=factory, draft_service=draft_service
    )
    async with factory() as session:
        job = await session.get(DocumentUpdateJob, claim[0])
        assert job.status == "queued" and job.attempts == 0
        assert job.lease_token is None and job.error_code is None
        assert job.available_at.replace(tzinfo=UTC) > datetime.now(UTC)
    assert (await service.load(run)).points[0].freshness == "current"
    assert await claim_job(service) is None


async def test_typed_acceptance_replay_stale_key_reuse_and_owner_boundary(workspace):
    service, run, factory = workspace
    [point] = (await service.load(run)).points
    request = DocumentPointCommand(
        command="answer",
        expected_version=point.version,
        idempotency_key="answer-1",
        value=125000,
    )
    first = await service.command(run, point.key, request, user_id="owner")
    assert first.point.status == "answered" and first.point.freshness == "current"
    assert await service.command(run, point.key, request, user_id="owner") == first
    for payload in [
        request.model_copy(update={"idempotency_key": "stale"}),
        request.model_copy(update={"value": 99}),
    ]:
        with pytest.raises(HTTPException) as error:
            await service.command(run, point.key, payload, user_id="owner")
        assert error.value.status_code == 409
    with pytest.raises(HTTPException) as error:
        await service.command(run, point.key, request, user_id="someone-else")
    assert error.value.status_code == 403
    async with factory() as session:
        assert len(list(await session.scalars(select(DocumentUpdateJob)))) == 1
        assert len(list(await session.scalars(select(DocumentPointRevision)))) == 2
    for value in ["125000", True, -5, None]:
        with pytest.raises(HTTPException) as error:
            await answer(service, run, value)
        assert error.value.status_code == 422


async def test_park_resume_and_required_exceptions_do_not_fabricate_coverage(workspace):
    service, run, _ = workspace
    point = (await service.load(run)).points[0]
    parked = await service.command(
        run,
        point.key,
        DocumentPointCommand(
            command="park",
            expected_version=point.version,
            idempotency_key="park",
            waiting_for="Treasurer",
            requested_information="Confirmed amount",
        ),
        user_id="owner",
    )
    assert parked.point.status == "missing" and parked.point.task.status == "waiting"
    view = await service.load(run)
    assert view.overview.waiting_count == 1 and view.overview.required_covered == 0
    for command in ["assume", "not_applicable"]:
        with pytest.raises(HTTPException) as error:
            await service.command(
                run,
                point.key,
                DocumentPointCommand(
                    command=command,
                    expected_version=parked.point.version,
                    idempotency_key=command,
                    value=5000,
                    reason="Interim estimate",
                ),
                user_id="owner",
            )
        assert error.value.status_code == 422
    resumed = await service.command(
        run,
        point.key,
        DocumentPointCommand(
            command="resume",
            expected_version=parked.point.version,
            idempotency_key="resume",
        ),
        user_id="owner",
    )
    assert resumed.point.task.status == "active" and resumed.point.status == "missing"


async def test_configured_assumption_requires_reason_and_working_export_carries_caveats(
    workspace,
):
    service, run, _ = workspace
    run.custom_template["chapter_schema"] = template(
        allow_assumption=True
    ).chapter_schema
    await service.reconcile_template(run, template(allow_assumption=True))
    point = (await service.load(run)).points[0]
    with pytest.raises(HTTPException):
        await service.command(
            run,
            point.key,
            DocumentPointCommand(
                command="assume",
                expected_version=point.version,
                idempotency_key="no-reason",
                value=125000,
            ),
            user_id="owner",
        )
    result = await service.command(
        run,
        point.key,
        DocumentPointCommand(
            command="assume",
            expected_version=point.version,
            idempotency_key="estimate",
            value=125000,
            reason="Budget review is scheduled.",
        ),
        user_id="owner",
    )
    assert result.point.status == "assumption"
    working = await service.export(
        run,
        DocumentExportRequest(
            mode="working", expected_revision=result.workspace_revision
        ),
    )
    assert "Budget review is scheduled" in working.body_markdown
    with pytest.raises(HTTPException) as error:
        await service.export(
            run,
            DocumentExportRequest(
                mode="final", expected_revision=result.workspace_revision
            ),
        )
    assert error.value.status_code == 409


async def test_controlled_extraction_verifies_evidence_and_keeps_accepted_answer_on_conflict(
    workspace,
):
    service, run, factory = workspace
    await answer(service, run)
    source = SelectedSource(
        upload_id=uuid4(),
        filename="budget.pdf",
        source_label="Budget plan",
        sha256="1" * 64,
        page_count=1,
        summary="Financing",
        topics=["budget"],
        key_excerpts=[],
    )
    settings = get_settings()
    query_calls = []

    async def query(**kwargs):
        query_calls.append(kwargs)
        return SourceQueryResult(
            found=True,
            upload_id=source.upload_id,
            source_label=source.source_label,
            source_format="pdf",
            excerpts=[
                SourceExcerpt(text="The amount is 150000.", page=1),
                SourceExcerpt(text="Invented evidence", page=1),
            ],
            units_processed=1,
            units_total=1,
            segments_processed=1,
            segments_total=1,
        )

    class Runner:
        @staticmethod
        async def run(agent, input_text, **kwargs):
            payload = json.loads(input_text)
            assert payload["evidence"] == [
                {"position": 0, "quote": "The amount is 150000."}
            ]
            assert (
                str(source.upload_id) not in input_text
                and "page" not in payload["evidence"][0]
            )
            return SimpleNamespace(
                final_output={
                    "candidates": [
                        {"value": 150000, "evidence_positions": [0]},
                        {"value": 200000, "evidence_positions": [999]},
                    ]
                }
            )

    for _ in range(2):
        await extract_source_candidates(
            run,
            [
                RevalidationSource(
                    source=source, units=[SourcePage(1, "The amount is 150000.")]
                )
            ],
            service=service,
            settings=settings,
            query_fn=query,
            runner=Runner,
            client=object(),
        )
    point = (await service.load(run)).points[0]
    assert len(query_calls) == 1
    assert point.status == "conflict" and point.value == 125000
    assert (
        len(point.candidates) == 1 and point.candidates[0].citations[0].page_number == 1
    )
    confirmed = await service.command(
        run,
        point.key,
        DocumentPointCommand(
            command="confirm_candidate",
            expected_version=point.version,
            idempotency_key="confirm",
            candidate_id=point.candidates[0].candidate_id,
        ),
        user_id="owner",
    )
    assert confirmed.point.value == 150000 and confirmed.point.status == "answered"
    async with factory() as session:
        assert len(list(await session.scalars(select(DocumentCandidate)))) == 1
        assert len(list(await session.scalars(select(DocumentSourceReading)))) == 1


@pytest.mark.parametrize("protected", [False, True])
async def test_durable_update_auto_revises_free_text_and_proposes_for_manual_ready_text(
    workspace, protected
):
    service, run, factory = workspace
    await add_chapters(factory, protected=protected)
    result = await answer(service, run)
    claim = await claim_job(service)
    assert str(claim[0]) == result.update_job.job_id
    await run_update_job(
        service,
        *claim,
        ca_session_factory=factory,
        draft_service=fake_draft_service(factory),
    )
    async with factory() as session:
        job = await session.get(DocumentUpdateJob, claim[0])
        revisions = list(await session.scalars(select(ConceptNoteChapterRevision)))
        proposals = list(await session.scalars(select(ConceptNoteEditProposal)))
    if protected:
        assert (
            job.status == "pending_review"
            and len(revisions) == 2
            and len(proposals) == 2
        )
        assert all("125000" in proposal.changes[0]["after"] for proposal in proposals)
        assert (await service.load(run)).points[0].freshness == "pending_review"
    else:
        assert job.status == "complete" and len(revisions) == 4 and not proposals
        assert (await service.load(run)).points[0].freshness == "current"


async def test_worker_failure_keeps_answer_and_expired_lease_is_recoverable(workspace):
    service, run, factory = workspace
    await add_chapters(factory)
    await answer(service, run)
    claim = await claim_job(service)
    await run_update_job(
        service,
        *claim,
        ca_session_factory=factory,
        draft_service=fake_draft_service(factory, fail=True),
    )
    point = (await service.load(run)).points[0]
    assert (
        point.value == 125000
        and point.status == "answered"
        and point.freshness == "failed"
    )
    async with factory() as session, session.begin():
        job = await session.get(DocumentUpdateJob, claim[0])
        job.status = "running"
        job.available_at = datetime.now(UTC) - timedelta(minutes=1)
        job.lease_until = datetime.now(UTC) - timedelta(minutes=1)
    recovered = await claim_job(service)
    assert recovered[0] == claim[0] and recovered[1] != claim[1]


async def test_new_answer_during_generation_supersedes_stale_result(workspace):
    service, run, factory = workspace
    await add_chapters(factory)
    await answer(service, run)
    claim = await claim_job(service)
    changed = False

    async def change_answer():
        nonlocal changed
        if not changed:
            changed = True
            await answer(service, run, 180000)

    await run_update_job(
        service,
        *claim,
        ca_session_factory=factory,
        draft_service=fake_draft_service(factory, during_generation=change_answer),
    )
    async with factory() as session:
        job = await session.get(DocumentUpdateJob, claim[0])
        assert job.status == "superseded"
        assert len(list(await session.scalars(select(ConceptNoteChapterRevision)))) == 2
    assert (await service.load(run)).points[0].value == 180000


async def test_empty_requirements_never_report_ready_or_allow_final_export(workspace):
    service, run, _ = workspace
    configured = template()
    for chapter in configured.chapter_schema:
        chapter["required_fields"] = []
    run.custom_template["chapter_schema"] = configured.chapter_schema
    await service.reconcile_template(run, configured)
    view = await service.load(run)
    assert not view.setup.ready and not view.points
    assert any(
        "no recognized point requirements" in reason
        for reason in view.export_eligibility.blockers
    )
    with pytest.raises(HTTPException) as error:
        await service.export(
            run, DocumentExportRequest(mode="final", expected_revision=view.revision)
        )
    assert error.value.status_code == 409


async def test_canonical_change_without_prose_rejects_old_validation_for_confirm_and_final(
    workspace,
):
    from app.persistence.concept_notes.workspace import WorkspaceConflictError

    service, run, factory = workspace
    await add_chapters(factory)
    await answer(service, run)
    claim = await claim_job(service)
    await run_update_job(
        service,
        *claim,
        ca_session_factory=factory,
        draft_service=fake_draft_service(factory),
    )
    await validate_and_confirm_chapters(factory, run.run_id)
    assert (await service.load(run)).export_eligibility.final
    await answer(service, run, 180000)
    async with factory() as session, session.begin():
        point = await session.scalar(
            select(DocumentPoint).where(DocumentPoint.active.is_(True))
        )
        # Model output can be unchanged. Even when dependencies report applied,
        # the old validation cannot authorize changed canonical facts or policy.
        for dependency in await session.scalars(select(DocumentDependency)):
            dependency.applied_version = point.accepted_version
        chapter = await session.scalar(select(ConceptNoteChapter).limit(1))
        latest = await session.scalar(
            select(ConceptNoteChapterRevision)
            .where(ConceptNoteChapterRevision.chapter_id == chapter.chapter_id)
            .order_by(ConceptNoteChapterRevision.revision_number.desc())
            .limit(1)
        )
    with pytest.raises(WorkspaceConflictError, match="validation is missing or stale"):
        await ConceptNoteWorkspaceRepository(factory).confirm_chapter(
            run_id=run.run_id,
            chapter_id=chapter.chapter_id,
            expected_revision=latest.revision_number,
            idempotency_key=uuid4(),
            user_id="owner",
        )
    view = await service.load(run)
    assert view.points[0].freshness == "current"
    assert not view.export_eligibility.final
    assert any(
        "validation is missing or stale" in blocker
        for blocker in view.export_eligibility.blockers
    )
    with pytest.raises(HTTPException) as error:
        await service.export(
            run, DocumentExportRequest(mode="final", expected_revision=view.revision)
        )
    assert error.value.status_code == 409


async def test_final_export_uses_current_locked_revisions_and_detects_unseen_manual_edit(
    workspace,
):
    service, run, factory = workspace
    await add_chapters(factory)
    await answer(service, run)
    claim = await claim_job(service)
    await run_update_job(
        service,
        *claim,
        ca_session_factory=factory,
        draft_service=fake_draft_service(factory),
    )
    await validate_and_confirm_chapters(factory, run.run_id)
    view = await service.load(run)
    assert view.export_eligibility.final
    exported = await service.export(
        run, DocumentExportRequest(mode="final", expected_revision=view.revision)
    )
    async with factory() as session, session.begin():
        stored = await session.get(DocumentExport, UUID(exported.export_id))
        assert len(stored.chapter_revisions) == 2
        assert "125000" in stored.body_markdown
        chapter = await session.scalar(select(ConceptNoteChapter).limit(1))
        session.add(
            ConceptNoteChapterRevision(
                chapter_id=chapter.chapter_id,
                revision_number=3,
                author_type="user",
                change_type="edit_text",
                body_markdown="Changed after review",
                patch_summary={},
            )
        )
    with pytest.raises(HTTPException) as error:
        await service.export(
            run, DocumentExportRequest(mode="final", expected_revision=view.revision)
        )
    assert error.value.status_code == 409


async def test_source_validator_blocks_confirmation_without_mutating_the_point(
    workspace,
):
    service, run, factory = workspace
    point = (await service.load(run)).points[0]
    candidate_id = uuid4()
    async with factory() as session, session.begin():
        session.add(
            DocumentCandidate(
                candidate_id=candidate_id,
                point_id=UUID(point.point_id),
                fingerprint="3" * 64,
                value=150000,
                citations=[
                    {
                        "source_label": "Budget",
                        "quote": "150000",
                        "page_number": 1,
                        "source_anchor": None,
                    }
                ],
                source_identity={"upload_id": str(uuid4()), "sha256": "1" * 64},
                status="pending",
            )
        )

    async def unavailable(identities):
        assert len(identities) == 1
        raise HTTPException(409, "Source unavailable")

    with pytest.raises(HTTPException) as error:
        await service.command(
            run,
            point.key,
            DocumentPointCommand(
                command="confirm_candidate",
                expected_version=point.version,
                idempotency_key="unavailable",
                candidate_id=str(candidate_id),
            ),
            user_id="owner",
            source_validator=unavailable,
        )
    assert error.value.status_code == 409
    after = (await service.load(run)).points[0]
    assert after.status == "needs_confirmation" and after.value is None


async def test_new_answer_invalidates_old_proposal_and_review_application_marks_fresh(
    workspace, monkeypatch
):
    from app.models.cnb.concept_note_edits import EditApplyRequest
    from app.persistence.concept_notes.edits import ConceptNoteEditRepository

    service, run, factory = workspace
    await add_chapters(factory, protected=True)
    await answer(service, run)
    old_claim = await claim_job(service)
    await run_update_job(
        service,
        *old_claim,
        ca_session_factory=factory,
        draft_service=fake_draft_service(factory),
    )
    await answer(service, run, 180000)
    async with factory() as session:
        assert all(
            proposal.status == "stale"
            for proposal in await session.scalars(select(ConceptNoteEditProposal))
        )
        assert (
            await session.get(DocumentUpdateJob, old_claim[0])
        ).status == "superseded"
    claim = await claim_job(service)
    await run_update_job(
        service,
        *claim,
        ca_session_factory=factory,
        draft_service=fake_draft_service(factory),
    )
    async with factory() as session:
        proposals = list(
            await session.scalars(
                select(ConceptNoteEditProposal).where(
                    ConceptNoteEditProposal.status == "proposed"
                )
            )
        )
    # SQLite has no advisory locks; exercise the real apply transaction while
    # the separate Postgres fixture covers the actual serialization primitive.
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
    await refresh_reviews(service)
    assert (await service.load(run)).points[0].freshness == "current"


async def test_reconcile_retains_compatible_values_and_retires_changed_unit_with_history(
    workspace,
):
    service, run, factory = workspace
    await answer(service, run)
    configured = template()
    configured.name = "Updated guidance"
    await service.reconcile_template(run, configured)
    assert (await service.load(run)).points[0].value == 125000
    for chapter in configured.chapter_schema:
        chapter["required_fields"][0]["unit"] = "USD"
    await service.reconcile_template(run, configured)
    point = (await service.load(run)).points[0]
    assert point.value is None and point.status == "missing"
    await service.clear_setup(run)
    async with factory() as session:
        assert not list(
            await session.scalars(
                select(DocumentPoint).where(DocumentPoint.active.is_(True))
            )
        )
        assert len(list(await session.scalars(select(DocumentSetupSnapshot)))) == 3
        assert len(list(await session.scalars(select(DocumentPointRevision)))) >= 4


async def test_choice_values_are_projected_and_validated_without_a_model_call(
    workspace,
):
    service, run, _ = workspace
    configured = template()
    for chapter in configured.chapter_schema:
        chapter["required_fields"] = [
            {
                "key": "delivery_mode",
                "label": "Delivery mode",
                "answer_type": "choice",
                "options": [
                    {"label": "City delivery"},
                    {"value": "Joint delivery", "label": "Partnership"},
                ],
            }
        ]
    run.custom_template["chapter_schema"] = configured.chapter_schema
    await service.reconcile_template(run, configured)
    point = (await service.load(run)).points[0]
    assert point.choices == ["City delivery", "Joint delivery"]
    with pytest.raises(HTTPException) as error:
        await service.command(
            run,
            point.key,
            DocumentPointCommand(
                command="answer",
                expected_version=point.version,
                idempotency_key="invented-choice",
                value="Other option",
            ),
            user_id="owner",
        )
    assert error.value.status_code == 422
    accepted = await service.command(
        run,
        point.key,
        DocumentPointCommand(
            command="answer",
            expected_version=point.version,
            idempotency_key="known-choice",
            value="City delivery",
        ),
        user_id="owner",
    )
    assert accepted.point.value == "City delivery"


async def test_reconciler_does_not_open_storage_when_cnb_is_unconfigured(monkeypatch):
    from app.services.document_workspace.jobs import run_document_workspace_reconciler

    factory = MagicMock(side_effect=AssertionError("Storage must not be initialized"))
    monkeypatch.setattr(
        "app.services.document_workspace.jobs.get_settings",
        lambda: SimpleNamespace(cnb_database_url=None, database_url="configured-ca"),
    )
    monkeypatch.setattr(
        "app.services.document_workspace.jobs.DocumentWorkspaceService", factory
    )
    await run_document_workspace_reconciler()
    factory.assert_not_called()


@pytest.mark.parametrize("shared_finance_target", [False, True])
async def test_answer_during_another_update_never_loses_other_chapter_targets(
    workspace, shared_finance_target
):
    service, run, factory = workspace
    await add_chapters(factory)
    configured = ApplicationContextTemplate(
        id=uuid4(),
        name="Independent and shared targets",
        chapter_schema=[
            {
                "chapter_ref": "summary",
                "title": "Summary",
                "required": True,
                "required_fields": [
                    {"key": "summary_amount", "label": "Summary amount"}
                ],
            },
            {
                "chapter_ref": "finance",
                "title": "Finance",
                "required": True,
                "required_fields": [{"key": "finance_owner", "label": "Finance owner"}]
                + (
                    [{"key": "summary_amount", "label": "Summary amount"}]
                    if shared_finance_target
                    else []
                ),
            },
        ],
    )
    await service.reconcile_template(run, configured)

    async def accept(key, value):
        point = next(
            item for item in (await service.load(run)).points if item.key == key
        )
        await service.command(
            run,
            key,
            DocumentPointCommand(
                command="answer",
                value=value,
                expected_version=point.version,
                idempotency_key=str(uuid4()),
            ),
            user_id="owner",
        )

    await accept("summary_amount", "125000")
    first_claim = await claim_job(service)
    changed = False

    async def generate(payload):
        nonlocal changed
        if not changed:
            changed = True
            await accept("finance_owner", "Treasury")
        values = {point["key"]: point["value"] for point in payload["canonical_points"]}
        return ConceptNoteChapterDraftOutput(
            body_markdown=f"## {payload['chapter']['title']}\n\n{json.dumps(values)}"
        )

    draft_service = fake_draft_service(factory)
    draft_service._generate_chapter = generate
    await run_update_job(
        service, *first_claim, ca_session_factory=factory, draft_service=draft_service
    )
    async with factory() as session:
        job = await session.get(DocumentUpdateJob, first_claim[0])
        assert job.status == ("queued" if shared_finance_target else "complete")
        if shared_finance_target:
            # Neither stale result from the original two-chapter job was saved.
            assert (
                len(list(await session.scalars(select(ConceptNoteChapterRevision))))
                == 2
            )
    for _ in range(3):
        claim = await claim_job(service)
        if claim is None:
            break
        await run_update_job(
            service, *claim, ca_session_factory=factory, draft_service=draft_service
        )
    view = await service.load(run)
    assert all(point.freshness == "current" for point in view.points)
    assert await claim_job(service) is None
    chapters = await draft_service._workspace.list_chapters(run_id=run.run_id)
    assert (
        "125000"
        in next(
            chapter for chapter in chapters if chapter.chapter_ref == "summary"
        ).body_markdown
    )
    assert (
        "Treasury"
        in next(
            chapter for chapter in chapters if chapter.chapter_ref == "finance"
        ).body_markdown
    )


async def test_accepting_a_point_in_another_chapter_keeps_review_proposal_valid(
    workspace, monkeypatch
):
    from app.models.cnb.concept_note_edits import EditApplyRequest
    from app.persistence.concept_notes.edits import ConceptNoteEditRepository

    service, run, factory = workspace
    await add_chapters(factory, protected=True)
    configured = ApplicationContextTemplate(
        id=uuid4(),
        name="Independent reviews",
        chapter_schema=[
            {
                "chapter_ref": ref,
                "title": ref.title(),
                "required_fields": [{"key": f"{ref}_value", "label": f"{ref} value"}],
            }
            for ref in ("summary", "finance")
        ],
    )
    await service.reconcile_template(run, configured)
    for key in ("summary_value", "finance_value"):
        point = next(
            item for item in (await service.load(run)).points if item.key == key
        )
        await service.command(
            run,
            key,
            DocumentPointCommand(
                command="answer",
                expected_version=point.version,
                idempotency_key=str(uuid4()),
                value="Confirmed",
            ),
            user_id="owner",
        )
        if key == "summary_value":
            claim = await claim_job(service)
            draft_service = fake_draft_service(factory)
            await run_update_job(
                service, *claim, ca_session_factory=factory, draft_service=draft_service
            )
    async with factory() as session:
        [proposal] = list(await session.scalars(select(ConceptNoteEditProposal)))
        assert proposal.status == "proposed"
    monkeypatch.setattr("app.persistence.concept_notes.edits.lock_run", AsyncMock())
    await ConceptNoteEditRepository(factory).apply(
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
    await refresh_reviews(service)
    summary = next(
        point
        for point in (await service.load(run)).points
        if point.key == "summary_value"
    )
    assert summary.freshness == "current"


async def test_fallback_canonical_key_survives_initial_draft_and_resolves_matching_gap(
    workspace,
):
    from app.models.cnb.concept_note_draft import ConceptNoteDraftGapOutput
    from app.persistence.concept_notes.workspace import normalize_template_chapters

    service, run, factory = workspace
    configured = ApplicationContextTemplate(
        id=uuid4(),
        name="Legacy string fields",
        chapter_schema=[
            {
                "chapter_ref": "summary",
                "title": "Summary",
                "required": True,
                "required_fields": ["Requested budget"],
            }
        ],
    )
    await service.reconcile_template(run, configured)
    point = (await service.load(run)).points[0]
    assert "." in point.key and str(configured.id) not in point.key
    repository = ConceptNoteWorkspaceRepository(factory)
    await repository.ensure_template_chapters(
        run_id=run.run_id,
        chapters=normalize_template_chapters(configured.chapter_schema),
    )
    [chapter] = await repository.list_chapters(run_id=run.run_id)
    question = "What is the requested budget?"
    gap = ConceptNoteDraftGapOutput(
        field_key=point.key,
        question=question,
        why_asking="The funding section needs the budget.",
        severity="critical",
    )
    assert await repository.save_generated_chapter(
        chapter_id=chapter.chapter_id,
        body_markdown=f"[Information needed: {question}]",
        missing_information=[gap],
        point_versions={point.key: 0},
    )
    await service.command(
        run,
        point.key,
        DocumentPointCommand(
            command="answer",
            expected_version=point.version,
            idempotency_key=str(uuid4()),
            value="125000",
        ),
        user_id="owner",
    )
    claim = await claim_job(service)
    await run_update_job(
        service,
        *claim,
        ca_session_factory=factory,
        draft_service=fake_draft_service(factory),
    )
    [updated] = await repository.list_chapters(run_id=run.run_id)
    assert (
        "125000" in updated.body_markdown
        and "Information needed" not in updated.body_markdown
    )
    assert (
        updated.gaps[0].field_key == point.key and updated.gaps[0].state == "resolved"
    )
