from __future__ import annotations

import asyncio
import json
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from app.models.db.cnb_edit import ConceptNoteEditProposal
from app.models.cnb.concept_note_edits import (
    EditApplyRequest,
    EditHistoryRequest,
    EditProposalRequest,
    EditScope,
)
from app.models.db.cnb_workspace import ConceptNoteChapterRevision
from app.persistence.concept_notes.edits import (
    ConceptNoteEditRepository,
    EditOperationError,
)
from app.persistence.concept_notes.workspace import ConceptNoteWorkspaceRepository
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.exc import IntegrityError
from tests.cnb.edit_helpers import (
    BODY,
    CHAPTER_ID,
    OTHER_CHAPTER_ID,
    RUN_ID,
    database_url,
    edit_database as edit_database,
    seed_chapter,
)
from tests.cnb.test_edit_repository import wording_change


def proposal_row(**changes) -> ConceptNoteEditProposal:
    return ConceptNoteEditProposal(
        proposal_id=uuid4(),
        run_id=RUN_ID,
        actor_user_id="owner",
        idempotency_key=uuid4(),
        request_fingerprint="a" * 64,
        instruction="Make wording clear",
        scope={"kind": "auto", "focused_chapter_id": str(CHAPTER_ID)},
        **changes,
    )


async def test_proposal_is_separate_from_draft_and_has_processing_defaults(
    edit_database,
) -> None:
    async with edit_database() as session, session.begin():
        row = proposal_row()
        session.add(row)
        await session.flush()
        assert row.status == "processing"
        assert row.changes == [] and row.base_revisions == {}
        assert row.created_at is not None
    async with edit_database() as session:
        assert (
            await session.scalar(
                text("SELECT count(*) FROM concept_note_chapter_revisions")
            )
            == 0
        )


async def test_duplicate_proposal_identity_is_rejected_by_postgres(
    edit_database,
) -> None:
    row = proposal_row()
    async with edit_database() as session, session.begin():
        session.add(row)
    async with edit_database() as session, session.begin():
        duplicate = proposal_row()
        duplicate.idempotency_key = row.idempotency_key
        session.add(duplicate)
        with pytest.raises(IntegrityError):
            await session.flush()
        await session.rollback()
    async with edit_database() as session:
        assert len((await session.scalars(select(ConceptNoteEditProposal))).all()) == 1


@pytest.mark.parametrize(
    "values", [{"status": "accepted_by_agent"}, {"instruction": " "}]
)
async def test_postgres_rejects_invalid_status_and_blank_instruction(
    edit_database, values
) -> None:
    async with edit_database() as session:
        row = proposal_row()
        for key, value in values.items():
            setattr(row, key, value)
        session.add(row)
        with pytest.raises(IntegrityError):
            await session.commit()


def test_real_alembic_upgrade_downgrade_preserves_existing_chapter_data() -> None:
    service = Path(__file__).resolve().parents[2]
    url = database_url().replace("postgresql+asyncpg://", "postgresql+psycopg2://", 1)
    engine = create_engine(url)
    schema = f"cc732_{uuid4().hex}"
    # Programmatic migrations use the caller's logging, not Alembic CLI fileConfig.
    config = Config()
    config.set_main_option("script_location", str(service / "cnb_migrations"))
    try:
        with engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
            connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            config.attributes["connection"] = connection
            command.upgrade(config, "20260823_120000")
            connection.execute(
                text(
                    "INSERT INTO concept_note_chapters (chapter_id, run_id, title, position, status) VALUES (:chapter, :run, 'Existing', 0, 'draft')"
                ),
                {"chapter": CHAPTER_ID, "run": RUN_ID},
            )
            command.upgrade(config, "head")
            assert "concept_note_edit_proposals" in inspect(connection).get_table_names(
                schema=schema
            )
            assert (
                connection.scalar(text("SELECT title FROM concept_note_chapters"))
                == "Existing"
            )
            command.downgrade(config, "20260823_120000")
            assert "concept_note_edit_proposals" not in inspect(
                connection
            ).get_table_names(schema=schema)
            assert (
                connection.scalar(text("SELECT title FROM concept_note_chapters"))
                == "Existing"
            )
            command.upgrade(config, "head")
            assert (
                connection.scalar(text("SELECT version_num FROM cnb_alembic_version"))
                == "20260830_130000"
            )
    finally:
        with engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        engine.dispose()


