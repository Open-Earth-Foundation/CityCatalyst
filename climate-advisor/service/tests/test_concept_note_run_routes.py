from datetime import datetime, timezone
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest

from app.models.concept_note_runs import ConceptNoteRunResponse, ConceptNoteStartRequest
from app.routes import concept_note_runs
from app.services.cnb.context_bundle import ContextBundleService
from app.services.concept_note_runs import ConceptNoteRunService


@pytest.mark.asyncio
async def test_start_route_delegates_context_scheduling_to_service(monkeypatch) -> None:
    """Keep run creation and context scheduling out of the route layer."""
    run_id = uuid4()
    city_id = uuid4()
    payload = ConceptNoteStartRequest(
        user_id="owner",
        name="Thin context note",
        city_id=city_id,
        idempotency_key=uuid4(),
    )
    now = datetime.now(timezone.utc)
    response = ConceptNoteRunResponse(
        run_id=run_id,
        thread_id=None,
        user_id="owner",
        name=payload.name,
        city_id=city_id,
        project_id=None,
        funder_id=None,
        selected_funding_opportunity_id=None,
        status="active",
        workflow_step="assembling_context",
        progress_summary={},
        created_at=now,
        updated_at=now,
        created=True,
    )
    run_service = AsyncMock(spec=ConceptNoteRunService)
    run_service.start_run_and_schedule_context.return_value = response
    session = AsyncMock()
    bundle_service = Mock(spec=ContextBundleService)

    monkeypatch.setattr(
        concept_note_runs,
        "ConceptNoteRunService",
        lambda _session: run_service,
    )
    route_response = await concept_note_runs.start_concept_note_run(
        payload,
        context_bundle_service=bundle_service,
        authorization="Bearer token",
        session=session,
    )

    assert route_response.status_code == 201
    run_service.start_run_and_schedule_context.assert_awaited_once_with(
        payload,
        authorization="Bearer token",
        context_bundle_service=bundle_service,
    )
    session.commit.assert_not_awaited()
