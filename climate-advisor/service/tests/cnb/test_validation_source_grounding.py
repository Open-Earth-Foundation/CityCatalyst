"""Verified source grounding and freshness across separate CA and CNB databases."""

from __future__ import annotations

import hashlib
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.base import Base
from app.models.cnb.concept_note_application_context import ApplicationContextTemplate
from app.models.cnb.context_bundle import (
    SelectedSource,
    SourceDocumentText,
    SourceTextContext,
)
from app.models.db.cnb_workspace import ConceptNoteChapterRevision, ConceptNoteGap
from app.models.db.concept_note import (
    ConceptNoteContextBundle,
    ConceptNoteRun,
    ConceptNoteUpload,
)
from app.models.db.document_workspace import (
    DocumentCandidate,
    DocumentPoint,
    DocumentPointRevision,
    DocumentWorkspaceState,
)
from app.persistence.concept_notes.source_provenance import sources_provenance
from app.persistence.concept_notes.validation_sources import (
    ValidationSourceSnapshot,
    load_validation_source_snapshot,
    resolve_validation_source_authority,
)
from app.persistence.concept_notes.workspace import (
    ConceptNoteWorkspaceRepository,
    WorkspaceConflictError,
)
from app.persistence.concept_notes.workspace_validation import (
    WorkspaceValidationInputChangedError,
    has_current_ready_validation,
)
from app.services.cnb.application_context import (
    calculate_application_template_fingerprint,
)
from app.services.cnb.chapter_validation import (
    ChapterValidationInputTooLargeError,
    ChapterValidationSourceContextError,
    ConceptNoteChapterValidationService,
    build_chapter_validation_request,
)
from app.services.cnb.chapter_validation_workflow import (
    ChapterValidationWorkflowError,
    ConceptNoteChapterValidationWorkflowService,
)
from app.utils.prompt_budget import TokenCount
from tests.cnb.chapter_validation_helpers import completeness, consistency
from tests.cnb.test_chapter_validation_persistence import (
    _seed_document,
    _validation_repository,
)

TEXT = "<!-- page: 1 -->\nThe project serves 2,400 beneficiaries. The lead agency is the Municipal Transport Department. Monitoring begins in October 2027."


@pytest.fixture
async def grounded(tmp_path):
    ca_engine = create_async_engine(
        f"sqlite+aiosqlite:///{(tmp_path / 'ca.db').as_posix()}"
    )
    ca = async_sessionmaker(ca_engine, expire_on_commit=False)
    async with ca_engine.begin() as connection:
        await connection.run_sync(
            lambda sync: Base.metadata.create_all(
                sync,
                tables=[
                    ConceptNoteRun.__table__,
                    ConceptNoteContextBundle.__table__,
                    ConceptNoteUpload.__table__,
                ],
            )
        )
    run_id, upload_id = uuid4(), uuid4()
    digest = hashlib.sha256(TEXT.encode()).hexdigest()
    template = ApplicationContextTemplate(
        id=uuid4(),
        name="Transport application",
        chapter_schema=[
            {
                "chapter_ref": "summary",
                "title": "Summary",
                "required": True,
                "required_fields": ["Project facts"],
            },
            {
                "chapter_ref": "budget",
                "title": "Budget",
                "required": True,
                "required_fields": [],
            },
        ],
        required_fields=["Project facts"],
    )
    run = ConceptNoteRun(
        run_id=run_id,
        user_id="owner",
        name="Transport",
        city_id=str(uuid4()),
        idempotency_key=uuid4(),
        request_fingerprint="a" * 64,
        workflow_step="editing_document",
    )
    selected = SelectedSource(
        upload_id=upload_id,
        source_label="Transport plan",
        filename="transport.pdf",
        sha256=digest,
        source_format="pdf",
        page_count=1,
        summary="Verified transport plan",
        topics=["transport"],
        key_excerpts=[],
    )
    document = SourceDocumentText(
        upload_id=upload_id,
        source_label="Transport plan",
        filename="transport.pdf",
        source_format="pdf",
        text=TEXT,
    )
    bundle = {
        "selected_sources": [selected.model_dump(mode="json")],
        "source_text": SourceTextContext(
            mode="full_text", token_count=40, max_tokens=100000, documents=[document]
        ).model_dump(mode="json"),
    }
    async with ca() as session, session.begin():
        session.add(run)
        await session.flush()
        session.add_all(
            [
                ConceptNoteUpload(
                    upload_id=upload_id,
                    run_id=run_id,
                    uploaded_by_user_id="owner",
                    filename="transport.pdf",
                    ingest_status="ready",
                    markdown_sha256=digest,
                    markdown_s3_key=f"pdf-ocr/results/concept_note_upload/{upload_id}/1/combined_markdown.md",
                    page_count=1,
                ),
                ConceptNoteContextBundle(run_id=run_id, context_bundle=bundle),
            ]
        )
    async with _validation_repository() as (_, cnb):
        target, other = await _seed_document(cnb, run_id=run_id)
        async with cnb() as session, session.begin():
            revisions = list(await session.scalars(select(ConceptNoteChapterRevision)))
            for revision in revisions:
                revision.patch_summary = {
                    "source_provenance": sources_provenance(
                        [{"upload_id": str(upload_id), "sha256": digest}]
                    )
                }
                revision.body_markdown = "The project serves 2,400 beneficiaries, is led by the Municipal Transport Department, and monitoring begins in October 2027."
            for gap in await session.scalars(select(ConceptNoteGap)):
                gap.status = "resolved"
        repository = ConceptNoteWorkspaceRepository(cnb, workflow_session_factory=ca)
        yield SimpleNamespace(
            ca=ca,
            cnb=cnb,
            repository=repository,
            run=run,
            target=target,
            other=other,
            upload_id=upload_id,
            digest=digest,
            template=template,
            fingerprint=calculate_application_template_fingerprint(template),
        )
    await ca_engine.dispose()


