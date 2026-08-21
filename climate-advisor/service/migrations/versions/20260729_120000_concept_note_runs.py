"""Create Concept Note Builder run, context-bundle, and upload persistence.

Revision ID: 20260729_120000
Revises: 20260701_120000
Create Date: 2026-07-29 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260729_120000"
down_revision = "20260701_120000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create durable concept-note workflow tables and indexes."""
    op.create_table(
        "concept_note_runs",
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "thread_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
            comment="CityCatalyst-owned external thread identifier; no local foreign key",
        ),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("city_id", sa.String(length=255), nullable=False),
        sa.Column("project_id", sa.String(length=255), nullable=True),
        sa.Column(
            "funder_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
            comment="External funder identifier validated against managed CNB reference data",
        ),
        sa.Column(
            "selected_funding_record_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
            comment="External funding-record identifier validated against managed CNB reference data",
        ),
        sa.Column(
            "status",
            sa.String(length=64),
            nullable=False,
            server_default="active",
        ),
        sa.Column(
            "workflow_step",
            sa.String(length=64),
            nullable=False,
            server_default="assembling_context",
        ),
        sa.Column(
            "context_summary",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "permission_summary",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("trace_id", sa.String(length=255), nullable=True),
        sa.Column("idempotency_key", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("request_fingerprint", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("run_id"),
        sa.UniqueConstraint(
            "user_id",
            "idempotency_key",
            name="uq_concept_note_runs_user_idempotency",
        ),
    )
    op.create_index(
        "ix_concept_note_runs_user_city_updated",
        "concept_note_runs",
        ["user_id", "city_id", "updated_at"],
        unique=False,
    )

    op.create_table(
        "concept_note_context_bundles",
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "context_bundle",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["run_id"],
            ["concept_note_runs.run_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("run_id"),
    )

    op.create_table(
        "concept_note_uploads",
        sa.Column("upload_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("uploaded_by_user_id", sa.String(length=255), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("source_label", sa.String(length=255), nullable=True),
        sa.Column("markdown_text", sa.Text(), nullable=False),
        sa.Column("markdown_sha256", sa.String(length=64), nullable=False),
        sa.Column("page_count", sa.Integer(), nullable=False),
        sa.Column(
            "ingest_status",
            sa.String(length=64),
            nullable=False,
            server_default="processing",
        ),
        sa.Column("ingest_error_code", sa.String(length=64), nullable=True),
        sa.Column(
            "ingest_started_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "ingest_completed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["run_id"],
            ["concept_note_runs.run_id"],
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "page_count > 0",
            name="ck_concept_note_uploads_positive_page_count",
        ),
        sa.PrimaryKeyConstraint("upload_id"),
    )
    op.create_index(
        "ix_concept_note_uploads_run_status_received",
        "concept_note_uploads",
        ["run_id", "ingest_status", "received_at"],
        unique=False,
    )
    op.create_index(
        "ix_concept_note_uploads_user_received",
        "concept_note_uploads",
        ["uploaded_by_user_id", "received_at"],
        unique=False,
    )


def downgrade() -> None:
    """Remove Concept Note Builder workflow persistence."""
    op.drop_index(
        "ix_concept_note_uploads_user_received",
        table_name="concept_note_uploads",
    )
    op.drop_index(
        "ix_concept_note_uploads_run_status_received",
        table_name="concept_note_uploads",
    )
    op.drop_table("concept_note_uploads")
    op.drop_table("concept_note_context_bundles")
    op.drop_index(
        "ix_concept_note_runs_user_city_updated",
        table_name="concept_note_runs",
    )
    op.drop_table("concept_note_runs")
