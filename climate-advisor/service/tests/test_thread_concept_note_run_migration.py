from __future__ import annotations

import importlib.util
import json
import os
from collections.abc import Iterator
from pathlib import Path
from types import ModuleType
from unittest.mock import Mock
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy.engine import Connection


def load_migration() -> ModuleType:
    path = (
        Path(__file__).parents[1]
        / "migrations"
        / "versions"
        / "20260925_130000_thread_concept_note_run.py"
    )
    spec = importlib.util.spec_from_file_location("thread_run_migration", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_upgrade_attaches_threads_to_runs_and_backfills_active_pointers() -> None:
    migration = load_migration()
    operations = Mock()
    migration.op = operations

    migration.upgrade()

    table, column = operations.add_column.call_args.args
    assert table == "threads"
    assert column.name == "concept_note_run_id"
    assert column.nullable is True
    foreign_key = next(iter(column.foreign_keys))
    assert foreign_key.target_fullname == "concept_note_runs.run_id"
    assert foreign_key.ondelete == "CASCADE"
    backfill = str(operations.execute.call_args.args[0])
    assert "UPDATE threads" in backfill
    assert "runs.thread_id = threads.thread_id" in backfill
    operations.create_index.assert_called_once_with(
        "ix_threads_concept_note_run_created",
        "threads",
        ["concept_note_run_id", "created_at"],
    )


def test_downgrade_drops_the_link_and_its_index() -> None:
    migration = load_migration()
    operations = Mock()
    migration.op = operations

    migration.downgrade()

    operations.drop_index.assert_called_once_with(
        "ix_threads_concept_note_run_created", table_name="threads"
    )
    operations.drop_column.assert_called_once_with("threads", "concept_note_run_id")


@pytest.fixture
def migration_connection() -> Iterator[Connection]:
    database_url = os.getenv("CNB_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("CNB_TEST_DATABASE_URL is required for PostgreSQL migration tests")
    engine = sa.create_engine(database_url)
    try:
        with engine.connect() as connection, connection.begin() as transaction:
            # Isolate the affected pre-migration tables without touching other tests.
            schema = f"thread_migration_{uuid4().hex}"
            connection.execute(sa.text(f'CREATE SCHEMA "{schema}"'))
            connection.execute(sa.text(f'SET LOCAL search_path TO "{schema}"'))
            connection.execute(
                sa.text("""
                CREATE TABLE concept_note_runs (
                    run_id UUID PRIMARY KEY,
                    thread_id UUID,
                    user_id VARCHAR(255) NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );
                CREATE TABLE threads (
                    thread_id UUID PRIMARY KEY,
                    user_id VARCHAR(255) NOT NULL,
                    inventory_id VARCHAR(255),
                    title VARCHAR(255),
                    context JSONB,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
                );
                CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');
                CREATE TABLE messages (
                    message_id UUID PRIMARY KEY,
                    thread_id UUID NOT NULL REFERENCES threads ON DELETE CASCADE,
                    user_id VARCHAR(255) NOT NULL,
                    text TEXT NOT NULL,
                    tools_used JSONB,
                    role message_role NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );
            """)
            )
            yield connection
            transaction.rollback()
    finally:
        engine.dispose()


def seed_chat(connection: Connection, *, context: str | None) -> UUID:
    thread_id = uuid4()
    connection.execute(
        sa.text("""
        INSERT INTO threads
            (thread_id, user_id, inventory_id, title, context, created_at, last_updated)
        VALUES (:id, 'owner', 'inventory', 'Existing chat', CAST(:context AS jsonb),
            '2026-09-01T10:00:00Z', '2026-09-01T10:05:00Z')
    """),
        {
            "id": thread_id,
            "context": context,
        },
    )
    for index, role in enumerate(("user", "assistant", "system")):
        connection.execute(
            sa.text("""
            INSERT INTO messages
                (message_id, thread_id, user_id, text, tools_used, role, created_at)
            VALUES (:id, :thread, 'owner', :text, CAST(:tools AS jsonb),
                CAST(:role AS message_role),
                '2026-09-01T10:00:00Z'::timestamptz + :offset * interval '1 minute')
        """),
            {
                "id": uuid4(),
                "thread": thread_id,
                "text": f"History {index}",
                "tools": json.dumps(
                    {"calls": [{"name": "read_context", "output": "saved"}]}
                ),
                "role": role,
                "offset": index,
            },
        )
    return thread_id


def seed_run(
    connection: Connection, thread_id: UUID | None, *, user: str = "owner"
) -> UUID:
    run_id = uuid4()
    connection.execute(
        sa.text("""
        INSERT INTO concept_note_runs (run_id, thread_id, user_id)
        VALUES (:id, :thread, :user)
    """),
        {"id": run_id, "thread": thread_id, "user": user},
    )
    return run_id


@pytest.mark.parametrize("run_count", [1, 2, 3])
@pytest.mark.parametrize(
    "context",
    [
        None,
        "null",
        json.dumps(
            {
                "concept_note_run_id": "old-binding",
                "stationary_energy_draft_run_id": "old-competing-workflow",
                "access_token": "test-token",
                "custom": {"locale": "pl"},
            }
        ),
    ],
)
def test_upgrade_preserves_history_and_isolates_runs(
    migration_connection: Connection,
    run_count: int,
    context: str | None,
) -> None:
    connection = migration_connection
    original_thread = seed_chat(connection, context=context)
    runs = sorted(seed_run(connection, original_thread) for _ in range(run_count))
    general_thread = seed_chat(connection, context=json.dumps({"general": True}))
    seed_run(connection, None)
    missing_thread = uuid4()
    missing_run = seed_run(connection, missing_thread)
    original_messages = connection.execute(
        sa.text("""
        SELECT user_id, text, tools_used, role, created_at
        FROM messages WHERE thread_id = :id ORDER BY created_at
    """),
        {"id": original_thread},
    ).all()
    original_message_ids = set(
        connection.scalars(
            sa.text("SELECT message_id FROM messages WHERE thread_id = :id"),
            {"id": original_thread},
        )
    )
    original_metadata = connection.execute(
        sa.text("""
        SELECT user_id, inventory_id, title, created_at, last_updated
        FROM threads WHERE thread_id = :id
    """),
        {"id": original_thread},
    ).one()
    migration = load_migration()
    migration.op = Operations(MigrationContext.configure(connection))

    migration.upgrade()

    threads = []
    for run in runs:
        thread = (
            connection.execute(
                sa.text("""
            SELECT threads.* FROM threads
            JOIN concept_note_runs AS runs ON runs.thread_id = threads.thread_id
            WHERE runs.run_id = :run
        """),
                {"run": run},
            )
            .mappings()
            .one()
        )
        threads.append(thread["thread_id"])
        assert thread["concept_note_run_id"] == run
        assert thread["context"] == {
            **{
                key: value
                for key, value in (json.loads(context or "null") or {}).items()
                if key not in {"concept_note_run_id", "stationary_energy_draft_run_id"}
            },
            "concept_note_run_id": str(run),
        }
        assert (
            tuple(
                thread[key]
                for key in (
                    "user_id",
                    "inventory_id",
                    "title",
                    "created_at",
                    "last_updated",
                )
            )
            == original_metadata
        )
        assert (
            connection.execute(
                sa.text("""
            SELECT user_id, text, tools_used, role, created_at
            FROM messages WHERE thread_id = :id ORDER BY created_at
        """),
                {"id": thread["thread_id"]},
            ).all()
            == original_messages
        )
        if thread["thread_id"] != original_thread:
            copied_ids = set(
                connection.scalars(
                    sa.text("SELECT message_id FROM messages WHERE thread_id = :id"),
                    {"id": thread["thread_id"]},
                )
            )
            assert copied_ids.isdisjoint(original_message_ids)
    assert threads[0] == original_thread
    assert len(set(threads)) == run_count
    general = connection.execute(
        sa.text(
            "SELECT concept_note_run_id, context FROM threads WHERE thread_id = :id"
        ),
        {"id": general_thread},
    ).one()
    assert general == (None, {"general": True})
    assert (
        connection.scalar(
            sa.text("SELECT thread_id FROM concept_note_runs WHERE run_id = :id"),
            {"id": missing_run},
        )
        == missing_thread
    )

    # New replies and cascading deletion must only affect the chosen note.
    connection.execute(
        sa.text("""
        INSERT INTO messages (message_id, thread_id, user_id, text, role)
        VALUES (:id, :thread, 'owner', 'Independent reply', 'user')
    """),
        {"id": uuid4(), "thread": original_thread},
    )
    for thread_id in threads[1:]:
        assert (
            connection.scalar(
                sa.text("SELECT count(*) FROM messages WHERE thread_id = :id"),
                {"id": thread_id},
            )
            == 3
        )
    connection.execute(
        sa.text("DELETE FROM concept_note_runs WHERE run_id = :id"), {"id": runs[0]}
    )
    assert (
        connection.scalar(
            sa.text("SELECT count(*) FROM threads WHERE thread_id = :id"),
            {"id": original_thread},
        )
        == 0
    )
    assert (
        connection.scalar(
            sa.text("SELECT count(*) FROM messages WHERE thread_id = :id"),
            {"id": original_thread},
        )
        == 0
    )
    for thread_id in threads[1:]:
        assert (
            connection.scalar(
                sa.text("SELECT count(*) FROM messages WHERE thread_id = :id"),
                {"id": thread_id},
            )
            == 3
        )

    # Downgrade keeps the split history, and upgrading again must not clone it again.
    migration.downgrade()
    assert "concept_note_run_id" not in {
        column["name"] for column in sa.inspect(connection).get_columns("threads")
    }
    migration.upgrade()
    for run, thread_id in zip(runs[1:], threads[1:]):
        assert (
            connection.scalar(
                sa.text("SELECT thread_id FROM concept_note_runs WHERE run_id = :id"),
                {"id": run},
            )
            == thread_id
        )
        assert (
            connection.scalar(
                sa.text("SELECT count(*) FROM messages WHERE thread_id = :id"),
                {"id": thread_id},
            )
            == 3
        )


def test_owner_mismatch_aborts_without_partial_migration(
    migration_connection: Connection,
) -> None:
    connection = migration_connection
    thread_id = seed_chat(connection, context=None)
    seed_run(connection, thread_id)
    seed_run(connection, thread_id, user="different-owner")
    migration = load_migration()
    migration.op = Operations(MigrationContext.configure(connection))

    with (
        pytest.raises(sa.exc.DBAPIError, match="run and thread owners differ"),
        connection.begin_nested(),
    ):
        migration.upgrade()

    assert "concept_note_run_id" not in {
        column["name"] for column in sa.inspect(connection).get_columns("threads")
    }
    assert connection.scalar(sa.text("SELECT count(*) FROM threads")) == 1
    assert connection.scalar(sa.text("SELECT count(*) FROM messages")) == 3
    assert set(
        connection.scalars(sa.text("SELECT thread_id FROM concept_note_runs"))
    ) == {thread_id}
