"""PostgreSQL tests for the independent CA and CNB Alembic chains."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from app.db.cnb import CnbBase
from app.models.db import cnb_edit, cnb_reference, cnb_workspace  # noqa: F401
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

SERVICE_ROOT = Path(__file__).resolve().parents[1]
CNB_DATABASE_URL = os.getenv("CNB_TEST_DATABASE_URL")
CNB_TABLES = {
    "concept_note_edit_applications",
    "concept_note_edit_proposals",
    "concept_note_gap_resolutions",
    "concept_note_chapter_reviews",
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
    "concept_note_runs",
    "concept_note_context_bundles",
    "concept_note_uploads",
    "stationary_energy_draft_runs",
    "stationary_energy_draft_source_candidates",
    "stationary_energy_draft_proposals",
    "stationary_energy_review_decisions",
    "stationary_energy_staged_review_selections",
}
STRUCTURED_UPLOAD_COLUMNS = {
    "annotation_mode",
    "structured_s3_key",
    "structured_sha256",
    "structured_size_bytes",
    "structured_schema_version",
}
CHAINS = {
    "ca": ("alembic.ini", "migrations", "CA_DATABASE_URL"),
    "cnb": ("cnb-alembic.ini", "cnb_migrations", "CNB_DATABASE_URL"),
}

requires_postgres = pytest.mark.skipif(
    not CNB_DATABASE_URL,
    reason="CNB_TEST_DATABASE_URL is required for PostgreSQL migration tests",
)


def _alembic(chain: str, *args: str) -> None:
    """Run one Alembic chain without placing the database URL in command output."""
    config, _, database_env = CHAINS[chain]
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


def _heads(chain: str) -> list[str]:
    config_file, location, _ = CHAINS[chain]
    config = Config(str(SERVICE_ROOT / config_file))
    config.set_main_option("script_location", str(SERVICE_ROOT / location))
    return ScriptDirectory.from_config(config).get_heads()


def _columns(engine, table: str) -> dict[str, dict]:
    return {column["name"]: column for column in inspect(engine).get_columns(table)}


def _reset_ca(engine) -> None:
    """Return the CA chain to base and drop its version table for other tests."""
    _alembic("ca", "downgrade", "base")
    with engine.begin() as connection:
        connection.execute(text("DROP TABLE IF EXISTS alembic_version"))


@pytest.mark.parametrize("chain", sorted(CHAINS))
def test_migration_chain_has_one_head(chain: str) -> None:
    """Catch divergent migrations even when PostgreSQL tests are skipped."""
    assert len(_heads(chain)) == 1


@requires_postgres
def test_ca_city_population_backfill_derives_from_stored_bundle() -> None:
    """Only legacy ready progress gains the field, with the bundle's population."""
    engine = create_engine(CNB_DATABASE_URL)
    populated, unpopulated, current, unbuilt = uuid4(), uuid4(), uuid4(), uuid4()
    city = {"name": "Kraków", "population": 804237, "population_year": 2024}
    runs = {
        populated: ({"context_bundle": {"status": "ready"}}, city),
        unpopulated: (
            {"context_bundle": {"status": "ready"}},
            {**city, "population": None, "population_year": None},
        ),
        current: (
            {"context_bundle": {"status": "ready", "city_population": None}},
            city,
        ),
        unbuilt: ({}, None),
    }
    try:
        _alembic("ca", "downgrade", "base")
        _alembic("ca", "upgrade", "20260811_120000")
        # Seed runs as the pre-CC-948 build left them.
        with engine.begin() as connection:
            for run_id, (summary, bundle_city) in runs.items():
                connection.execute(
                    text(
                        """
                        INSERT INTO concept_note_runs (
                            run_id, user_id, name, city_id, context_summary,
                            idempotency_key, request_fingerprint
                        )
                        VALUES (
                            :run_id, 'owner', 'Run', 'city',
                            CAST(:summary AS jsonb), :key, 'fingerprint'
                        )
                        """
                    ),
                    {"run_id": run_id, "summary": json.dumps(summary), "key": uuid4()},
                )
                if bundle_city is not None:
                    connection.execute(
                        text(
                            """
                            INSERT INTO concept_note_context_bundles
                                (run_id, context_bundle)
                            VALUES (:run_id, CAST(:bundle AS jsonb))
                            """
                        ),
                        {
                            "run_id": run_id,
                            "bundle": json.dumps({"cc_context": {"city": bundle_city}}),
                        },
                    )
        _alembic("ca", "upgrade", "head")

        with engine.connect() as connection:
            summaries = dict(
                connection.execute(
                    text("SELECT run_id, context_summary FROM concept_note_runs")
                ).all()
            )
        assert summaries[populated]["context_bundle"]["city_population"] == {
            "population": 804237,
            "year": 2024,
        }
        assert summaries[unpopulated]["context_bundle"] == {
            "status": "ready",
            "city_population": None,
        }
        assert summaries[current] == runs[current][0]
        assert summaries[unbuilt] == {}
    finally:
        _reset_ca(engine)
        engine.dispose()