async def multi_proposal(
    sessions, *, same_group=False, invalid_second=False, reverse=False
):
    repository = ConceptNoteEditRepository(sessions)
    started, _ = await repository.start(
        run_id=RUN_ID,
        user_id="owner",
        request=EditProposalRequest(
            instruction="Make these chapters clearer",
            idempotency_key=uuid4(),
            scope=EditScope(focused_chapter_id=CHAPTER_ID),
        ),
    )
    changes = [
        wording_change(group_id="clarity"),
        wording_change(
            chapter_id=OTHER_CHAPTER_ID,
            group_id="clarity" if same_group else "delivery",
            before="missing" if invalid_second else "builds parks",
        ),
    ]
    if reverse:
        changes.reverse()
    return await repository.finish(
        run_id=RUN_ID,
        user_id="owner",
        proposal_id=started.proposal_id,
        base_revisions={CHAPTER_ID: 1, OTHER_CHAPTER_ID: 1},
        changes=changes,
    )


async def seed_pair(sessions):
    await seed_chapter(sessions, ready=True)
    await seed_chapter(sessions, chapter_id=OTHER_CHAPTER_ID, position=1, ready=True)


def accept_pair(**overrides):
    return EditApplyRequest(
        **{
            "idempotency_key": uuid4(),
            "expected_revisions": {CHAPTER_ID: 1, OTHER_CHAPTER_ID: 1},
            **overrides,
        }
    )


async def test_atomic_multi_chapter_apply_and_history_share_one_batch(
    edit_database,
) -> None:
    await seed_pair(edit_database)
    repository = ConceptNoteEditRepository(edit_database)
    proposal = await multi_proposal(edit_database)
    result = await repository.apply(
        run_id=RUN_ID,
        user_id="owner",
        proposal_id=proposal.proposal_id,
        request=accept_pair(),
    )
    assert result.result.revisions == {CHAPTER_ID: 2, OTHER_CHAPTER_ID: 2}
    [history] = await repository.history(run_id=RUN_ID, user_id="owner")
    assert history.application_id == result.result.application_id
    assert history.before_revisions == {CHAPTER_ID: 1, OTHER_CHAPTER_ID: 1}
    detail = await repository.history_detail(
        run_id=RUN_ID, user_id="owner", application_id=history.application_id
    )
    assert [chapter.before for chapter in detail.chapters] == [BODY, BODY]
    assert all("creates greener parks" in chapter.after for chapter in detail.chapters)


async def test_selective_apply_keeps_unselected_groups_outside_the_document(
    edit_database,
) -> None:
    await seed_pair(edit_database)
    repository = ConceptNoteEditRepository(edit_database)
    proposal = await multi_proposal(edit_database)
    selected = proposal.changes[0].change_id
    result = await repository.apply(
        run_id=RUN_ID,
        user_id="owner",
        proposal_id=proposal.proposal_id,
        request=accept_pair(selected_change_ids=[selected]),
    )
    assert (
        result.status == "partially_applied"
        and result.result.accepted_change_ids == [selected]
    )
    chapters = await ConceptNoteWorkspaceRepository(edit_database).list_chapters(
        run_id=RUN_ID
    )
    assert chapters[0].revision_number == 2
    assert chapters[1].revision_number == 1 and chapters[1].body_markdown == BODY
    assert (await repository.history(run_id=RUN_ID, user_id="owner"))[
        0
    ].after_revisions == {CHAPTER_ID: 2}


async def test_explicit_review_can_partially_accept_a_consistency_group(
    edit_database,
) -> None:
    await seed_pair(edit_database)
    repository = ConceptNoteEditRepository(edit_database)
    proposal = await multi_proposal(edit_database, same_group=True)
    selected = proposal.changes[0].change_id
    result = await repository.apply(
        run_id=RUN_ID,
        user_id="owner",
        proposal_id=proposal.proposal_id,
        request=accept_pair(selected_change_ids=[selected]),
    )
    assert result.status == "partially_applied"
    assert result.result.accepted_change_ids == [selected]
    chapters = await ConceptNoteWorkspaceRepository(edit_database).list_chapters(
        run_id=RUN_ID
    )
    assert chapters[0].revision_number == 2
    assert chapters[1].revision_number == 1


