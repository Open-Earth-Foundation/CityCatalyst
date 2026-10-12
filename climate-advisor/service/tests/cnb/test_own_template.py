"""A note's own application template, typed by hand or read from a document."""

from functools import partial
from uuid import uuid4

import pytest
from app.models.cnb.funder_creation import (
    CustomTemplateRequest,
    TemplateChapterFields,
    TemplateDocumentExtraction,
    TemplateFields,
)
from app.models.cnb.funding_catalogue import FundingSelectionRequest
from app.models.db.concept_note import ConceptNoteContextBundle
from app.services.cnb.application_context import (
    ConceptNoteApplicationContextService,
    calculate_application_template_fingerprint,
)
from app.services.cnb.funder_creation import (
    build_template_draft,
    load_funder_import,
)
from app.services.cnb.funding_selection import save_funding_selection
from fastapi import HTTPException
from tests.cnb.test_funder_import import (
    PAGES,
    _ready_import,
    _run_with_upload,
    _store_import,
)
from tests.cnb.test_funding_selection import _draft as _drafted_chapter
from tests.cnb.test_funding_selection import _run, _seed
from tests.test_concept_note_lifecycle import _ca_session, _workspace_repository


def _template_extraction(chapters: list[dict] | None = None) -> TemplateDocumentExtraction:
    return TemplateDocumentExtraction.model_validate(
        {
            "template": {
                "template_name": "Proposal form",
                "output_format": None,
                "chapters": chapters
                if chapters is not None
                else [
                    {
                        "chapter_ref": "Applicant Details",
                        "title": "Applicant details",
                        "description": " Who applies. ",
                        "required": True,
                        "required_fields": ["municipality_name", " "],
                    }
                ],
            },
            "evidence": [
                {
                    "field": "template.chapter_schema.Applicant Details",
                    "quote": "Section 1. Applicant details",
                },
                {"field": "template.template_name", "quote": "Invented quote"},
            ],
        }
    )


def _own_template(*titles: str, import_id=None) -> CustomTemplateRequest:
    return CustomTemplateRequest(
        template=TemplateFields(
            template_name="City concept note",
            output_format="DOCX",
            chapter_schema=[
                TemplateChapterFields(
                    title=title, required=True, required_fields=["total_budget"]
                )
                for title in titles
            ],
        ),
        import_id=import_id,
    )


def _choose(own=None, *, funder=None, opportunity=None, expected=(None, None, None), acknowledge=False):
    return FundingSelectionRequest(
        funder_id=funder,
        selected_funding_opportunity_id=opportunity,
        custom_template=own,
        expected_funder_id=expected[0],
        expected_funding_opportunity_id=expected[1],
        expected_custom_template_id=expected[2],
        acknowledge_draft_review=acknowledge,
    )


def _template_import(upload):
    """A ready template import whose draft fills only the template."""
    draft = build_template_draft(_template_extraction(), PAGES)
    return _ready_import(upload).model_copy(update={"kind": "template", "draft": draft})


# --- Reading a template document -------------------------------------------------


def test_template_draft_fills_only_the_template_and_reports_its_gaps():
    draft = build_template_draft(_template_extraction(), PAGES)

    assert draft.funder.name == "" and draft.opportunity.name == ""
    assert draft.template.template_name == "Proposal form"
    chapter = draft.template.chapter_schema[0]
    assert chapter.chapter_ref == "applicant-details"
    assert chapter.description == "Who applies."
    assert chapter.required_fields == ["municipality_name"]
    # Only the verbatim quote survives, renamed to the normalized chapter ref.
    assert [(item.field, item.page) for item in draft.evidence] == [
        ("template.chapter_schema.applicant-details", 2)
    ]
    # Funder and programme columns are not reported missing for a template read.
    assert draft.missing == ["template.output_format"]
    assert build_template_draft(_template_extraction([]), PAGES).missing == [
        "template.output_format",
        "template.chapter_schema",
    ]


async def test_own_template_rejects_a_funder_import():
    async with _workspace_repository() as (_, factory), _ca_session() as session:
        run, upload = await _run_with_upload(session)
        # A funder read cannot become an own template.
        funder_import = _ready_import(upload)
        await _store_import(session, run, funder_import)
        with pytest.raises(HTTPException) as template_error:
            await save_funding_selection(
                session,
                run,
                _choose(_own_template("Summary", import_id=funder_import.import_id)),
                reference_factory=factory,
            )
        assert template_error.value.detail["code"] == "funder_import_changed"
        assert run.custom_template is None


