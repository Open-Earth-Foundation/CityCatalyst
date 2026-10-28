"""Adding funders to the CNB catalogue from a document upload or by hand."""

import asyncio
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from hashlib import sha256
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from app.db.session import get_session
from app.main import get_app
from app.routes.dependencies import authorized_run
from app.models.cnb.funder_creation import (
    FieldEvidence,
    FunderCreateRequest,
    FunderDocumentExtraction,
    FunderImport,
    FunderImportDraft,
    FunderImportStatus,
)
from app.models.db.cnb_reference import CnbFundingEvidence, CnbSourceDocument
from app.models.db.concept_note import (
    ConceptNoteContextBundle,
    ConceptNoteRun,
    ConceptNoteUpload,
)
from app.services.citycatalyst_client import ConceptNoteMarkdownArtifact
from app.services.cnb import funder_creation as service
from app.config import get_settings
from app.services.cnb.funder_creation import (
    create_funder,
    load_funder_import,
    run_funder_import,
    start_funder_import,
)
from app.services.cnb.funder_document import (
    FunderImportError,
    build_draft,
    extract_funder_draft,
)
from app.services.cnb.funding_catalogue import load_funding_catalogue
from app.services.cnb.source_analysis import SourceBlock, SourcePage
from fastapi import HTTPException
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from tests.cnb.test_funder_creation import _request as _manual_request
from tests.test_concept_note_lifecycle import _ca_session, _workspace_repository

PAGES = [
    SourcePage(
        number=1, text="\nGreen Cities Foundation\nNature-Based Cities Call 2026\n"
    ),
    SourcePage(
        number=2,
        text="\nWe award   grants of USD 150,000 to 600,000 per project.\n"
        "Section 1. Applicant details\n",
    ),
]


def _extraction(
    *, opportunity: dict | None = None, template: dict | None = None
) -> FunderDocumentExtraction:
    """Model output with every field set; section overrides replace keys."""
    return FunderDocumentExtraction.model_validate(
        {
            "funder": {
                "name": "Green Cities Foundation",
                "funder_type": "Private foundation",
                "country": None,
                "region": None,
                "stated_facts": [{"key": "purpose", "value": "Nature for cities"}],
                "derived_facts": [],
            },
            "opportunity": {
                "name": "Nature-Based Cities Call 2026",
                "applicant_type": None,
                "category": None,
                "sector": None,
                "hazards": ["Flooding", " Flooding ", ""],
                "interventions": [],
                "finance_route": None,
                "instrument_type": None,
                "region_scope": None,
                "min_award": 150000,
                "max_award": 600000,
                "currency": "USD",
                "status": None,
                "summary": None,
                "known_gaps": [],
                **(opportunity or {}),
            },
            "template": {
                "template_name": "Proposal form",
                "output_format": None,
                "chapters": [
                    {
                        "chapter_ref": "Applicant Details",
                        "title": "Applicant details",
                        "description": None,
                        "required": True,
                        "required_fields": ["municipality_name"],
                    },
                    {
                        "chapter_ref": "applicant-details",
                        "title": "Budget",
                        "description": None,
                        "required": True,
                        "required_fields": ["budget_total", "municipality_name"],
                    },
                ],
                **(template or {}),
            },
            "evidence": [
                {"field": "funder.name", "quote": "Green Cities Foundation"},
                {
                    "field": "opportunity.min_award",
                    "quote": "grants of USD 150,000 to 600,000 per project",
                },
                {"field": "funder.country", "quote": "Green Cities Foundation"},
                {"field": "opportunity.name", "quote": "Invented quote"},
                {
                    "field": "template.chapter_schema.Applicant Details",
                    "quote": "Section 1. Applicant details",
                },
            ],
        }
    )


def _draft() -> FunderImportDraft:
    """A reviewed-ready draft with evidence for name, award and one chapter."""
    return FunderImportDraft(
        **_manual_request().model_dump(exclude={"import_id"}),
        evidence=[
            FieldEvidence(field="funder.name", quote="Green Cities Foundation", page=1),
            FieldEvidence(
                field="funder.funder_type", quote="private foundation", page=1
            ),
            FieldEvidence(field="opportunity.min_award", quote="USD 150,000", page=2),
            FieldEvidence(
                field="template.chapter_schema.applicant-details",
                quote="Section 1. Applicant details",
                page=2,
            ),
        ],
    )


