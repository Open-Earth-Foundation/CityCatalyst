"""Adding funders to the CNB catalogue from a document upload or by hand."""

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
from app.models.cnb.funder_import import (
    ExtractedChapter,
    ExtractedEvidence,
    ExtractedFact,
    FieldEvidence,
    FunderCreateRequest,
    FunderDocumentExtraction,
    FunderFields,
    FunderImport,
    FunderImportDraft,
    FunderProfileFacts,
    ProgrammeFields,
    TemplateChapterFields,
    TemplateFields,
)
from app.models.db.cnb_reference import CnbFundingEvidence, CnbSourceDocument
from app.models.db.concept_note import (
    ConceptNoteContextBundle,
    ConceptNoteRun,
    ConceptNoteUpload,
)
from app.services.citycatalyst_client import ConceptNoteMarkdownArtifact
from app.services.cnb import funder_import as service
from app.config import get_settings
from app.services.cnb.funder_import import (
    FunderImportError,
    build_draft,
    create_funder,
    extract_funder_draft,
    load_funder_import,
    run_funder_import,
    start_funder_import,
)
from app.services.cnb.funding_catalogue import load_funding_catalogue
from app.services.cnb.source_analysis import SourceBlock, SourcePage
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from tests.test_concept_note_lifecycle import _ca_session, _workspace_repository