# --- Using an own template --------------------------------------------------------


async def test_own_template_by_hand_drives_drafting_without_a_funder():
    async with _workspace_repository() as (_, factory), _ca_session() as session:
        run = await _run(session)
        result = await save_funding_selection(
            session,
            run,
            _choose(_own_template("Project summary", "Project summary")),
            reference_factory=factory,
        )
        assert result.funder is None and result.opportunity is None
        assert result.template.name == "City concept note"
        assert [chapter["chapter_ref"] for chapter in result.template.chapter_schema] == [
            "project-summary",
            "project-summary-2",
        ]
        assert result.template.required_fields == ["total_budget"]
        assert result.template_source.kind == "manual"
        bundle = await session.get(ConceptNoteContextBundle, run.run_id)
        assert bundle.context_bundle["funder_context"]["funder"] is None
        assert bundle.context_bundle["funder_context"]["template"]["name"] == (
            "City concept note"
        )

        # Drafting and validation read the same template and fingerprint.
        context_service = ConceptNoteApplicationContextService(session_factory=factory)
        reloaded = await context_service.load_for_run(run)
        assert reloaded.template == result.template
        assert await context_service.load_template_fingerprint_for_run(run) == (
            calculate_application_template_fingerprint(result.template)
        )


async def test_own_template_from_a_document_clears_the_import():
    async with _workspace_repository() as (_, factory), _ca_session() as session:
        run, upload = await _run_with_upload(session)
        template_import = _template_import(upload)
        await _store_import(session, run, template_import)
        result = await save_funding_selection(
            session,
            run,
            _choose(_own_template("Applicant details", import_id=template_import.import_id)),
            reference_factory=factory,
        )
        assert result.template_source.kind == "document"
        assert result.template_source.filename == upload.filename
        assert await load_funder_import(session, run) is None


async def test_switching_between_a_funder_and_an_own_template():
    async with _workspace_repository() as (_, factory), _ca_session() as session:
        first, _, opportunity_id = await _seed(factory)
        run = await _run(session)
        save = partial(save_funding_selection, session, run, reference_factory=factory)
        await save(_choose(funder=first, opportunity=opportunity_id))

        # The own template replaces the funder and its programme.
        own = await save(_choose(_own_template("Summary"), expected=(first, opportunity_id, None)))
        assert run.funder_id is None and run.selected_funding_opportunity_id is None
        assert own.template_source is not None

        # A second tab that still expects the funder is rejected.
        with pytest.raises(HTTPException) as stale:
            await save(_choose(funder=first, opportunity=opportunity_id, expected=(first, opportunity_id, None)))
        assert stale.value.status_code == 409

        # Choosing the funder again removes the own template.
        result = await save(
            _choose(funder=first, opportunity=opportunity_id, expected=(None, None, own.template.id))
        )
        assert result.template_source is None
        assert result.template.name == "Urban grant application"
        assert run.custom_template is None


async def test_own_template_with_a_draft_needs_acknowledgement_and_matching_chapters():
    async with (
        _workspace_repository() as (workspace, factory),
        _ca_session() as session,
    ):
        run = await _run(session)
        save = partial(save_funding_selection, session, run, reference_factory=factory)
        first = await save(_choose(_own_template("Summary")))
        await _drafted_chapter(
            workspace, run.run_id, first.template.chapter_schema, "Written text."
        )
        expected = (None, None, first.template.id)
        with pytest.raises(HTTPException) as unconfirmed:
            await save(_choose(_own_template("Summary"), expected=expected))
        assert unconfirmed.value.status_code == 409

        with pytest.raises(HTTPException) as incompatible:
            await save(
                _choose(_own_template("Summary", "Budget"), expected=expected, acknowledge=True)
            )
        assert incompatible.value.detail["code"] == "funding_template_incompatible"

        # Same chapters with new guidance keep the draft, which needs review.
        revised = await save(_choose(_own_template("Summary"), expected=expected, acknowledge=True))
        assert revised.template.id != first.template.id
        chapter = (await workspace.list_chapters(run_id=run.run_id))[0]
        assert chapter.status == "needs_review"
