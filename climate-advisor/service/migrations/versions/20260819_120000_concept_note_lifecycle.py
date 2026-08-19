"""Add retryable Concept Note duplicate and delete lifecycle state.

Revision ID: 20260819_120000
Revises: 20260811_120000
Create Date: 2026-08-19 12:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "20260819_120000"
down_revision = "20260811_120000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Persist hidden transitional state and durable lifecycle operations."""
    op.add_column(
        "concept_note_runs",
        sa.Column(
            "lifecycle_state",
            sa.String(length=32),
            nullable=False,
            server_default="active",
        ),
    )
    op.add_column(
        "concept_note_runs",
        sa.Column(
            "duplicated_from_run_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
            comment=(
                "Source run provenance only; intentionally no cross-run foreign key"
            ),
        ),
    )
    op.create_check_constraint(
        "ck_concept_note_runs_lifecycle_state",
        "concept_note_runs",
        "lifecycle_state IN ('active', 'copying', 'deleting')",
    )
    op.create_index(
        "ix_concept_note_runs_user_city_lifecycle",
        "concept_note_runs",
        ["user_id", "city_id", "lifecycle_state"],
    )

    op.create_table(
        "concept_note_lifecycle_operations",
        sa.Column(
            "operation_id", postgresql.UUID(as_uuid=True), nullable=False
        ),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column("city_id", sa.String(length=255), nullable=False),
        sa.Column(
            "source_run_id", postgresql.UUID(as_uuid=True), nullable=False
        ),
        sa.Column(
            "destination_run_id", postgresql.UUID(as_uuid=True), nullable=True
        ),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column(
            "idempotency_key", postgresql.UUID(as_uuid=True), nullable=False
        ),
        sa.Column("phase", sa.String(length=64), nullable=False),
        sa.Column(
            "operation_data",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "kind IN ('duplicate', 'delete')",
            name="ck_concept_note_lifecycle_operations_kind",
        ),
        sa.PrimaryKeyConstraint("operation_id"),
        sa.UniqueConstraint(
            "user_id",
            "idempotency_key",
            name="uq_concept_note_lifecycle_user_idempotency",
        ),
    )
    op.create_index(
        "uq_concept_note_lifecycle_source_incomplete",
        "concept_note_lifecycle_operations",
        ["source_run_id"],
        unique=True,
        postgresql_where=sa.text("phase <> 'completed'"),
    )


def downgrade() -> None:
    """Remove Concept Note lifecycle operation persistence."""
    op.drop_index(
        "uq_concept_note_lifecycle_source_incomplete",
        table_name="concept_note_lifecycle_operations",
    )
    op.drop_table("concept_note_lifecycle_operations")
    op.drop_index(
        "ix_concept_note_runs_user_city_lifecycle",
        table_name="concept_note_runs",
    )
    op.drop_constraint(
        "ck_concept_note_runs_lifecycle_state",
        "concept_note_runs",
        type_="check",
    )
    op.drop_column("concept_note_runs", "duplicated_from_run_id")
    op.drop_column("concept_note_runs", "lifecycle_state")
