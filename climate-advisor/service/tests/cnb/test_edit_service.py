from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from app.models.cnb.concept_note_edits import (
    EditApplyRequest,
    EditPlanOutput,
    EditScope,
)
from app.models.db.cnb_edit import ConceptNoteEditProposal
from app.models.db.cnb_workspace import ConceptNoteChapter
from app.persistence.concept_notes.edits import (
    EditOperationError,
)
from app.services.cnb.edits import get_edit_service
from tests.cnb.edit_helpers import (
    BODY,
    CHAPTER_ID,
    OTHER_CHAPTER_ID,
    RUN_ID,
    FakePlanner,
    investment_plan,
    request,
    seed_chapter,
    service,
    snapshot,
)
from tests.cnb.edit_helpers import (
    edit_database as edit_database,  # noqa: PLC0414 - expose the shared pytest fixture
)


def run(status="active"):
    return SimpleNamespace(run_id=RUN_ID, user_id="owner", status=status)


async def test_service_proposes_without_changing_draft_and_retries_without_model(
    edit_database,
) -> None:
    await seed_chapter(edit_database)
    planner = FakePlanner()
    edits = service(edit_database, planner)
    body = request()
    recent_messages = [{"role": "user", "content": "earlier request"}]
    proposal = await edits.propose(run(), body, recent_messages=recent_messages)
    assert proposal.status == "proposed" and proposal.base_revisions == {CHAPTER_ID: 1}
    assert await edits.propose(run(), body) == proposal
    assert planner.calls == 1
    assert planner.recent_messages == recent_messages
    assert (await edits.workspace.list_chapters(run_id=RUN_ID))[0].body_markdown == BODY


async def test_ordinary_question_cannot_produce_an_applicable_edit(
    edit_database,
) -> None:
    await seed_chapter(edit_database)
    edits = service(edit_database, FakePlanner(EditPlanOutput(intent="question")))
    proposal = await edits.propose(run(), request(instruction="Why is this useful?"))
    assert proposal.status == "rejected" and proposal.changes == []
    assert (await edits.workspace.list_chapters(run_id=RUN_ID))[0].revision_number == 1


async def test_ambiguity_is_a_persisted_focused_clarification(edit_database) -> None:
    await seed_chapter(edit_database)
    edits = service(
        edit_database,
        FakePlanner(
            EditPlanOutput(intent="clarification", clarification="Which chapter?")
        ),
    )
    result = await edits.propose(run(), request())
    assert result.status == "clarification_required"
    assert result.clarification == "Which chapter?"
    assert (await edits.repository.list(run_id=RUN_ID, user_id="owner"))[0] == result


async def test_provider_failure_is_recoverable_without_document_text_logging(
    edit_database, caplog
) -> None:
    await seed_chapter(edit_database)
    edits = service(
        edit_database, FakePlanner(error=RuntimeError("private document text"))
    )
    result = await edits.propose(run(), request())
    assert result.status == "failed" and result.error_code == "planner_unavailable"
    assert "private document text" not in caplog.text
    assert (await edits.workspace.list_chapters(run_id=RUN_ID))[0].body_markdown == BODY


async def test_interrupted_request_is_persisted_as_failed_not_stuck_processing(
    edit_database,
) -> None:
    await seed_chapter(edit_database)
    edits = service(edit_database, FakePlanner(error=asyncio.CancelledError()))
    with pytest.raises(asyncio.CancelledError):
        await edits.propose(run(), request())
    [result] = await edits.repository.list(run_id=RUN_ID, user_id="owner")
    assert result.error_code == "planning_interrupted" and result.status == "failed"


def test_unconfigured_managed_store_does_not_construct_service(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.cnb.edits.get_settings",
        lambda: SimpleNamespace(cnb_database_url=None),
    )
    assert get_edit_service() is None


async def test_source_change_invalidates_pending_proposal_and_never_overwrites_text(
    edit_database,
) -> None:
    await seed_chapter(edit_database, ready=True)
    source_id = str(uuid4())
    context = {
        "selected_sources": [
            {
                "upload_id": source_id,
                "source_label": "Budget",
                "sha256": "a" * 64,
                "summary": "EUR 12 million",
                "key_excerpts": [],
            }
        ]
    }
    edits = service(
        edit_database,
        FakePlanner(investment_plan([snapshot()], source_ref=source_id, quote=False)),
    )
    proposal = await edits.propose(run(), request(), context)
    with pytest.raises(EditOperationError) as error:
        await edits.apply(
            run(),
            proposal.proposal_id,
            EditApplyRequest(
                idempotency_key=uuid4(), expected_revisions=proposal.base_revisions
            ),
            {},
        )
    assert error.value.code == "source_changed"
    assert (
        await edits.repository.get(
            run_id=RUN_ID, user_id="owner", proposal_id=proposal.proposal_id
        )
    ).status == "stale"
    assert (await edits.workspace.list_chapters(run_id=RUN_ID))[0].body_markdown == BODY


