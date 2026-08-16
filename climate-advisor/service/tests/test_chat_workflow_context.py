from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from app.services.thread_service import ThreadService
from app.utils.chat_workflow_context import (
    CONCEPT_NOTE_RUN_ID_KEY,
    STATIONARY_ENERGY_DRAFT_RUN_ID_KEY,
    bind_workflow_context,
)


def test_binding_stationary_energy_clears_concept_note_context() -> None:
    draft_run_id = uuid4()

    context = bind_workflow_context(
        {
            "access_token": "preserved-token",
            CONCEPT_NOTE_RUN_ID_KEY: str(uuid4()),
        },
        workflow_key=STATIONARY_ENERGY_DRAFT_RUN_ID_KEY,
        run_id=draft_run_id,
    )

    assert context == {
        "access_token": "preserved-token",
        STATIONARY_ENERGY_DRAFT_RUN_ID_KEY: str(draft_run_id),
    }


def test_binding_concept_note_clears_stationary_energy_context() -> None:
    concept_note_run_id = uuid4()

    context = bind_workflow_context(
        {STATIONARY_ENERGY_DRAFT_RUN_ID_KEY: str(uuid4())},
        workflow_key=CONCEPT_NOTE_RUN_ID_KEY,
        run_id=concept_note_run_id,
    )

    assert context == {CONCEPT_NOTE_RUN_ID_KEY: str(concept_note_run_id)}


def test_binding_rejects_unknown_workflow_context_key() -> None:
    with pytest.raises(ValueError, match="Unsupported workflow context key"):
        bind_workflow_context({}, workflow_key="unknown", run_id=uuid4())


@pytest.mark.asyncio
async def test_thread_service_persists_exclusive_workflow_context() -> None:
    session = SimpleNamespace(flush=AsyncMock())
    thread = SimpleNamespace(
        context={
            "access_token": "preserved-token",
            CONCEPT_NOTE_RUN_ID_KEY: str(uuid4()),
        }
    )
    draft_run_id = uuid4()

    await ThreadService(session).set_workflow_context(
        thread,
        workflow_key=STATIONARY_ENERGY_DRAFT_RUN_ID_KEY,
        run_id=draft_run_id,
    )

    assert thread.context == {
        "access_token": "preserved-token",
        STATIONARY_ENERGY_DRAFT_RUN_ID_KEY: str(draft_run_id),
    }
    session.flush.assert_awaited_once_with()