async def _run_with_upload(
    session: AsyncSession, *, ingest_status: str = "ready"
) -> tuple[ConceptNoteRun, ConceptNoteUpload]:
    """Persist an owned run, an empty bundle and one converted upload."""
    run = ConceptNoteRun(
        run_id=uuid4(),
        user_id="owner",
        name="Porto Alegre",
        city_id=str(uuid4()),
        status="active",
        workflow_step="assembling_context",
        context_summary={},
        permission_summary={},
        idempotency_key=uuid4(),
        request_fingerprint="a" * 64,
    )
    session.add(run)
    await session.flush()
    session.add(
        ConceptNoteContextBundle(
            run_id=run.run_id, context_bundle={"cc_context": {"city": {"name": "X"}}}
        )
    )
    upload = ConceptNoteUpload(
        upload_id=uuid4(),
        run_id=run.run_id,
        uploaded_by_user_id="owner",
        filename="Green_Cities_Call_2026.pdf",
        markdown_s3_key="uploads/call.md",
        markdown_sha256=sha256(b"call").hexdigest(),
        page_count=2,
        ingest_status=ingest_status,
    )
    session.add(upload)
    await session.commit()
    return run, upload


async def _store_import(
    session: AsyncSession, run: ConceptNoteRun, value: FunderImport
) -> None:
    """Place an import in the run's bundle as the service would."""
    await service._write_import(session, run.run_id, value)
    await session.commit()


def _ready_import(
    upload: ConceptNoteUpload, *, status: FunderImportStatus = "ready"
) -> FunderImport:
    now = datetime.now(UTC)
    return FunderImport(
        import_id=uuid4(),
        upload_id=upload.upload_id,
        filename=upload.filename,
        status=status,
        draft=_draft() if status == "ready" else None,
        created_at=now,
        updated_at=now,
    )


def _request(
    draft: FunderImportDraft, import_id: UUID | None = None
) -> FunderCreateRequest:
    return FunderCreateRequest(
        funder=draft.funder,
        opportunity=draft.opportunity,
        template=draft.template,
        import_id=import_id,
    )


# --- Draft building -------------------------------------------------------------


def test_build_draft_maps_columns_and_keeps_only_verbatim_quotes():
    draft = build_draft(_extraction(), PAGES)

    assert draft.funder.name == "Green Cities Foundation"
    assert draft.funder.profile.stated == {"purpose": "Nature for cities"}
    assert draft.opportunity.hazards == ["Flooding"]
    assert draft.opportunity.min_award == Decimal("150000")
    # Duplicate model refs become unique slugs.
    assert [c.chapter_ref for c in draft.template.chapter_schema] == [
        "applicant-details",
        "applicant-details-2",
    ]
    evidence = {(item.field, item.page) for item in draft.evidence}
    # Whitespace differences still match; invented quotes and empty fields do not.
    assert evidence == {
        ("funder.name", 1),
        ("opportunity.min_award", 2),
        ("template.chapter_schema.applicant-details", 2),
    }
    assert "funder.country" in draft.missing
    assert "opportunity.name" not in draft.missing
    assert "template.chapter_schema" not in draft.missing


def test_build_draft_drops_inconsistent_award_range_and_flags_it():
    draft = build_draft(_extraction(opportunity={"min_award": 900, "max_award": 100}), PAGES)
    assert draft.opportunity.min_award is None
    assert draft.opportunity.max_award is None
    assert "The award range could not be read consistently." in (
        draft.opportunity.known_gaps
    )


def test_zero_award_is_present_and_retains_saved_evidence():
    extraction = _extraction(opportunity={"min_award": 0})
    quote = "There is no minimum award."
    extraction.evidence[1].quote = quote
    draft = build_draft(extraction, [*PAGES, SourcePage(number=3, text=quote)])
    assert draft.opportunity.min_award == Decimal("0")
    assert "opportunity.min_award" not in draft.missing
    rows = service.evidence_rows(
        draft, _request(draft), opportunity_id=uuid4(), source_document_id=uuid4()
    )
    award = next(row for row in rows if row.claim == "opportunity.min_award")
    assert award.quote_or_summary == quote
    assert award.source_map["origin"] == "extracted"