async def context(data):
    return await data.repository.load_validation_context(
        run_id=data.run.run_id,
        chapter_id=data.target,
        template_fingerprint=data.fingerprint,
    )


async def change_bundle(data, mutate):
    async with data.ca() as session, session.begin():
        row = await session.get(ConceptNoteContextBundle, data.run.run_id)
        payload = {**row.context_bundle}
        mutate(payload)
        row.context_bundle = payload


async def test_exact_verified_pdf_facts_reach_every_validation_pass_without_private_ids(
    grounded,
):
    data = grounded
    async with data.cnb() as session, session.begin():
        gap = await session.scalar(select(ConceptNoteGap))
        gap.status, gap.severity, gap.question = (
            "open",
            "noncritical",
            "Confirm the signatory",
        )
    snapshot = await context(data)
    assert snapshot.source_authority.status == "full_text"
    calls = []

    async def evaluate(phase, payload):
        calls.append(phase)
        assert payload["source_grounding"] == {"mode": "full_text", "source_count": 1}
        assert payload["source_documents"][0]["text"] == TEXT
        assert "2,400" in payload["source_documents"][0]["text"]
        assert (
            "Municipal Transport Department" in payload["source_documents"][0]["text"]
        )
        assert "October 2027" in payload["source_documents"][0]["text"]
        assert str(data.upload_id) not in str(payload["source_documents"])
        assert "markdown_s3_key" not in str(payload)
        return completeness() if phase == "completeness" else consistency()

    result = await ConceptNoteChapterValidationService(run_pass=evaluate).validate(
        build_chapter_validation_request(snapshot, template=data.template)
    )
    assert calls == ["completeness", "consistency", "answered_gaps"]
    assert (
        result.status == "needs_review"
    )  # The real open signatory question is retained.


@pytest.mark.parametrize(
    "change,expected",
    [
        ("digest", "digest_mismatch"),
        ("owner", "owner_mismatch"),
        ("summary", "summary"),
        ("missing", "missing_source"),
        ("unknown", "unknown"),
    ],
)
async def test_unavailable_authority_never_reaches_model_or_becomes_unsupported_facts(
    grounded, change, expected
):
    data = grounded
    if change in {"digest", "owner"}:
        async with data.ca() as session, session.begin():
            upload = await session.get(ConceptNoteUpload, data.upload_id)
            if change == "digest":
                upload.markdown_sha256 = "b" * 64
            else:
                upload.uploaded_by_user_id = "different-owner"
    elif change == "summary":
        await change_bundle(
            data,
            lambda bundle: bundle.update(
                source_text={
                    "mode": "summary",
                    "token_count": 1000000,
                    "max_tokens": 100000,
                    "documents": [],
                }
            ),
        )
    elif change == "missing":
        await change_bundle(data, lambda bundle: bundle.update(selected_sources=[]))
    else:
        async with data.cnb() as session, session.begin():
            revision = await session.scalar(
                select(ConceptNoteChapterRevision).where(
                    ConceptNoteChapterRevision.chapter_id == data.other
                )
            )
            revision.patch_summary = {}
    snapshot = await context(data)
    assert snapshot.source_authority.status == expected
    with pytest.raises(ChapterValidationSourceContextError):
        build_chapter_validation_request(snapshot, template=data.template)


