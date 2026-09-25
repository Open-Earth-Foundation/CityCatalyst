from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType
from unittest.mock import Mock


def load_migration() -> ModuleType:
    path = (
        Path(__file__).parents[1]
        / "migrations"
        / "versions"
        / "20260925_120000_thread_concept_note_run.py"
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