def test_duplicate_chapter_refs_do_not_assign_quotes_to_another_chapter():
    extraction = _extraction()
    for chapter in extraction.template.chapters:
        chapter.chapter_ref = "section"
    extraction.evidence[-1].field = "template.chapter_schema.section"
    draft = build_draft(extraction, PAGES)
    assert len(draft.template.chapter_schema) == 2
    assert not any(
        item.field.startswith("template.chapter_schema.") for item in draft.evidence
    )
    assert any(item.field == "funder.name" for item in draft.evidence)


def test_build_draft_reports_markdown_quotes_without_page():
    blocks = [SourceBlock(anchor="doc/block-1", text="Green Cities Foundation\n")]
    draft = build_draft(_extraction(template={"chapters": []}), blocks)
    assert FieldEvidence(field="funder.name", quote="Green Cities Foundation") in (
        draft.evidence
    )
    assert "template.chapter_schema" in draft.missing


async def test_extract_rejects_documents_over_the_token_budget():
    settings = get_settings().model_copy(deep=True)
    settings.llm.generation.prompt_budget.cnb_funder_import.max_document_tokens = 1000
    runner = SimpleNamespace(run=AsyncMock())
    pages = [SourcePage(number=1, text="word " * 5000)]
    with pytest.raises(FunderImportError) as error:
        await extract_funder_draft(
            pages,
            filename="call.pdf",
            source_format="pdf",
            settings=settings,
            client=SimpleNamespace(),
            runner=runner,
        )
    assert error.value.code == "document_too_long"
    runner.run.assert_not_awaited()


# --- Adding to the catalogue ------------------------------------------------------


async def test_create_from_import_records_extracted_and_edited_provenance():
    async with _workspace_repository() as (_, factory), _ca_session() as session:
        run, upload = await _run_with_upload(session)
        funder_import = _ready_import(upload)
        await _store_import(session, run, funder_import)

        reviewed = _draft()
        reviewed.funder.funder_type = "Foundation"
        reviewed.opportunity.min_award = None
        created = await create_funder(
            session,
            run,
            _request(reviewed, funder_import.import_id),
            reference_factory=factory,
        )

        async with factory() as reference:
            rows = (await reference.scalars(select(CnbFundingEvidence))).all()
            document = (await reference.scalars(select(CnbSourceDocument))).one()
        origins = {row.claim: row.source_map for row in rows}
        assert origins["funder.name"]["origin"] == "extracted"
        assert origins["funder.funder_type"] == {
            "entity": "funder",
            "field": "funder.funder_type",
            "origin": "edited",
            "page": 1,
            "original_value": "Private foundation",
        }
        # Cleared values keep no evidence.
        assert "opportunity.min_award" not in origins
        assert origins["template.chapter_schema.applicant-details"]["origin"] == (
            "extracted"
        )
        assert all(
            row.funding_opportunity_id == created.funding_opportunity_id
            for row in rows
        )
        assert document.title == upload.filename
        assert document.content_hash == upload.markdown_sha256

        catalogue = await load_funding_catalogue(factory)
        opportunity = catalogue.funders[0].opportunities[0]
        assert opportunity.added_from.kind == "document"
        assert opportunity.added_from.filename == upload.filename
        assert await load_funder_import(session, run) is None

        # The import is consumed, so replaying the same request is rejected.
        with pytest.raises(HTTPException) as replay:
            await create_funder(
                session,
                run,
                _request(reviewed, funder_import.import_id),
                reference_factory=factory,
            )
        assert replay.value.detail["code"] == "funder_import_changed"


@pytest.mark.parametrize(
    "status,kind", [("processing", "funder"), ("ready", "template")]
)
async def test_create_rejects_a_stale_or_wrong_kind_import(status, kind):
    async with _workspace_repository() as (_, factory), _ca_session() as session:
        run, upload = await _run_with_upload(session)
        funder_import = _ready_import(upload).model_copy(
            update={"status": status, "kind": kind}
        )
        await _store_import(session, run, funder_import)
        with pytest.raises(HTTPException) as error:
            await create_funder(
                session,
                run,
                _request(_draft(), funder_import.import_id),
                reference_factory=factory,
            )
        assert error.value.status_code == 409
        assert error.value.detail["code"] == "funder_import_changed"


# --- Import lifecycle ----------------------------------------------------------------


