"""The route that tracks an unrecorded marker as a gap (adopt on demand)."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.models.cnb.concept_note_draft import ConceptNoteMarkerGapRequest
from app.routes.concept_note_runs import adopt_concept_note_marker_gap
from app.services.cnb.chapter_drafting import ChapterDraftingError

MARKER = "[Information needed: Who signs the grant agreement?]"


@pytest.fixture
def adopt_route(monkeypatch):
    """Route arguments with a mocked run check and draft service."""
    run = SimpleNamespace(run_id=uuid4())
    authorize = AsyncMock(return_value=run)
    monkeypatch.setattr(
        "app.routes.concept_note_runs.ConceptNoteRunService",
        Mock(return_value=SimpleNamespace(get_authorized_run=authorize)),
    )
    service = SimpleNamespace(adopt_marker_gap=AsyncMock(return_value="draft"))
    return SimpleNamespace(
        run=run,
        authorize=authorize,
        service=service,
        args={
            "run_id": run.run_id,
            "chapter_id": uuid4(),
            "payload": ConceptNoteMarkerGapRequest(marker=MARKER),
            "draft_service": service,
            "user_id": "owner",
            "authorization": "Bearer test",
            "session": AsyncMock(),
        },
    )


async def test_authorizes_the_run_then_returns_the_reloaded_draft(adopt_route):
    assert await adopt_concept_note_marker_gap(**adopt_route.args) == "draft"
    adopt_route.authorize.assert_awaited_once_with(
        run_id=adopt_route.run.run_id,
        requested_user_id="owner",
        authorization="Bearer test",
    )
    adopt_route.service.adopt_marker_gap.assert_awaited_once_with(
        run=adopt_route.run,
        chapter_id=adopt_route.args["chapter_id"],
        payload=adopt_route.args["payload"],
    )


async def test_a_denied_run_never_reaches_the_workspace(adopt_route):
    adopt_route.authorize.side_effect = HTTPException(status_code=403)
    with pytest.raises(HTTPException) as error:
        await adopt_concept_note_marker_gap(**adopt_route.args)
    assert error.value.status_code == 403
    adopt_route.service.adopt_marker_gap.assert_not_called()


async def test_a_missing_or_closed_marker_is_a_conflict(adopt_route):
    adopt_route.service.adopt_marker_gap.side_effect = ChapterDraftingError(
        "This marker's gap is already closed"
    )
    with pytest.raises(HTTPException) as error:
        await adopt_concept_note_marker_gap(**adopt_route.args)
    assert error.value.status_code == 409
    assert error.value.detail == "This marker's gap is already closed"


@pytest.mark.parametrize("marker", ["", "x" * 2_101])
def test_rejects_an_empty_or_oversized_marker(marker):
    with pytest.raises(ValidationError):
        ConceptNoteMarkerGapRequest(marker=marker)