@requires_postgres
@pytest.mark.parametrize("parent", ["20260828_120000", "20260907_120000"])
def test_cnb_merge_upgrades_either_existing_head_without_losing_gaps(
    parent: str,
) -> None:
    """Both previously deployed schemas converge without rewriting their data."""
    engine = create_engine(CNB_DATABASE_URL)
    run_id, gap_id = uuid4(), uuid4()
    try:
        _alembic("cnb", "downgrade", "base")
        _alembic("cnb", "upgrade", parent)
        # Seed a real gap using the schema that existed on each branch.
        if parent == "20260828_120000":
            insert = """
                INSERT INTO concept_note_gaps
                    (gap_id, run_id, field_key, severity, reason, status)
                VALUES (:gap_id, :run_id, 'budget', 'missing_information',
                    'Confirm the budget.', 'open')
            """
        else:
            insert = """
                INSERT INTO concept_note_gaps
                    (gap_id, run_id, field_key, severity, question, why_asking, status)
                VALUES (:gap_id, :run_id, 'budget', 'critical',
                    'Confirm the budget.', 'Required for financing.', 'open')
            """
        with engine.begin() as connection:
            connection.execute(text(insert), {"gap_id": gap_id, "run_id": run_id})
        _alembic("cnb", "upgrade", "head")
        assert set(inspect(engine).get_table_names()) == CNB_TABLES | {
            "cnb_alembic_version"
        }
        with engine.connect() as connection:
            assert connection.execute(
                text("SELECT version_num FROM cnb_alembic_version")
            ).scalars().all() == _heads("cnb")
            assert connection.execute(
                text("SELECT question, status FROM concept_note_gaps WHERE gap_id = :gap_id"),
                {"gap_id": gap_id},
            ).one() == ("Confirm the budget.", "open")
    finally:
        _alembic("cnb", "downgrade", "base")
        engine.dispose()


@requires_postgres
@pytest.mark.parametrize(
    ("parent", "revision", "column", "populated"),
    [
        (
            "20260909_120000",
            "20260917_120000",
            "notices",
            '["A locked chapter was excluded."]',
        ),
        (
            "20260921_120000",
            "20261111_120000",
            "review_objections",
            '[{"chapter_title": "Financing plan",'
            ' "explanation": "No source states 70% CPI indexation."}]',
        ),
    ],
)
def test_edit_proposal_list_column_upgrade_and_downgrade_preserve_proposal(
    parent: str, revision: str, column: str, populated: str
) -> None:
    """A new list column defaults to [] and removing it keeps every other field."""
    engine = create_engine(CNB_DATABASE_URL)
    try:
        # Seed a proposal on the parent revision, before the column existed.
        _alembic("cnb", "downgrade", "base")
        _alembic("cnb", "upgrade", parent)
        with engine.begin() as connection:
            original = dict(
                connection.execute(
                    text("""
                        INSERT INTO concept_note_edit_proposals
                            (proposal_id, run_id, actor_user_id, idempotency_key,
                             request_fingerprint, instruction, scope, changes, status)
                        VALUES (:proposal_id, :run_id, 'migration-test', :idempotency_key,
                            'fingerprint', 'Rename the city.', '{"type": "document"}',
                            '[{"before": "Old city", "after": "New city"}]', 'proposed')
                        RETURNING *
                    """),
                    {"proposal_id": uuid4(), "run_id": uuid4(), "idempotency_key": uuid4()},
                )
                .mappings()
                .one()
            )

        # Existing proposals get an empty list and keep every other field.
        _alembic("cnb", "upgrade", revision)
        added = _columns(engine, "concept_note_edit_proposals")[column]
        assert added["nullable"] is False
        assert added["default"] is not None
        with engine.begin() as connection:
            upgraded = dict(
                connection.execute(text("SELECT * FROM concept_note_edit_proposals"))
                .mappings()
                .one()
            )
            assert upgraded.pop(column) == []
            assert upgraded == original
            connection.execute(
                text(f"UPDATE concept_note_edit_proposals SET {column} = CAST(:value AS jsonb)"),
                {"value": populated},
            )

        # Downgrading removes the populated column while preserving the proposal.
        _alembic("cnb", "downgrade", parent)
        assert column not in _columns(engine, "concept_note_edit_proposals")
        with engine.connect() as connection:
            assert (
                dict(
                    connection.execute(text("SELECT * FROM concept_note_edit_proposals"))
                    .mappings()
                    .one()
                )
                == original
            )
    finally:
        _alembic("cnb", "downgrade", "base")
        engine.dispose()