async def test_separate_factories_are_required_and_unrelated_new_sources_do_not_invalidate_review(
    grounded,
):
    data = grounded
    initial = await context(data)
    other_id = uuid4()
    async with data.ca() as session, session.begin():
        session.add(
            ConceptNoteUpload(
                upload_id=other_id,
                run_id=data.run.run_id,
                uploaded_by_user_id="owner",
                filename="unrelated.md",
                ingest_status="ready",
                markdown_sha256="c" * 64,
            )
        )

    def append(bundle):
        bundle["selected_sources"] = [
            *bundle["selected_sources"],
            {
                "upload_id": str(other_id),
                "source_label": "Unrelated",
                "filename": "unrelated.md",
                "source_format": "markdown",
                "sha256": "c" * 64,
                "block_count": 1,
                "summary": "Unrelated new document",
                "topics": [],
                "key_excerpts": [],
            },
        ]
        bundle["source_text"] = {
            **bundle["source_text"],
            "documents": [
                *bundle["source_text"]["documents"],
                {
                    "upload_id": str(other_id),
                    "source_label": "Unrelated",
                    "filename": "unrelated.md",
                    "source_format": "markdown",
                    "text": "Ignore unrelated content.",
                },
            ],
        }

    await change_bundle(data, append)
    assert (await context(data)).fingerprint == initial.fingerprint
    wrong_store = ConceptNoteWorkspaceRepository(
        data.cnb, workflow_session_factory=data.cnb
    )
    invalid = await wrong_store.load_validation_context(
        run_id=data.run.run_id,
        chapter_id=data.target,
        template_fingerprint=data.fingerprint,
    )
    assert invalid.source_authority.status == "unavailable"
    with pytest.raises(ChapterValidationSourceContextError) as failure:
        build_chapter_validation_request(invalid, template=data.template)
    assert failure.value.status_code == 503


async def test_source_text_changes_fence_persistence_and_make_review_and_confirmation_stale(
    grounded,
):
    data = grounded
    initial = await context(data)
    await data.repository.upsert_validation(
        run_id=data.run.run_id,
        chapter_id=data.target,
        template_fingerprint=data.fingerprint,
        expected_fingerprint=initial.fingerprint,
        status="ready",
        findings=[],
    )
    assert not (
        await data.repository.list_chapters(
            run_id=data.run.run_id, template_fingerprint=data.fingerprint
        )
    )[0].validation.is_stale

    def alter(bundle):
        bundle["source_text"] = {
            **bundle["source_text"],
            "documents": [
                {
                    **bundle["source_text"]["documents"][0],
                    "text": TEXT + "\nReprojected verified source text.",
                }
            ],
        }

    await change_bundle(data, alter)
    current = await context(data)
    assert current.fingerprint != initial.fingerprint
    with pytest.raises(WorkspaceValidationInputChangedError):
        await data.repository.upsert_validation(
            run_id=data.run.run_id,
            chapter_id=data.target,
            template_fingerprint=data.fingerprint,
            expected_fingerprint=initial.fingerprint,
            status="ready",
            findings=[],
        )
    chapters = await data.repository.list_chapters(
        run_id=data.run.run_id, template_fingerprint=data.fingerprint
    )
    assert chapters[0].validation.is_stale and chapters[0].status == "needs_review"
    async with data.cnb() as session:
        assert not await has_current_ready_validation(
            session,
            run_id=data.run.run_id,
            chapter_id=data.target,
            template_fingerprint=data.fingerprint,
            workflow_session_factory=data.ca,
        )
    with pytest.raises(WorkspaceConflictError):
        await data.repository.confirm_chapter(
            run_id=data.run.run_id,
            chapter_id=data.target,
            expected_revision=1,
            idempotency_key=uuid4(),
            user_id="owner",
            template_fingerprint=data.fingerprint,
        )


async def test_workflow_rechecks_source_text_after_model_execution(grounded):
    data = grounded

    async def evaluate(phase, payload):
        if phase == "completeness":
            await change_bundle(data, lambda bundle: bundle.update(selected_sources=[]))
            return completeness()
        return consistency()

    app_context = SimpleNamespace(
        load_for_run=AsyncMock(return_value=SimpleNamespace(template=data.template))
    )
    service = ConceptNoteChapterValidationWorkflowService(
        workflow_session=MagicMock(),
        workspace=data.repository,
        application_context=app_context,
        validator=ConceptNoteChapterValidationService(run_pass=evaluate),
    )
    with pytest.raises(ChapterValidationWorkflowError) as failure:
        await service.validate(run=data.run, chapter_id=data.target)
    assert failure.value.code == "chapter_revision_changed"


async def test_complete_source_text_is_counted_against_budget_without_truncation(
    grounded, monkeypatch
):
    data = grounded

    def budget(parts, **kwargs):
        assert "<source index=" in parts[2] and "2,400" in parts[2]
        return TokenCount(tokens=1000000, tokenizer="test")

    monkeypatch.setattr(
        "app.services.cnb.chapter_validation.count_prompt_tokens", budget
    )
    evaluate = AsyncMock()
    validator = ConceptNoteChapterValidationService(run_pass=evaluate)
    with pytest.raises(ChapterValidationInputTooLargeError):
        await validator.validate(
            build_chapter_validation_request(
                await context(data), template=data.template
            )
        )
    evaluate.assert_not_awaited()