async def test_error_in_second_chapter_rolls_back_first_chapter_and_entire_history(
    edit_database,
) -> None:
    await seed_pair(edit_database)
    repository = ConceptNoteEditRepository(edit_database)
    proposal = await multi_proposal(edit_database, invalid_second=True)
    with pytest.raises(EditOperationError) as error:
        await repository.apply(
            run_id=RUN_ID,
            user_id="owner",
            proposal_id=proposal.proposal_id,
            request=accept_pair(),
        )
    assert error.value.code == "invalid_anchor"
    chapters = await ConceptNoteWorkspaceRepository(edit_database).list_chapters(
        run_id=RUN_ID
    )
    assert all(
        chapter.revision_number == 1 and chapter.body_markdown == BODY
        for chapter in chapters
    )
    assert (
        await repository.get(
            run_id=RUN_ID, user_id="owner", proposal_id=proposal.proposal_id
        )
    ).status == "proposed"
    assert await repository.history(run_id=RUN_ID, user_id="owner") == []


async def test_reversed_multi_chapter_writers_serialize_without_deadlock_or_overwrite(
    edit_database,
) -> None:
    await seed_pair(edit_database)
    repository = ConceptNoteEditRepository(edit_database)
    first = await multi_proposal(edit_database)
    second = await multi_proposal(edit_database, reverse=True)
    results = await asyncio.wait_for(
        asyncio.gather(
            *(
                repository.apply(
                    run_id=RUN_ID,
                    user_id="owner",
                    proposal_id=proposal.proposal_id,
                    request=accept_pair(),
                )
                for proposal in [first, second]
            ),
            return_exceptions=True,
        ),
        timeout=10,
    )
    assert sum(isinstance(result, EditOperationError) for result in results) == 1
    assert len(await repository.history(run_id=RUN_ID, user_id="owner")) == 1
    assert all(
        chapter.revision_number == 2
        for chapter in await ConceptNoteWorkspaceRepository(
            edit_database
        ).list_chapters(run_id=RUN_ID)
    )


async def test_undo_restore_and_retries_append_compensating_revisions_only(
    edit_database,
) -> None:
    await seed_pair(edit_database)
    repository = ConceptNoteEditRepository(edit_database)
    proposal = await multi_proposal(edit_database)
    applied = await repository.apply(
        run_id=RUN_ID,
        user_id="owner",
        proposal_id=proposal.proposal_id,
        request=accept_pair(),
    )
    application_id = applied.result.application_id
    undo_request = EditHistoryRequest(
        idempotency_key=uuid4(), expected_revisions={CHAPTER_ID: 2, OTHER_CHAPTER_ID: 2}
    )
    undone = await repository.restore(
        run_id=RUN_ID,
        user_id="owner",
        application_id=application_id,
        request=undo_request,
        operation="undo",
    )
    assert undone == await repository.restore(
        run_id=RUN_ID,
        user_id="owner",
        application_id=application_id,
        request=undo_request,
        operation="undo",
    )
    chapters = await ConceptNoteWorkspaceRepository(edit_database).list_chapters(
        run_id=RUN_ID
    )
    assert all(
        chapter.body_markdown == BODY
        and chapter.revision_number == 3
        and chapter.confirmed_revision_number == 3
        for chapter in chapters
    )
    restore_request = EditHistoryRequest(
        idempotency_key=uuid4(), expected_revisions={CHAPTER_ID: 3, OTHER_CHAPTER_ID: 3}
    )
    restored = await repository.restore(
        run_id=RUN_ID,
        user_id="owner",
        application_id=application_id,
        request=restore_request,
        operation="restore",
    )
    assert restored.after_revisions == {CHAPTER_ID: 4, OTHER_CHAPTER_ID: 4}
    assert restored == await repository.restore(
        run_id=RUN_ID,
        user_id="owner",
        application_id=application_id,
        request=restore_request,
        operation="restore",
    )
    history = await repository.history(run_id=RUN_ID, user_id="owner")
    assert [item.operation for item in history] == ["restore", "undo", "apply"]
    assert (
        len(await repository.history(run_id=RUN_ID, user_id="owner", before_sequence=3))
        == 2
    )


