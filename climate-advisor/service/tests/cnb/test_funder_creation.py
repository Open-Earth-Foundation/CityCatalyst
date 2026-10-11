"""Adding funders to the CNB catalogue by hand."""

from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from app.models.cnb.funder_creation import (
    FunderCreateRequest,
    FunderFields,
    FunderProfileFacts,
    ProgrammeFields,
    TemplateChapterFields,
    TemplateFields,
)
from app.models.db.cnb_reference import CnbFundingEvidence
from app.services.cnb.funder_creation import create_funder
from app.services.cnb.funding_catalogue import load_funding_catalogue
from pydantic import ValidationError
from sqlalchemy import select
from tests.test_concept_note_lifecycle import _workspace_repository


def _request(**overrides) -> FunderCreateRequest:
    """A valid by-hand request with one titled chapter."""
    values = {
        "funder": FunderFields(
            name="Green Cities Foundation",
            funder_type="Private foundation",
            profile=FunderProfileFacts(stated={"purpose": "Nature for cities"}),
        ),
        "opportunity": ProgrammeFields(
            name="Nature-Based Cities Call 2026",
            min_award=Decimal("150000"),
            max_award=Decimal("600000"),
            currency="USD",
        ),
        "template": TemplateFields(
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
    }
    values.update(overrides)
    return FunderCreateRequest(**values)


def test_create_request_requires_names_and_a_titled_chapter():
    with pytest.raises(ValidationError):
        _request(funder=FunderFields(name=" "))
    with pytest.raises(ValidationError):
        _request(template=TemplateFields(template_name="Form"))
    with pytest.raises(ValidationError):
        ProgrammeFields(name="Call", min_award=Decimal(10), max_award=Decimal(5))


async def test_create_by_hand_adds_ordinary_catalogue_rows_without_evidence():
    async with _workspace_repository() as (_, factory):
        request = _request()
        request.template.chapter_schema.append(
            TemplateChapterFields(
                chapter_ref="",
                title="Budget",
                required_fields=["budget_total", "municipality_name"],
            )
        )
        run = SimpleNamespace(run_id=uuid4())
        created = await create_funder(run, request, reference_factory=factory)

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


@pytest.mark.parametrize(
    "chapters",
    [
        [TemplateChapterFields(title="Summary", description="x" * 4001)],
        [TemplateChapterFields(title="Summary\nBudget")],
        [TemplateChapterFields(title="Section") for _ in range(101)],
    ],
)
def test_create_rejects_templates_the_structure_editor_cannot_use(chapters):
    with pytest.raises(ValidationError):
        _request(template=TemplateFields(template_name="Form", chapter_schema=chapters))


async def test_created_template_round_trips_through_structure_with_unicode_and_duplicate_refs():
    from app.models.cnb.concept_note_structure import StructureSaveRequest
    from app.persistence.concept_notes.structure import structure_snapshot
    from app.persistence.concept_notes.workspace import normalize_template_chapters

    async with _workspace_repository() as (workspace, factory):
        chapters = [
            TemplateChapterFields(title=title, description="x" * 4000)
            for title in ("Łódź", "Łódź", "Łódź-2", "!!!")
        ]
        payload = _request(
            template=TemplateFields(template_name="Form", chapter_schema=chapters)
        )
        run = SimpleNamespace(run_id=uuid4())
        created = await create_funder(run, payload, reference_factory=factory)
        catalogue = await load_funding_catalogue(factory)
        template = (
            next(f for f in catalogue.funders if f.id == created.funder_id)
            .opportunities[0]
            .template
        )
        refs = [c["chapter_ref"] for c in template.chapter_schema]
        assert refs == ["łódź", "łódź-2", "łódź-2-2", "chapter-4"]
        await workspace.ensure_template_chapters(
            run_id=run.run_id,
            chapters=normalize_template_chapters(template.chapter_schema),
        )
        state = structure_snapshot(await workspace.list_chapters(run_id=run.run_id))
        request = StructureSaveRequest(
            expected_fingerprint=state.fingerprint, chapters=state.chapters
        )
        assert len(request.chapters) == 4


async def test_template_failure_rolls_back_the_whole_catalogue_write():
    from sqlalchemy import event, func
    from app.models.db.cnb_reference import (
        CnbFunder,
        CnbFundingOpportunity,
        CnbFunderTemplate,
    )

    def fail_template(_mapper, _connection, _target) -> None:
        raise RuntimeError("injected template failure")

    async with _workspace_repository() as (_, factory):
        event.listen(CnbFunderTemplate, "before_insert", fail_template)
        try:
            with pytest.raises(RuntimeError, match="injected template failure"):
                await create_funder(
                    SimpleNamespace(run_id=uuid4()),
                    _request(),
                    reference_factory=factory,
                )
        finally:
            event.remove(CnbFunderTemplate, "before_insert", fail_template)
        async with factory() as session:
            for model in (CnbFunder, CnbFundingOpportunity, CnbFunderTemplate):
                assert (
                    await session.scalar(select(func.count()).select_from(model)) == 0
                )


@pytest.mark.parametrize(
    "denial,expected_status", [("anonymous", 401), ("unowned", 404), ("revoked", 403)]
)
async def test_create_route_revalidates_identity_run_ownership_and_city_access(
    monkeypatch, denial, expected_status
):
    from unittest.mock import AsyncMock
    import httpx
    from fastapi import FastAPI, HTTPException
    from app.routes import concept_note_funders as routes
    from app.services.concept_note_runs import ConceptNoteRunService

    run_id = uuid4()
    run = SimpleNamespace(run_id=run_id, city_id=str(uuid4()))
    session = AsyncMock()
    service = ConceptNoteRunService(session)
    monkeypatch.setattr(
        type(service.repository),
        "get_for_user",
        AsyncMock(return_value=None if denial == "unowned" else run),
    )
    monkeypatch.setattr(
        ConceptNoteRunService, "_authorize_user", AsyncMock(return_value="owner")
    )
    monkeypatch.setattr(
        ConceptNoteRunService,
        "_validate_city_access",
        AsyncMock(
            side_effect=HTTPException(403, "Access revoked")
            if denial == "revoked"
            else None
        ),
    )
    create = AsyncMock()
    monkeypatch.setattr(routes, "create_funder", create)
    app = FastAPI()
    app.include_router(routes.router)
    app.dependency_overrides[routes.get_session] = lambda: session
    headers = {} if denial == "anonymous" else {"Authorization": "Bearer test-token"}
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            f"/concept-notes/{run_id}/funders?user_id=owner",
            json=_request().model_dump(mode="json"),
            headers=headers,
        )
    assert response.status_code == expected_status
    create.assert_not_called()