PAGES = [
    SourcePage(number=1, text="\nGreen Cities Foundation\nNature-Based Cities Call 2026\n"),
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
        funder=FunderFields(
            name="Green Cities Foundation",
            funder_type="Private foundation",
            profile=FunderProfileFacts(stated={"purpose": "Nature for cities"}),
        ),
        opportunity=ProgrammeFields(
            name="Nature-Based Cities Call 2026",
            min_award=Decimal("150000"),
            max_award=Decimal("600000"),
            currency="USD",
        ),
        template=TemplateFields(
            template_name="Proposal form",
            chapter_schema=[
                TemplateChapterFields(
                    chapter_ref="applicant-details",
                    title="Applicant details",
                    required=True,
                    required_fields=["municipality_name"],
                )
            ],
        ),
        evidence=[
            FieldEvidence(field="funder.name", quote="Green Cities Foundation", page=1),
            FieldEvidence(field="funder.funder_type", quote="private foundation", page=1),
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


def _ready_import(upload: ConceptNoteUpload) -> FunderImport:
    now = datetime.now(UTC)
    return FunderImport(
        import_id=uuid4(),
        upload_id=upload.upload_id,
        filename=upload.filename,
        status="ready",
        draft=_draft(),
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


def test_build_draft_reports_markdown_quotes_without_page():
    blocks = [SourceBlock(anchor="doc/block-1", text="Green Cities Foundation\n")]
    draft = build_draft(_extraction(template={"chapters": []}), blocks)
    assert FieldEvidence(field="funder.name", quote="Green Cities Foundation") in (
        draft.evidence
    )
    assert "template.chapter_schema" in draft.missing


async def test_extract_reads_the_whole_document_once_and_verifies_quotes():
    runner = SimpleNamespace(
        run=AsyncMock(
            return_value=SimpleNamespace(
                final_output=_extraction().model_dump(mode="json")
            )
        )
    )
    draft = await extract_funder_draft(
        PAGES,
        filename="call.pdf",
        source_format="pdf",
        client=SimpleNamespace(),
        runner=runner,
    )
    assert draft.funder.name == "Green Cities Foundation"
    agent, input_text = runner.run.await_args.args
    assert agent.name == "Concept Note funder document reader"
    assert "<!-- page: 2 -->" in input_text


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


def test_create_request_requires_names_and_a_titled_chapter():
    draft = _draft()
    with pytest.raises(ValidationError):
        _request(draft.model_copy(update={"funder": FunderFields(name=" ")}))
    with pytest.raises(ValidationError):
        _request(
            draft.model_copy(
                update={"template": TemplateFields(template_name="Form")}
            )
        )
    with pytest.raises(ValidationError):
        ProgrammeFields(name="Call", min_award=Decimal(10), max_award=Decimal(5))


# --- Adding to the catalogue ------------------------------------------------------


async def test_create_by_hand_adds_ordinary_catalogue_rows_without_evidence():
    async with _workspace_repository() as (_, factory), _ca_session() as session:
        run, _ = await _run_with_upload(session)
        draft = _draft()
        draft.template.chapter_schema.append(
            TemplateChapterFields(
                chapter_ref="",
                title="Budget",
                required_fields=["budget_total", "municipality_name"],
            )
        )
        created = await create_funder(
            session, run, _request(draft), reference_factory=factory
        )

        catalogue = await load_funding_catalogue(factory)
        funder = next(f for f in catalogue.funders if f.id == created.funder_id)
        opportunity = funder.opportunities[0]
        assert funder.profile == {
            "stated": {"purpose": "Nature for cities"},
            "derived": {},
        }
        assert opportunity.id == created.funding_opportunity_id
        assert opportunity.min_award == Decimal("150000")
        assert opportunity.added_from.kind == "manual"
        template = opportunity.template
        assert [c["chapter_ref"] for c in template.chapter_schema] == [
            "applicant-details",
            "budget",
        ]
        # Every inventory field is owned by a chapter, as validation requires.
        assert template.required_fields == ["municipality_name", "budget_total"]
        async with factory() as reference:
            assert (await reference.scalars(select(CnbFundingEvidence))).all() == []


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


async def test_create_rejects_an_import_that_is_not_ready():
    async with _workspace_repository() as (_, factory), _ca_session() as session:
        run, upload = await _run_with_upload(session)
        funder_import = _ready_import(upload).model_copy(
            update={"status": "processing", "draft": None}
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
        stale = datetime.now(UTC) - timedelta(hours=1)
        await _store_import(
            session,
            run,
            _ready_import(upload).model_copy(
                update={"status": "processing", "draft": None, "updated_at": stale}
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


async def test_background_job_stores_a_ready_draft():
    async with _ca_session() as session:
        run, upload = await _run_with_upload(session)
        await _store_import(
            session,
            run,
            _ready_import(upload).model_copy(update={"status": "processing", "draft": None}),
        )
        extract = AsyncMock(return_value=_draft())
        result = await _run_job(session, run, upload, extract)
        assert result.status == "ready"
        assert result.draft == _draft()
        pages = extract.await_args.args[0]
        assert [page.number for page in pages] == [1, 2]


async def test_background_job_stores_a_stable_failure_code():
    async with _ca_session() as session:
        run, upload = await _run_with_upload(session)
        await _store_import(
            session,
            run,
            _ready_import(upload).model_copy(update={"status": "processing", "draft": None}),
        )
        extract = AsyncMock(side_effect=FunderImportError("document_too_long", "big"))
        result = await _run_job(session, run, upload, extract)
        assert result.status == "failed"
        assert result.error_code == "document_too_long"
        assert result.draft is None


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
            _ready_import(upload).model_copy(update={"status": "processing", "draft": None}),
        )
        factory = async_sessionmaker(session.bind, expire_on_commit=False)

        async def convert(_seconds: float) -> None:
            """Finish converting while the job sleeps between polls."""
            async with factory() as other:
                converted = await other.get(ConceptNoteUpload, upload.upload_id)
                converted.ingest_status = converted_status
                await other.commit()

        with patch.object(service.asyncio, "sleep", side_effect=convert) as sleep:
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


def test_discard_requires_and_forwards_the_observed_import_id():
    app = get_app()
    run = SimpleNamespace(run_id=uuid4(), user_id="owner")
    app.dependency_overrides[get_session] = lambda: None
    app.dependency_overrides[authorized_run] = lambda: run
    import_id = uuid4()
    with (
        patch(
            "app.routes.concept_note_funder_imports.discard_funder_import", AsyncMock()
        ) as discard,
        TestClient(app) as client,
    ):
        path = f"/v1/concept-notes/{run.run_id}/funder-imports/current"
        missing = client.delete(path, params={"user_id": "owner"})
        assert missing.status_code == 422
        discard.assert_not_awaited()
        response = client.request(
            "DELETE",
            path,
            params={"user_id": "owner"},
            json={"import_id": str(import_id)},
        )
    assert response.status_code == 204
    discard.assert_awaited_once_with(None, run, import_id=import_id)


def test_structured_errors_keep_their_code_in_problem_responses():
    app = get_app()
    run = SimpleNamespace(run_id=uuid4(), user_id="owner")
    app.dependency_overrides[get_session] = lambda: None
    app.dependency_overrides[authorized_run] = lambda: run
    with (
        patch(
            "app.routes.concept_note_funder_imports.start_funder_import",
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