@pytest.mark.parametrize("amount, origin", [(150000, "extracted"), (150001, "edited")])
def test_award_provenance_compares_values_across_browser_decimal_scales(amount, origin):
    draft = build_draft(_extraction(), PAGES)
    # JSON numbers from the form lose the model's trailing decimal zero.
    reviewed = FunderCreateRequest.model_validate(
        {
            **_request(draft).model_dump(mode="json"),
            "opportunity": {
                **draft.opportunity.model_dump(mode="json"),
                "min_award": amount,
            },
        }
    )
    rows = service.evidence_rows(
        draft, reviewed, opportunity_id=uuid4(), source_document_id=uuid4()
    )
    award = next(row for row in rows if row.claim == "opportunity.min_award")
    assert award.source_map["origin"] == origin
    assert award.quote_or_summary == draft.evidence[1].quote


async def test_discard_preserves_a_replacement_and_clears_only_its_own_import():
    async with _ca_session() as session:
        run, upload = await _run_with_upload(session)
        current = _ready_import(upload)
        await _store_import(session, run, current)
        await service.discard_funder_import(session, run, import_id=uuid4())
        assert (await load_funder_import(session, run)).import_id == current.import_id
        await service.discard_funder_import(session, run, import_id=current.import_id)
        assert await load_funder_import(session, run) is None
        bundle = await session.get(ConceptNoteContextBundle, run.run_id)
        assert bundle.context_bundle["cc_context"]["city"]["name"] == "X"


async def test_start_accepts_a_converting_upload_and_allows_one_running_import():
    async with _ca_session() as session:
        run, upload = await _run_with_upload(session, ingest_status="queued")
        with patch.object(service, "schedule_funder_import") as schedule:
            started = await start_funder_import(
                session, run, upload_id=upload.upload_id, token="t"
            )
            assert started.status == "processing"
            schedule.assert_called_once_with(
                run_id=run.run_id, import_id=started.import_id, token="t"
            )
            assert (await load_funder_import(session, run)).stage == "converting"
            with pytest.raises(HTTPException) as running:
                await start_funder_import(
                    session, run, upload_id=upload.upload_id, token="t"
                )
            assert running.value.detail["code"] == "funder_import_running"

            upload.ingest_status = "ready"
            await session.commit()
            assert (await load_funder_import(session, run)).stage == "reading"

        bundle = await session.get(ConceptNoteContextBundle, run.run_id)
        assert bundle.context_bundle["cc_context"]["city"]["name"] == "X"


async def test_abandoned_import_is_reported_failed_and_restarted_on_its_upload():
    async with _ca_session() as session:
        run, upload = await _run_with_upload(session)
        stale = datetime.now(UTC) - timedelta(minutes=2, seconds=1)
        await _store_import(
            session,
            run,
            _ready_import(upload, status="processing").model_copy(
                update={"updated_at": stale}
            ),
        )
        current = await load_funder_import(session, run)
        assert current.status == "failed"
        assert current.error_code == "extraction_interrupted"

        with patch.object(service, "schedule_funder_import") as schedule:
            retried = await start_funder_import(
                session, run, upload_id=upload.upload_id, token="t"
            )
        assert retried.status == "processing"
        assert retried.import_id != current.import_id
        schedule.assert_called_once()


@pytest.mark.parametrize("kind", ["funder", "template"])
async def test_ready_draft_is_preserved_until_explicitly_discarded(kind):
    async with _ca_session() as session:
        run, upload = await _run_with_upload(session)
        current = _ready_import(upload)
        await _store_import(session, run, current)
        with patch.object(service, "schedule_funder_import") as schedule:
            with pytest.raises(HTTPException) as error:
                await start_funder_import(
                    session, run, upload_id=upload.upload_id, token="t", kind=kind
                )
            assert error.value.detail["code"] == "funder_import_pending"
            assert await load_funder_import(session, run) == current
            schedule.assert_not_called()
            await service.discard_funder_import(
                session, run, import_id=current.import_id
            )
            replacement = await start_funder_import(
                session, run, upload_id=upload.upload_id, token="t", kind=kind
            )
            assert replacement.kind == kind
            assert replacement.import_id != current.import_id