@requires_postgres
@pytest.mark.parametrize(
    "parent",
    [
        "20260925_120000",
        "20260925_130000",
        "20261001_120000",
        "20261005_120000",
        "20261007_120000",
    ],
)
def test_structured_upload_migration_upgrades_released_schemas(parent: str) -> None:
    """Upgrade either released CA branch to the combined schema and its constraint."""
    engine = create_engine(CNB_DATABASE_URL)
    try:
        _alembic("ca", "downgrade", "base")
        _alembic("ca", "upgrade", parent)
        parent_columns = set(_columns(engine, "concept_note_uploads"))
        if parent in {"20261001_120000", "20261005_120000", "20261007_120000"}:
            assert STRUCTURED_UPLOAD_COLUMNS <= parent_columns
        else:
            assert not STRUCTURED_UPLOAD_COLUMNS & parent_columns
        _alembic("ca", "upgrade", "head")
        columns = _columns(engine, "concept_note_uploads")
        assert STRUCTURED_UPLOAD_COLUMNS <= set(columns)
        assert all(columns[name]["nullable"] for name in STRUCTURED_UPLOAD_COLUMNS)
        assert "concept_note_run_id" in _columns(engine, "threads")
        run_columns = _columns(engine, "concept_note_runs")
        assert {"custom_template", "selected_funding_opportunity_id"} <= set(run_columns)
        assert "ck_concept_note_uploads_structured_identity" in {
            constraint["name"]
            for constraint in inspect(engine).get_check_constraints("concept_note_uploads")
        }
        with engine.connect() as connection:
            assert connection.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalars().all() == _heads("ca")

        # The structured identity is either fully absent or fully present.
        run_id = uuid4()
        upload_insert = text(
            """
            INSERT INTO concept_note_uploads (
                upload_id, run_id, uploaded_by_user_id, filename, page_count,
                annotation_mode, structured_s3_key, structured_sha256,
                structured_size_bytes, structured_schema_version
            ) VALUES (
                :upload_id, :run_id, 'migration-test-user', 'fixture.pdf', 1,
                :annotation_mode, :structured_s3_key, :structured_sha256,
                :structured_size_bytes, :structured_schema_version
            )
            """
        )
        with engine.begin() as connection:
            connection.execute(
                text(
                    """
                    INSERT INTO concept_note_runs (
                        run_id, user_id, name, city_id, context_summary,
                        permission_summary, idempotency_key, request_fingerprint
                    ) VALUES (
                        :run_id, 'migration-test-user', 'Migration test',
                        'test-city', '{}'::jsonb, '{}'::jsonb, :idempotency_key,
                        :request_fingerprint
                    )
                    """
                ),
                {"run_id": run_id, "idempotency_key": uuid4(), "request_fingerprint": "a" * 64},
            )
            connection.execute(
                upload_insert,
                {
                    "upload_id": uuid4(),
                    "run_id": run_id,
                    **dict.fromkeys(STRUCTURED_UPLOAD_COLUMNS),
                },
            )
            complete_identity = {
                "run_id": run_id,
                "annotation_mode": "none",
                "structured_s3_key": "pdf-ocr/structured/complete.json",
                "structured_sha256": "b" * 64,
                "structured_size_bytes": 1,
                "structured_schema_version": "citycatalyst.structured-document.1",
            }
            connection.execute(upload_insert, {"upload_id": uuid4(), **complete_identity})
            for null_field in sorted(STRUCTURED_UPLOAD_COLUMNS):
                with pytest.raises(IntegrityError), connection.begin_nested():
                    connection.execute(
                        upload_insert,
                        {"upload_id": uuid4(), **complete_identity, null_field: None},
                    )
    finally:
        _reset_ca(engine)
        engine.dispose()


