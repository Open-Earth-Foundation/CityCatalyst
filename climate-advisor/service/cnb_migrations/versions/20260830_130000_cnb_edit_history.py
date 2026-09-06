"""Add immutable batch history for atomic edits and compensating undo/restore.

Revision ID: 20260830_130000
Revises: 20260830_120000
Create Date: 2026-08-30 13:00:00
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260830_130000"
down_revision = "20260830_120000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add history without rewriting proposals or existing chapter revisions."""
    op.create_table(
        "concept_note_edit_applications",
        sa.Column("application_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_user_id", sa.String(255), nullable=False),
        sa.Column("proposal_id", postgresql.UUID(as_uuid=True)),
        sa.Column("restores_application_id", postgresql.UUID(as_uuid=True)),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("operation", sa.String(16), nullable=False),
        sa.Column("idempotency_key", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("request_fingerprint", sa.String(64), nullable=False),
        sa.Column("before_revisions", postgresql.JSONB(), nullable=False),
        sa.Column("after_revisions", postgresql.JSONB(), nullable=False),
        sa.Column("accepted_change_ids", postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint(
            "application_id", name="pk_concept_note_edit_applications"
        ),
        sa.ForeignKeyConstraint(
            ["proposal_id"],
            ["concept_note_edit_proposals.proposal_id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["restores_application_id"],
            ["concept_note_edit_applications.application_id"],
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint(
            "run_id",
            "actor_user_id",
            "idempotency_key",
            name="uq_cnb_edit_applications_idempotency",
        ),
        sa.UniqueConstraint(
            "run_id", "sequence", name="uq_cnb_edit_applications_sequence"
        ),
        sa.CheckConstraint(
            "sequence > 0", name="ck_concept_note_edit_applications_sequence_positive"
        ),
        sa.CheckConstraint(
            "operation IN ('apply', 'undo', 'restore')",
            name="ck_concept_note_edit_applications_operation_valid",
        ),
    )
    op.create_index(
        "ix_cnb_edit_applications_run_sequence",
        "concept_note_edit_applications",
        ["run_id", "sequence"],
    )
    # Keep any accepted first-slice proposals undoable when upgrading in place.
    op.execute(
        """
        INSERT INTO concept_note_edit_applications (
            application_id, run_id, actor_user_id, proposal_id, sequence, operation,
            idempotency_key, request_fingerprint, before_revisions, after_revisions,
            accepted_change_ids, created_at
        )
        SELECT (applied_result->>'application_id')::uuid, run_id, actor_user_id,
            proposal_id, row_number() OVER (PARTITION BY run_id ORDER BY updated_at, proposal_id),
            'apply', apply_key, apply_fingerprint, base_revisions,
            applied_result->'revisions', applied_result->'accepted_change_ids', updated_at
        FROM concept_note_edit_proposals
        WHERE applied_result IS NOT NULL AND apply_key IS NOT NULL
    """
    )


def downgrade() -> None:
    """Remove batch history only; all chapter revisions and proposals remain."""
    op.drop_index(
        "ix_cnb_edit_applications_run_sequence",
        table_name="concept_note_edit_applications",
    )
    op.drop_table("concept_note_edit_applications")