async def test_heartbeat_keeps_a_long_running_import_alive(monkeypatch):
    async with _ca_session() as session:
        run, upload = await _run_with_upload(session)
        current = _ready_import(upload, status="processing").model_copy(
            update={
                "created_at": datetime.now(UTC) - timedelta(hours=1),
                "updated_at": datetime.now(UTC) - timedelta(seconds=60),
            }
        )
        await _store_import(session, run, current)
        factory = async_sessionmaker(session.bind, expire_on_commit=False)
        monkeypatch.setattr(service, "IMPORT_HEARTBEAT_SECONDS", 0.01)
        refreshed = asyncio.Event()
        refresh = service._refresh_import_heartbeat

        async def observe_refresh(
            factory: async_sessionmaker[AsyncSession], run_id: UUID, import_id: UUID
        ) -> bool:
            result = await refresh(factory, run_id, import_id)
            refreshed.set()
            return result

        async def read(*args, **kwargs) -> FunderImportDraft:
            await asyncio.wait_for(refreshed.wait(), timeout=2)
            async with factory() as other:
                observed = await load_funder_import(other, run)
                assert observed.status == "processing"
                assert observed.updated_at > current.updated_at
            return _draft()

        with patch.object(
            service, "_refresh_import_heartbeat", side_effect=observe_refresh
        ):
            result = await _run_job(session, run, upload, read)
        assert result.status == "ready"
        bundle = await session.get(ConceptNoteContextBundle, run.run_id)
        assert bundle.context_bundle["cc_context"]["city"]["name"] == "X"


@pytest.mark.parametrize("state", ["expired", "replaced", "discarded", "ready"])
async def test_old_worker_cannot_renew_or_publish_over_inactive_import(state):
    async with _ca_session() as session:
        run, upload = await _run_with_upload(session)
        original = _ready_import(upload, status="processing")
        current = original
        if state == "expired":
            current = original.model_copy(
                update={"updated_at": datetime.now(UTC) - timedelta(minutes=3)}
            )
        elif state == "replaced":
            current = original.model_copy(update={"import_id": uuid4()})
        elif state == "ready":
            current = original.model_copy(update={"status": "ready", "draft": _draft()})
        await _store_import(session, run, current)
        if state == "discarded":
            await service.discard_funder_import(
                session, run, import_id=original.import_id
            )
        before = await load_funder_import(session, run)
        factory = async_sessionmaker(session.bind, expire_on_commit=False)
        assert not await service._refresh_import_heartbeat(
            factory, run.run_id, original.import_id
        )
        await service._finish_import(
            factory, run.run_id, original.import_id, error_code=None, draft=_draft()
        )
        assert await load_funder_import(session, run) == before


async def _run_job(
    session: AsyncSession,
    run: ConceptNoteRun,
    upload: ConceptNoteUpload,
    extract: AsyncMock,
    *,
    closes: bool = True,
) -> FunderImport | None:
    """Run the background job against the in-memory run database."""
    factory = async_sessionmaker(session.bind, expire_on_commit=False)
    markdown = "<!-- page: 1 -->Green Cities Foundation<!-- page: 2 -->Call"
    upload.markdown_sha256 = sha256(markdown.encode()).hexdigest()
    await session.commit()
    artifact = ConceptNoteMarkdownArtifact(
        markdown=markdown,
        markdown_s3_key=upload.markdown_s3_key,
        sha256=upload.markdown_sha256,
        page_count=2,
    )
    client = SimpleNamespace(
        get_concept_note_markdown=AsyncMock(return_value=artifact),
        close=AsyncMock(),
    )
    current = await load_funder_import(session, run)
    await run_funder_import(
        run_id=run.run_id,
        import_id=current.import_id,
        token="t",
        session_factory=factory,
        cc_client_factory=lambda: client,
        extract=extract,
    )
    assert client.close.await_count == int(closes)
    return await load_funder_import(session, run)


@pytest.mark.parametrize("failed", [False, True], ids=["ready-draft", "stable-failure"])
async def test_background_job_stores_its_outcome(failed):
    async with _ca_session() as session:
        run, upload = await _run_with_upload(session)
        await _store_import(
            session,
            run,
            _ready_import(upload, status="processing"),
        )
        extract = AsyncMock(
            return_value=_draft(),
            side_effect=FunderImportError("document_too_long", "big")
            if failed
            else None,
        )
        result = await _run_job(session, run, upload, extract)
        assert result.status == ("failed" if failed else "ready")
        assert result.error_code == ("document_too_long" if failed else None)
        assert result.draft == (None if failed else _draft())
        if not failed:
            assert [page.number for page in extract.await_args.args[0]] == [1, 2]