async def test_undo_refuses_newer_non_edit_work_even_if_client_acknowledges_it(
    edit_database,
) -> None:
    await seed_pair(edit_database)
    repository = ConceptNoteEditRepository(edit_database)
    proposal = await multi_proposal(edit_database)
    applied = await repository.apply(
        run_id=RUN_ID,
        user_id="owner",
        proposal_id=proposal.proposal_id,
        request=accept_pair(),
    )
    async with edit_database() as session, session.begin():
        session.add(
            ConceptNoteChapterRevision(
                chapter_id=CHAPTER_ID,
                revision_number=3,
                author_type="agent",
                change_type="rewrite",
                body_markdown="Newer evidence-based work",
                patch_summary={},
            )
        )
    for number in [2, 3]:
        with pytest.raises(EditOperationError) as error:
            await repository.restore(
                run_id=RUN_ID,
                user_id="owner",
                application_id=applied.result.application_id,
                request=EditHistoryRequest(
                    idempotency_key=uuid4(),
                    expected_revisions={CHAPTER_ID: number, OTHER_CHAPTER_ID: 2},
                ),
                operation="undo",
            )
        assert error.value.code == "stale_base"
    assert (
        await ConceptNoteWorkspaceRepository(edit_database).list_chapters(run_id=RUN_ID)
    )[0].body_markdown == "Newer evidence-based work"


async def test_history_owner_binding_and_cross_operation_key_reuse_fail(
    edit_database,
) -> None:
    await seed_pair(edit_database)
    repository = ConceptNoteEditRepository(edit_database)
    proposal = await multi_proposal(edit_database)
    accepted = accept_pair()
    applied = await repository.apply(
        run_id=RUN_ID,
        user_id="owner",
        proposal_id=proposal.proposal_id,
        request=accepted,
    )
    assert await repository.history(run_id=RUN_ID, user_id="other") == []
    with pytest.raises(EditOperationError) as error:
        await repository.history_detail(
            run_id=RUN_ID, user_id="other", application_id=applied.result.application_id
        )
    assert error.value.status_code == 404
    with pytest.raises(EditOperationError) as error:
        await repository.restore(
            run_id=RUN_ID,
            user_id="owner",
            application_id=applied.result.application_id,
            request=EditHistoryRequest(
                idempotency_key=accepted.idempotency_key,
                expected_revisions={CHAPTER_ID: 2, OTHER_CHAPTER_ID: 2},
            ),
            operation="undo",
        )
    assert error.value.code == "idempotency_key_reused"


def test_history_migration_backfills_accepted_first_slice_without_rewriting_it() -> (
    None
):
    service = Path(__file__).resolve().parents[2]
    engine = create_engine(
        database_url().replace("postgresql+asyncpg://", "postgresql+psycopg2://", 1)
    )
    schema = f"cc732_{uuid4().hex}"
    proposal_id, application_id = uuid4(), uuid4()
    result = {
        "application_id": str(application_id),
        "accepted_change_ids": [str(uuid4())],
        "revisions": {str(CHAPTER_ID): 2},
    }
    # The real DDL runs in-process without replacing pytest's logging handlers.
    config = Config()
    config.set_main_option("script_location", str(service / "cnb_migrations"))
    try:
        with engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
            connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            config.attributes["connection"] = connection
            command.upgrade(config, "20260830_120000")
            connection.execute(
                text(
                    """INSERT INTO concept_note_edit_proposals
                (proposal_id,run_id,actor_user_id,idempotency_key,request_fingerprint,instruction,scope,base_revisions,status,apply_key,apply_fingerprint,applied_result)
                VALUES (:proposal,:run,'owner',:creation,:fingerprint,'Make wording clear','{"kind":"auto"}'::jsonb,CAST(:base AS jsonb),'applied',:apply,:fingerprint,CAST(:result AS jsonb))"""
                ),
                {
                    "proposal": proposal_id,
                    "run": RUN_ID,
                    "creation": uuid4(),
                    "fingerprint": "a" * 64,
                    "base": json.dumps({str(CHAPTER_ID): 1}),
                    "apply": uuid4(),
                    "result": json.dumps(result),
                },
            )
            command.upgrade(config, "head")
            row = connection.execute(
                text(
                    "SELECT application_id, sequence, before_revisions, after_revisions FROM concept_note_edit_applications"
                )
            ).one()
            assert row.application_id == application_id and row.sequence == 1
            assert row.before_revisions == {str(CHAPTER_ID): 1}
            assert row.after_revisions == {str(CHAPTER_ID): 2}
            assert (
                connection.scalar(
                    text("SELECT applied_result FROM concept_note_edit_proposals")
                )
                == result
            )
    finally:
        with engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        engine.dispose()