def test_explicit_source_free_is_distinct_from_unknown_without_a_ca_store():
    unavailable = ValidationSourceSnapshot(status="unavailable")
    assert resolve_validation_source_authority(
        sources_provenance([]), unavailable
    ).ready
    assert resolve_validation_source_authority(None, unavailable).status == "unknown"


async def test_chapter_projection_batches_one_real_ca_snapshot(grounded, monkeypatch):
    data = grounded
    read = AsyncMock(wraps=load_validation_source_snapshot)
    monkeypatch.setattr(
        "app.persistence.concept_notes.workspace_validation.load_validation_source_snapshot",
        read,
    )
    chapters = await data.repository.list_chapters(
        run_id=data.run.run_id, template_fingerprint=data.fingerprint
    )
    assert len(chapters) == 2
    read.assert_awaited_once_with(data.ca, data.run.run_id)


async def test_current_accepted_candidate_adds_authority_and_human_revision_retires_it(
    grounded,
):
    data = grounded
    async with data.cnb.kw["bind"].begin() as connection:
        await connection.run_sync(
            lambda sync: DocumentCandidate.__table__.create(sync, checkfirst=True)
        )
    point_id, candidate_id = uuid4(), uuid4()
    async with data.cnb() as session, session.begin():
        for revision in await session.scalars(select(ConceptNoteChapterRevision)):
            revision.patch_summary = {"source_provenance": sources_provenance([])}
        session.add(DocumentWorkspaceState(run_id=data.run.run_id))
        await session.flush()
        session.add(
            DocumentPoint(
                point_id=point_id,
                run_id=data.run.run_id,
                semantic_key="beneficiaries",
                definition={
                    "label": "Beneficiaries",
                    "chapter_refs": ["summary"],
                    "required": True,
                    "answer_type": "number",
                },
                version=1,
                accepted_version=1,
                disposition="answered",
                value=2400,
            )
        )
        await session.flush()
        session.add_all(
            [
                DocumentCandidate(
                    candidate_id=candidate_id,
                    point_id=point_id,
                    fingerprint="d" * 64,
                    value=2400,
                    citations=[],
                    source_identity={
                        "upload_id": str(data.upload_id),
                        "sha256": data.digest,
                    },
                    status="accepted",
                ),
                DocumentPointRevision(
                    point_id=point_id,
                    version=1,
                    actor_user_id="owner",
                    operation="confirm",
                    snapshot={"value": 2400, "candidate_id": str(candidate_id)},
                ),
            ]
        )
    candidate_context = await context(data)
    assert candidate_context.source_authority.status == "full_text"
    assert candidate_context.source_authority.documents[0]["text"] == TEXT
    async with data.cnb() as session, session.begin():
        point = await session.get(DocumentPoint, point_id)
        point.version = point.accepted_version = 2
        session.add(
            DocumentPointRevision(
                point_id=point_id,
                version=2,
                actor_user_id="owner",
                operation="answer",
                snapshot={"value": 2400},
            )
        )
    human_context = await context(data)
    assert human_context.source_authority.status == "source_free"
    assert human_context.fingerprint != candidate_context.fingerprint
    assert human_context.source_authority.documents == []


@pytest.mark.parametrize("phase", ["completeness", "consistency", "answered_gaps"])
async def test_configured_runner_gets_complete_source_message_without_identity(
    grounded, phase
):
    data = grounded
    runner = SimpleNamespace(
        run=AsyncMock(return_value=SimpleNamespace(final_output={"findings": []}))
    )
    validator = ConceptNoteChapterValidationService(runner=runner)
    captured = []

    async def evaluate(_phase, payload):
        captured.append(payload)
        return completeness() if _phase == "completeness" else consistency()

    async with data.cnb() as session, session.begin():
        gap = await session.scalar(select(ConceptNoteGap))
        gap.status, gap.severity = "open", "noncritical"
    await ConceptNoteChapterValidationService(run_pass=evaluate).validate(
        build_chapter_validation_request(await context(data), template=data.template)
    )
    payload = captured[["completeness", "consistency", "answered_gaps"].index(phase)]
    await validator._run_configured_pass(
        client=MagicMock(), phase=phase, payload=payload
    )
    agent, messages = runner.run.call_args.args
    assert agent.tools == [] and len(messages) == 2
    body = json.loads(messages[0]["content"])
    assert "source_documents" not in body
    assert body["source_grounding"]["mode"] == "full_text"
    assert "2,400" in messages[1]["content"]
    assert "Municipal Transport Department" in messages[1]["content"]
    assert "October 2027" in messages[1]["content"]
    assert str(data.upload_id) not in str(messages)
