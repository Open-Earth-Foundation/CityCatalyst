from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from app.models.concept_note_runs import ConceptNoteRunResponse, ConceptNoteStartRequest
from app.routes import concept_note_runs


@pytest.mark.asyncio
async def test_new_run_schedules_initial_thin_context_build(monkeypatch) -> None:
    """Queue context assembly after committing a source-less run."""
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
    run_service = AsyncMock()
    run_service.start_run.return_value = response
    session = AsyncMock()
    bundle_service = SimpleNamespace()
    schedule = Mock()

    monkeypatch.setattr(
        concept_note_runs,
        "ConceptNoteRunService",
        lambda _session: run_service,
    )
    monkeypatch.setattr(
        concept_note_runs,
        "schedule_context_bundle_build",
        schedule,
    )

    route_response = await concept_note_runs.start_concept_note_run(
        payload,
        context_bundle_service=bundle_service,  # type: ignore[arg-type]
        authorization="Bearer token",
        session=session,
    )

    assert route_response.status_code == 201
    session.commit.assert_awaited_once_with()
    schedule.assert_called_once_with(
        service=bundle_service,
        user_id="owner",
        run_id=run_id,
        token="token",
    )
