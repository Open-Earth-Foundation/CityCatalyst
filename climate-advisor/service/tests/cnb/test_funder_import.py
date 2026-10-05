"""Adding funders to the CNB catalogue by hand."""

from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from app.models.cnb.funder_import import (
    FunderCreateRequest,
    FunderFields,
    FunderProfileFacts,
    ProgrammeFields,
    TemplateChapterFields,
    TemplateFields,
)
from app.models.db.cnb_reference import CnbFundingEvidence
from app.services.cnb.funder_import import create_funder
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
