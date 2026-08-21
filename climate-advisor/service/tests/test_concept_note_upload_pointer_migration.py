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
        / "20260730_120000_concept_note_upload_pointers.py"
    )
    spec = importlib.util.spec_from_file_location("cnb_pointer_migration", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_upgrade_replaces_inline_markdown_with_nullable_pointer() -> None:
    migration = load_migration()
    operations = Mock()
    migration.op = operations

    migration.upgrade()

    added_column = operations.add_column.call_args.args[1]
    assert added_column.name == "markdown_s3_key"
    assert added_column.nullable is True
    nullable_columns = {
        call.args[1]
        for call in operations.alter_column.call_args_list
        if call.kwargs.get("nullable") is True
    }
    assert nullable_columns == {"markdown_sha256", "page_count"}
    operations.drop_column.assert_called_once_with(
        "concept_note_uploads", "markdown_text"
    )


def test_downgrade_restores_parent_schema_shape() -> None:
    migration = load_migration()
    operations = Mock()
    migration.op = operations

    migration.downgrade()

    altered = {
        call.args[1]: call.kwargs for call in operations.alter_column.call_args_list
    }
    assert altered["markdown_text"]["nullable"] is False
    assert altered["markdown_sha256"]["nullable"] is False
    assert altered["page_count"]["nullable"] is False
    operations.execute.assert_called_once()
    operations.drop_column.assert_called_once_with(
        "concept_note_uploads", "markdown_s3_key"
    )
