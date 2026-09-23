from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from app.models.cnb.concept_note_edits import EditProposalRequest
from app.services.cnb.edits import ConceptNoteEditService


@pytest.mark.parametrize("status", ["queued", "processing"])
async def test_proposal_fails_while_chapters_are_being_updated(status: str) -> None:
    """Refuse chat edits that a pending gap-driven rewrite would make stale."""
    proposal = SimpleNamespace(proposal_id=uuid4())
    repository = SimpleNamespace(
        start=AsyncMock(return_value=(proposal, True)),
        finish=AsyncMock(return_value="finished"),
    )
    workspace = SimpleNamespace(
        list_chapters=AsyncMock(
            return_value=[
                SimpleNamespace(regeneration_status="idle", revision_number=1),
                SimpleNamespace(regeneration_status=status, revision_number=1),
            ]
        )
    )
    planner = SimpleNamespace(plan=AsyncMock())
    service = ConceptNoteEditService(
        repository, workspace, planner, workflow_sessions=None
    )

    @asynccontextmanager
    async def context(run: Any) -> AsyncIterator[tuple[Any, dict[str, object]]]:
        yield run, {}

    service.locked_context = context
    result = await service._propose(
        SimpleNamespace(run_id=uuid4(), user_id="owner"),
        EditProposalRequest(instruction="Add the EIB facts", idempotency_key=uuid4()),
        recent_messages=None,
    )

    assert result == "finished"
    assert repository.finish.await_args.kwargs["error_code"] == "chapters_updating"
    planner.plan.assert_not_awaited()
