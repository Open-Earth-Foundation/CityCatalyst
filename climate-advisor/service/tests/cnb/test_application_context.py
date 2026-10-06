from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

from app.models.cnb.concept_note_application_context import ApplicationContextTemplate
from app.models.db.concept_note import ConceptNoteRun
from app.services.cnb.application_context import (
    ConceptNoteApplicationContextService,
    calculate_application_template_fingerprint,
)

RUN_ID = UUID("10000000-0000-4000-8000-000000000001")
CITY_ID = UUID("20000000-0000-4000-8000-000000000001")
FUNDER_ID = UUID("30000000-0000-4000-8000-000000000001")
OPPORTUNITY_ID = UUID("40000000-0000-4000-8000-000000000001")
TEMPLATE_ID = UUID("50000000-0000-4000-8000-000000000001")


def _run(*, with_funding: bool) -> ConceptNoteRun:
    """Build the small run surface consumed by the application-context service."""
    return cast(
        ConceptNoteRun,
        SimpleNamespace(
            run_id=RUN_ID,
            city_id=str(CITY_ID),
            funder_id=FUNDER_ID if with_funding else None,
            selected_funding_opportunity_id=(
                OPPORTUNITY_ID if with_funding else None
            ),
        ),
    )


def _session_factory(session: object) -> MagicMock:
    factory = MagicMock()
    factory.return_value.__aenter__ = AsyncMock(return_value=session)
    factory.return_value.__aexit__ = AsyncMock(return_value=None)
    return factory


def _workflow_session(context_bundle: dict[str, object] | None) -> AsyncMock:
    session = AsyncMock()
    session.get.return_value = (
        SimpleNamespace(context_bundle=context_bundle)
        if context_bundle is not None
        else None
    )
    return session


async def test_skips_reference_database_when_run_has_no_funder() -> None:
    session_factory = MagicMock()
    service = ConceptNoteApplicationContextService(
        session_factory=session_factory,
        workflow_session=_workflow_session(None),
    )

    response = await service.load_for_run(_run(with_funding=False))

    assert response.model_dump() == {
        "run_id": RUN_ID,
        "city_id": CITY_ID,
        "funder": None,
        "opportunity": None,
        "template": None,
        "included_sources": {
            "city": False,
            "project": False,
            "ghgi": False,
            "ccra": False,
            "hiap": False,
        },
    }
    session_factory.assert_not_called()


async def test_maps_selected_funder_programme_and_template() -> None:
    session = object()
    service = ConceptNoteApplicationContextService(
        session_factory=_session_factory(session),
        workflow_session=_workflow_session(
            {
                "cc_context": {
                    "city": {"name": "Krakow"},
                    "project": None,
                    "ghgi": {"availability": "partial"},
                    "ccra": None,
                    "hiap": None,
                }
            }
        ),
    )
    service._load_funder = AsyncMock(
        return_value=SimpleNamespace(funder_id=FUNDER_ID, name="EIB")
    )
    service._load_opportunity = AsyncMock(
        return_value=SimpleNamespace(
            funding_opportunity_id=OPPORTUNITY_ID,
            name="Project Finance Loans",
        )
    )
    service._load_template = AsyncMock(
        return_value=SimpleNamespace(
            template_id=TEMPLATE_ID,
            template_name="EIB starter",
            output_format="markdown",
            chapter_schema=[
                {
                    "chapter_ref": "project-summary",
                    "title": "Project summary",
                    "required": True,
                }
            ],
            required_fields=["project_summary"],
        )
    )

    response = await service.load_for_run(_run(with_funding=True))

    assert response.model_dump() == {
        "run_id": RUN_ID,
        "city_id": CITY_ID,
        "funder": {"id": FUNDER_ID, "name": "EIB"},
        "opportunity": {
            "id": OPPORTUNITY_ID,
            "name": "Project Finance Loans",
        },
        "template": {
            "id": TEMPLATE_ID,
            "name": "EIB starter",
            "output_format": "markdown",
            "chapter_schema": [
                {
                    "chapter_ref": "project-summary",
                    "title": "Project summary",
                    "required": True,
                }
            ],
            "required_fields": ["project_summary"],
        },
        "included_sources": {
            "city": True,
            "project": False,
            "ghgi": True,
            "ccra": False,
            "hiap": False,
        },
    }


async def test_loads_template_fingerprint_with_one_reference_query() -> None:
    """Keep the frequently polled draft state independent of full context loading."""
    template = SimpleNamespace(
        template_id=TEMPLATE_ID,
        template_name="EIB starter",
        output_format="markdown",
        chapter_schema=[{"chapter_ref": "summary", "title": "Summary"}],
        required_fields=["project_summary"],
    )
    session = AsyncMock()
    session.scalar.return_value = template
    service = ConceptNoteApplicationContextService(
        session_factory=_session_factory(session)
    )
    service._load_funder = AsyncMock()
    service._load_opportunity = AsyncMock()
    service._load_template = AsyncMock()

    fingerprint = await service.load_template_fingerprint_for_run(
        _run(with_funding=True)
    )

    expected_template = ApplicationContextTemplate(
        id=TEMPLATE_ID,
        name="EIB starter",
        output_format="markdown",
        chapter_schema=[{"chapter_ref": "summary", "title": "Summary"}],
        required_fields=["project_summary"],
    )
    assert fingerprint == calculate_application_template_fingerprint(
        expected_template
    )
    session.scalar.assert_awaited_once()
    service._load_funder.assert_not_called()
    service._load_opportunity.assert_not_called()
    service._load_template.assert_not_called()