@requires_postgres
def test_cnb_upgrade_downgrade_and_chain_isolation() -> None:
    """Both chains build disjoint table sets, and the CNB head matches its models."""
    engine = create_engine(CNB_DATABASE_URL)

    _alembic("cnb", "downgrade", "base")
    _alembic("cnb", "upgrade", "head")

    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    assert tables == CNB_TABLES | {"cnb_alembic_version"}
    assert not CA_TABLES & tables

    # Columns, types, nullability, server defaults, indexes and unique constraints
    # of the migrated schema must equal the CNB model metadata.
    with engine.connect() as connection:
        context = MigrationContext.configure(
            connection,
            opts={
                "compare_type": True,
                "compare_server_default": True,
                "version_table": "cnb_alembic_version",
            },
        )
        assert compare_metadata(context, CnbBase.metadata) == []

    # Autogenerate does not compare partial-index predicates, FK actions or checks.
    chapter_indexes = {
        item["name"]: item for item in inspector.get_indexes("concept_note_chapters")
    }
    active_position = chapter_indexes["uq_concept_note_chapters_active_position"]
    assert active_position["unique"]
    assert "postgresql_where" in active_position["dialect_options"]

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
    # Run-scoped tables reference CA runs only by value, never by foreign key.
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
    check_names = {
        item["name"]
        for table_name in ("funding_evidence", "concept_note_chapter_validations")
        for item in inspector.get_check_constraints(table_name)
    }
    assert {
        "ck_funding_evidence_exactly_one_parent",
        "ck_concept_note_chapter_validations_status_valid",
    } <= check_names

    with engine.connect() as connection:
        revision = connection.execute(
            text("SELECT version_num FROM cnb_alembic_version")
        ).scalar_one()
    assert [revision] == _heads("cnb")

    _alembic("cnb", "downgrade", "base")
    assert not CNB_TABLES & set(inspect(engine).get_table_names())
    _alembic("cnb", "upgrade", "head")
    assert CNB_TABLES <= set(inspect(engine).get_table_names())
    _alembic("cnb", "downgrade", "base")

    # A fresh CA database gets the combined upload schema and none of the CNB tables.
    _alembic("ca", "upgrade", "head")
    assert not CNB_TABLES & set(inspect(engine).get_table_names())
    assert STRUCTURED_UPLOAD_COLUMNS <= set(_columns(engine, "concept_note_uploads"))
    _reset_ca(engine)
    engine.dispose()


@requires_postgres
def test_upload_roles_upgrade_current_develop_and_preserve_existing_uploads() -> None:
    """Add roles after the released merge head without losing existing sources."""
    engine = create_engine(CNB_DATABASE_URL)
    run_id, existing_id, plan_id = uuid4(), uuid4(), uuid4()
    try:
        # Seed an upload on the current develop schema, before roles exist.
        _alembic("ca", "upgrade", "20261005_120000")
        with engine.begin() as connection:
            connection.execute(
                text("""
                INSERT INTO concept_note_runs
                    (run_id, user_id, name, city_id, context_summary, permission_summary,
                     idempotency_key, request_fingerprint)
                VALUES (:run_id, 'owner', 'Plan migration', 'city', '{}'::jsonb,
                        '{}'::jsonb, :key, :fingerprint)
            """),
                {"run_id": run_id, "key": uuid4(), "fingerprint": "a" * 64},
            )
            connection.execute(
                text("""
                INSERT INTO concept_note_uploads
                    (upload_id, run_id, uploaded_by_user_id, filename)
                VALUES (:upload_id, :run_id, 'owner', 'existing.pdf')
            """),
                {"upload_id": existing_id, "run_id": run_id},
            )
        _alembic("ca", "upgrade", "20261008_120000")

        # Existing sources default to references; only documented roles are valid.
        with engine.begin() as connection:
            assert (
                connection.execute(
                    text("SELECT source_role FROM concept_note_uploads WHERE upload_id = :id"),
                    {"id": existing_id},
                ).scalar_one()
                == "reference"
            )
            connection.execute(
                text("""
                INSERT INTO concept_note_uploads
                    (upload_id, run_id, uploaded_by_user_id, filename, source_role)
                VALUES (:upload_id, :run_id, 'owner', 'plan.pdf', 'climate_action_plan')
            """),
                {"upload_id": plan_id, "run_id": run_id},
            )
            with pytest.raises(IntegrityError), connection.begin_nested():
                connection.execute(
                    text(
                        "UPDATE concept_note_uploads SET source_role = 'unknown' WHERE upload_id = :id"
                    ),
                    {"id": plan_id},
                )

        # Removing role metadata must retain both documents and the merged schema.
        _alembic("ca", "downgrade", "20261005_120000")
        assert "source_role" not in _columns(engine, "concept_note_uploads")
        with engine.connect() as connection:
            assert (
                connection.execute(
                    text("SELECT count(*) FROM concept_note_uploads WHERE run_id = :id"),
                    {"id": run_id},
                ).scalar_one()
                == 2
            )
        _alembic("ca", "upgrade", "head")
    finally:
        _reset_ca(engine)
        engine.dispose()