@pytest.mark.parametrize(
    "converted_status, status, error_code",
    [("ready", "ready", None), ("failed", "failed", "upload_failed")],
)
async def test_background_job_waits_for_the_upload_to_convert(
    converted_status, status, error_code
):
    async with _ca_session() as session:
        run, upload = await _run_with_upload(session, ingest_status="queued")
        await _store_import(
            session,
            run,
            _ready_import(upload, status="processing"),
        )
        factory = async_sessionmaker(session.bind, expire_on_commit=False)

        async def convert(_seconds: float) -> None:
            """Finish converting while the job sleeps between polls."""
            async with factory() as other:
                converted = await other.get(ConceptNoteUpload, upload.upload_id)
                converted.ingest_status = converted_status
                await other.commit()

        with (
            patch.object(service.asyncio, "sleep", side_effect=convert) as sleep,
            patch.object(service, "_heartbeat_import", new_callable=AsyncMock),
        ):
            result = await _run_job(
                session,
                run,
                upload,
                AsyncMock(return_value=_draft()),
                closes=status == "ready",
            )
        sleep.assert_awaited_once()
        assert (result.status, result.error_code) == (status, error_code)


# --- HTTP ---------------------------------------------------------------------------


async def test_bodyless_discard_uses_query_id_and_preserves_a_replacement():
    async with _ca_session() as session:
        run, upload = await _run_with_upload(session)
        current = _ready_import(upload)
        await _store_import(session, run, current)
        app = get_app()
        app.dependency_overrides[get_session] = lambda: session
        app.dependency_overrides[authorized_run] = lambda: run
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            path = f"/v1/concept-notes/{run.run_id}/funder-imports/current"
            stale = await client.delete(path, params={"import_id": str(uuid4())})
            assert stale.status_code == 204
            assert stale.content == b""
            assert (await load_funder_import(session, run)).import_id == current.import_id
            discarded = await client.delete(
                path, params={"import_id": str(current.import_id)}
            )
            assert discarded.status_code == 204
            assert discarded.content == b""
            assert await load_funder_import(session, run) is None


@pytest.mark.parametrize("params", [{}, {"import_id": "invalid"}])
def test_discard_rejects_missing_or_invalid_query_id(params):
    app = get_app()
    run = SimpleNamespace(run_id=uuid4())
    app.dependency_overrides[get_session] = lambda: None
    app.dependency_overrides[authorized_run] = lambda: run
    with (
        patch("app.routes.concept_note_funders.discard_funder_import", AsyncMock()) as discard,
        TestClient(app) as client,
    ):
        response = client.delete(
            f"/v1/concept-notes/{run.run_id}/funder-imports/current", params=params
        )
    assert response.status_code == 422
    discard.assert_not_awaited()


@pytest.mark.parametrize(
    "detail, expected",
    [
        ({"message": "Safe message", "error": "internal secret"}, ""),
        (
            {"code": "public_code", "message": "Safe message", "error": "internal secret"},
            {"code": "public_code", "message": "Safe message"},
        ),
        (
            {"code": "public_code", "message": {"error": "internal secret"}},
            {"code": "public_code"},
        ),
        ({"code": {"error": "internal secret"}, "message": "Safe message"}, ""),
    ],
)
def test_problem_details_do_not_expose_non_contract_fields(detail, expected):
    app = get_app()

    @app.get("/test-error-contract")
    async def fail():
        raise HTTPException(500, detail=detail)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/test-error-contract")
    assert response.status_code == 500
    assert response.json()["detail"] == expected
    assert "internal secret" not in response.text


def test_structured_errors_keep_their_code_in_problem_responses():
    app = get_app()
    run = SimpleNamespace(run_id=uuid4(), user_id="owner")
    app.dependency_overrides[get_session] = lambda: None
    app.dependency_overrides[authorized_run] = lambda: run
    with (
        patch(
            "app.routes.concept_note_funders.start_funder_import",
            AsyncMock(
                side_effect=service.api_error("funder_import_running", "Busy")
            ),
        ),
        TestClient(app) as client,
    ):
        response = client.post(
            f"/v1/concept-notes/{run.run_id}/funder-imports",
            params={"user_id": "owner"},
            json={"upload_id": str(uuid4())},
            headers={"Authorization": "Bearer token"},
        )
    assert response.status_code == 409
    assert response.json()["detail"] == {
        "code": "funder_import_running",
        "message": "Busy",
    }