async def test_whole_document_fact_proposal_restores_all_bases_after_reload(
    edit_database,
) -> None:
    await seed_chapter(edit_database)
    await seed_chapter(edit_database, chapter_id=OTHER_CHAPTER_ID, position=1)
    instruction = "Change the investment amount to EUR 12 million"
    edits = service(
        edit_database,
        FakePlanner(
            investment_plan(
                [snapshot(), snapshot(chapter_id=OTHER_CHAPTER_ID)], instruction
            )
        ),
    )
    proposal = await edits.propose(
        run(),
        request(
            instruction=instruction, scope=EditScope(focused_chapter_id=CHAPTER_ID)
        ),
    )
    assert len(proposal.changes) == 2 and len(proposal.base_revisions) == 2
    assert (await edits.repository.list(run_id=RUN_ID, user_id="owner"))[0] == proposal


async def test_expired_processing_is_recoverable_and_late_planner_cannot_revive_it(
    edit_database,
) -> None:
    edits = service(edit_database)
    proposal, _ = await edits.repository.start(
        run_id=RUN_ID, user_id="owner", request=request()
    )
    async with edit_database() as session, session.begin():
        row = await session.get(ConceptNoteEditProposal, proposal.proposal_id)
        row.updated_at = datetime.now(UTC) - timedelta(minutes=11)
    [expired] = await edits.repository.list(run_id=RUN_ID, user_id="owner")
    assert expired.status == "failed" and expired.error_code == "planning_interrupted"
    late = await edits.repository.finish(
        run_id=RUN_ID,
        user_id="owner",
        proposal_id=proposal.proposal_id,
        base_revisions={},
        changes=[],
        clarification="Late result",
    )
    assert late == expired


@pytest.mark.parametrize("regeneration", ["processing", "failed"])
async def test_wording_edit_cannot_promote_busy_or_failed_regeneration_to_ready(
    edit_database, regeneration
) -> None:
    await seed_chapter(edit_database, ready=True)
    edits = service(edit_database)
    proposal = await edits.propose(run(), request())
    async with edit_database() as session, session.begin():
        chapter = await session.get(ConceptNoteChapter, CHAPTER_ID)
        chapter.regeneration_status = regeneration
    with pytest.raises(EditOperationError) as error:
        await edits.apply(
            run(),
            proposal.proposal_id,
            EditApplyRequest(
                idempotency_key=uuid4(), expected_revisions=proposal.base_revisions
            ),
            {},
        )
    assert error.value.code == "chapter_unavailable"
    assert (await edits.workspace.list_chapters(run_id=RUN_ID))[0].revision_number == 1


async def test_refinement_preserves_authorized_prior_intent_and_original_factual_input(
    edit_database,
) -> None:
    await seed_chapter(edit_database)
    original_instruction = "Change the investment amount to EUR 12 million"
    planner = FakePlanner(investment_plan([snapshot()], original_instruction))
    edits = service(edit_database, planner)
    prior = await edits.propose(run(), request(instruction=original_instruction))
    refined = await edits.propose(
        run(),
        request(
            instruction="Make that proposal more concise",
            refines_proposal_id=prior.proposal_id,
        ),
    )
    assert planner.prior_proposal == prior
    assert refined.status == "proposed"
    assert refined.changes[0].user_input_quote == original_instruction
    assert (
        await edits.repository.get(
            run_id=RUN_ID, user_id="owner", proposal_id=prior.proposal_id
        )
    ).status == "rejected"
    assert (await edits.workspace.list_chapters(run_id=RUN_ID))[0].body_markdown == BODY


async def test_failed_refinement_preserves_good_prior_proposal(edit_database) -> None:
    await seed_chapter(edit_database)
    planner = FakePlanner()
    edits = service(edit_database, planner)
    prior = await edits.propose(run(), request())
    planner.error = RuntimeError("Model failed")
    failed = await edits.propose(
        run(),
        request(
            instruction="Make that proposal shorter",
            refines_proposal_id=prior.proposal_id,
        ),
    )
    assert failed.status == "failed"
    assert (
        await edits.repository.get(
            run_id=RUN_ID, user_id="owner", proposal_id=prior.proposal_id
        )
    ).status == "proposed"
