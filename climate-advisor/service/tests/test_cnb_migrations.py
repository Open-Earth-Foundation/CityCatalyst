"""Integration and metadata tests for the independent CNB Alembic chain."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest
from app.db.cnb import CnbBase
from app.models.db import cnb_reference, cnb_workspace  # noqa: F401
from sqlalchemy import create_engine, inspect, text

SERVICE_ROOT = Path(__file__).resolve().parents[1]
CNB_DATABASE_URL = os.getenv("CNB_TEST_DATABASE_URL")
CNB_TABLES = {
    "concept_note_chapters",
    "concept_note_chapter_revisions",
    "concept_note_chapter_validations",
    "concept_note_evidence_links",
    "concept_note_gaps",
    "concept_note_matched_projects",
    "concept_note_exports",
    "funders",
    "funding_opportunities",
    "funded_projects",
    "funder_templates",
    "funder_criteria",
    "source_documents",
    "funding_evidence",
}
CA_TABLES = {
    "threads",
    "messages",
    "stationary_energy_draft_runs",
    "stationary_energy_draft_source_candidates",
    "stationary_energy_draft_proposals",
    "stationary_energy_review_decisions",
    "stationary_energy_staged_review_selections",
}


def _run_alembic(*, config: str, database_env: str, args: list[str]) -> None:
    """Run Alembic without placing the database URL in command output."""
    environment = os.environ.copy()
    environment[database_env] = CNB_DATABASE_URL or ""
    completed = subprocess.run(
        [sys.executable, "-m", "alembic", "-c", config, *args],
        cwd=SERVICE_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr


def _render_offline_upgrade(*, config: str, database_env: str) -> str:
    """Render one PostgreSQL migration chain without opening a connection."""
    environment = os.environ.copy()
    environment[database_env] = "postgresql://unused:unused@localhost/unused"
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "alembic",
            "-c",
            config,
            "upgrade",
            "head",
            "--sql",
        ],
        cwd=SERVICE_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
    return completed.stdout


def test_ca_migration_chain_renames_selected_opportunity_reference() -> None:
    """Keep the deployed CA column aligned with the explicit opportunity API."""
    sql = _render_offline_upgrade(
        config="alembic.ini",
        database_env="CA_DATABASE_URL",
    )
    legacy_column = "selected_funding_" + "record_id"
    assert (
        f"ALTER TABLE concept_note_runs RENAME {legacy_column} "
        "TO selected_funding_opportunity_id;"
    ) in sql


def test_cnb_offline_migration_preserves_explicit_constraint_names() -> None:
    """Prevent SQLAlchemy naming conventions from double-prefixing checks."""
    sql = _render_offline_upgrade(
        config="cnb-alembic.ini",
        database_env="CNB_DATABASE_URL",
    )

    assert "CREATE TABLE funding_opportunities" in sql
    assert "CREATE TABLE funded_projects" in sql
    assert "CONSTRAINT ck_funding_evidence_exactly_one_parent CHECK" in sql
    assert "ck_funding_evidence_ck_funding_evidence" not in sql
    assert "DROP CONSTRAINT uq_funder_templates_opportunity_name" in sql
    assert "CONSTRAINT uq_funder_templates_opportunity UNIQUE" in sql
    assert "CREATE TABLE concept_note_chapter_validations" in sql
    assert "ck_concept_note_chapter_validations_status_valid" in sql


def test_cnb_metadata_contains_only_the_fourteen_owned_tables() -> None:
    """Keep CA-owned run, context-bundle, and upload tables out of CNB metadata."""
    assert set(CnbBase.metadata.tables) == CNB_TABLES
    assert not {
        "concept_note_runs",
        "concept_note_context_bundles",
        "concept_note_uploads",
    } & set(CnbBase.metadata.tables)


@pytest.mark.skipif(
    not CNB_DATABASE_URL,
    reason="CNB_TEST_DATABASE_URL is required for PostgreSQL migration tests",
)
def test_cnb_upgrade_downgrade_and_chain_isolation() -> None:
    """Exercise both migration chains against an empty PostgreSQL database."""
    assert CNB_DATABASE_URL is not None
    engine = create_engine(CNB_DATABASE_URL)

    _run_alembic(
        config="cnb-alembic.ini",
        database_env="CNB_DATABASE_URL",
        args=["downgrade", "base"],
    )
    _run_alembic(
        config="cnb-alembic.ini",
        database_env="CNB_DATABASE_URL",
        args=["upgrade", "head"],
    )

    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    assert tables == CNB_TABLES | {"cnb_alembic_version"}
    assert not CA_TABLES & tables
    assert (
        not {
            "concept_note_runs",
            "concept_note_context_bundles",
            "concept_note_uploads",
        }
        & tables
    )

    expected_indexes = {
        "funding_opportunities": {"ix_funding_opportunities_funder_name"},
        "funded_projects": {"ix_funded_projects_funder_name"},
        "concept_note_chapters": {
            "uq_concept_note_chapters_active_position",
            "ix_concept_note_chapters_run_status",
        },
        "concept_note_evidence_links": {"ix_concept_note_evidence_links_chapter"},
        "concept_note_gaps": {
            "ix_concept_note_gaps_run_status",
            "ix_concept_note_gaps_chapter",
        },
        "concept_note_matched_projects": {
            "ix_concept_note_matched_projects_run_decision"
        },
        "concept_note_exports": {"ix_concept_note_exports_run_status"},
    }
    for table_name, index_names in expected_indexes.items():
        assert index_names <= {
            item["name"] for item in inspector.get_indexes(table_name)
        }

    chapter_indexes = {
        item["name"]: item for item in inspector.get_indexes("concept_note_chapters")
    }
    assert chapter_indexes["uq_concept_note_chapters_active_position"]["unique"]
    assert (
        "postgresql_where"
        in chapter_indexes["uq_concept_note_chapters_active_position"][
            "dialect_options"
        ]
    )

    opportunity_uniques = {
        item["name"]
        for item in inspector.get_unique_constraints("funding_opportunities")
    }
    project_uniques = {
        item["name"] for item in inspector.get_unique_constraints("funded_projects")
    }
    source_uniques = {
        item["name"] for item in inspector.get_unique_constraints("source_documents")
    }
    revision_uniques = {
        item["name"]
        for item in inspector.get_unique_constraints("concept_note_chapter_revisions")
    }
    match_uniques = {
        item["name"]
        for item in inspector.get_unique_constraints("concept_note_matched_projects")
    }
    assert "uq_funding_opportunities_source_identity" in opportunity_uniques
    assert "uq_funded_projects_source_identity" in project_uniques
    assert "uq_source_documents_content_hash_url" in source_uniques
    assert "uq_concept_note_chapter_revisions_number" in revision_uniques
    assert "uq_concept_note_matched_projects_run_project" in match_uniques
    validation_uniques = {
        item["name"]
        for item in inspector.get_unique_constraints(
            "concept_note_chapter_validations"
        )
    }
    assert "uq_concept_note_chapter_validations_chapter" in validation_uniques
    template_uniques = {
        item["name"] for item in inspector.get_unique_constraints("funder_templates")
    }
    assert "uq_funder_templates_opportunity" in template_uniques
    assert "uq_funder_templates_opportunity_name" not in template_uniques

    expected_fk_deletes = {
        "funding_opportunities": {("funder_id",): "RESTRICT"},
        "funded_projects": {("funder_id",): "RESTRICT"},
        "funder_templates": {("funding_opportunity_id",): "CASCADE"},
        "funder_criteria": {
            ("funding_opportunity_id",): "CASCADE",
            ("source_document_id",): "RESTRICT",
        },
        "funding_evidence": {
            ("funding_opportunity_id",): "CASCADE",
            ("funded_project_id",): "CASCADE",
            ("source_document_id",): "RESTRICT",
        },
        "concept_note_chapter_revisions": {("chapter_id",): "CASCADE"},
        "concept_note_chapter_validations": {
            ("chapter_id",): "CASCADE",
            ("validated_revision_id",): "SET NULL",
        },
        "concept_note_evidence_links": {("chapter_id",): "CASCADE"},
        "concept_note_gaps": {("chapter_id",): "SET NULL"},
        "concept_note_matched_projects": {("funded_project_id",): "RESTRICT"},
    }
    for table_name, expected in expected_fk_deletes.items():
        observed = {
            tuple(item["constrained_columns"]): item["options"]["ondelete"]
            for item in inspector.get_foreign_keys(table_name)
        }
        assert observed == expected

    evidence_checks = {
        item["name"] for item in inspector.get_check_constraints("funding_evidence")
    }
    assert "ck_funding_evidence_exactly_one_parent" in evidence_checks

    for table_name in (
        "concept_note_chapters",
        "concept_note_gaps",
        "concept_note_matched_projects",
        "concept_note_exports",
    ):
        assert "run_id" not in {
            column
            for item in inspector.get_foreign_keys(table_name)
            for column in item["constrained_columns"]
        }

    opportunity_columns = {
        item["name"]: item
        for item in inspector.get_columns("funding_opportunities")
    }
    project_columns = {
        item["name"]: item for item in inspector.get_columns("funded_projects")
    }
    assert {"sector", "applicant_type", "known_gaps"} <= set(opportunity_columns)
    assert {"sector", "applicant_type", "known_gaps"} <= set(project_columns)
    assert opportunity_columns["funding_opportunity_id"]["default"] is None
    assert project_columns["funded_project_id"]["default"] is None
    for column_name in ("hazards", "interventions", "known_gaps"):
        assert opportunity_columns[column_name]["default"] is not None
    for column_name in ("hazards", "interventions", "project_tags", "known_gaps"):
        assert project_columns[column_name]["default"] is not None
    criteria_columns = {
        item["name"]: item for item in inspector.get_columns("funder_criteria")
    }
    assert criteria_columns["source_document_id"]["nullable"] is True
    assert criteria_columns["hard_gate"]["default"] is not None

    expected_default_columns = {
        "funders": {"profile"},
        "funder_templates": {"chapter_schema", "required_fields"},
        "funding_evidence": {"source_map"},
        "concept_note_chapters": {
            "status",
            "required",
            "user_locked",
            "created_at",
            "updated_at",
        },
        "concept_note_chapter_revisions": {
            "body_markdown",
            "patch_summary",
            "created_at",
        },
        "concept_note_chapter_validations": {
            "findings",
            "validated_at",
        },
        "concept_note_gaps": {"status", "created_at"},
        "concept_note_matched_projects": {"matched_tags", "evidence", "caveats"},
    }
    for table_name, column_names in expected_default_columns.items():
        columns = {item["name"]: item for item in inspector.get_columns(table_name)}
        assert all(
            columns[column_name]["default"] is not None for column_name in column_names
        )

    with engine.connect() as connection:
        revision = connection.execute(
            text("SELECT version_num FROM cnb_alembic_version")
        ).scalar_one()
    assert revision == "20260828_120000"

    _run_alembic(
        config="cnb-alembic.ini",
        database_env="CNB_DATABASE_URL",
        args=["downgrade", "base"],
    )
    assert not CNB_TABLES & set(inspect(engine).get_table_names())
    _run_alembic(
        config="cnb-alembic.ini",
        database_env="CNB_DATABASE_URL",
        args=["upgrade", "head"],
    )
    assert CNB_TABLES <= set(inspect(engine).get_table_names())
    _run_alembic(
        config="cnb-alembic.ini",
        database_env="CNB_DATABASE_URL",
        args=["downgrade", "base"],
    )

    _run_alembic(
        config="alembic.ini",
        database_env="CA_DATABASE_URL",
        args=["upgrade", "head"],
    )
    assert not CNB_TABLES & set(inspect(engine).get_table_names())
    _run_alembic(
        config="alembic.ini",
        database_env="CA_DATABASE_URL",
        args=["downgrade", "base"],
    )
    engine.dispose()
