"""Add durable review-before-apply concept-note edit proposals.

Revision ID: 20260830_120000
Revises: 20260823_120000
Create Date: 2026-08-30 12:00:00
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260830_120000"
down_revision = "20260823_120000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create proposals without modifying any existing chapter content."""
    op.create_table(
        "concept_note_edit_proposals",
        sa.Column("proposal_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_user_id", sa.String(255), nullable=False),
        sa.Column("idempotency_key", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("request_fingerprint", sa.String(64), nullable=False),
        sa.Column("instruction", sa.Text(), nullable=False),
        sa.Column("scope", postgresql.JSONB(), nullable=False),
        sa.Column(
            "base_revisions",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "changes",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("status", sa.String(32), nullable=False, server_default="processing"),
        sa.Column("clarification", sa.Text()),
        sa.Column("error_code", sa.String(64)),
        sa.Column("apply_key", postgresql.UUID(as_uuid=True)),
        sa.Column("apply_fingerprint", sa.String(64)),
        sa.Column("applied_result", postgresql.JSONB()),
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
        sa.PrimaryKeyConstraint("proposal_id", name="pk_concept_note_edit_proposals"),
        sa.UniqueConstraint(
            "run_id",
            "actor_user_id",
            "idempotency_key",
            name="uq_cnb_edit_proposals_idempotency",
        ),
        sa.CheckConstraint(
            "status IN ('processing', 'clarification_required', 'proposed', 'applied', 'partially_applied', 'rejected', 'failed', 'stale')",
            name="ck_concept_note_edit_proposals_status_valid",
        ),
        sa.CheckConstraint(
            "length(trim(instruction)) > 0 AND length(instruction) <= 8000",
            name="ck_concept_note_edit_proposals_instruction_bounded",
        ),
    )
    op.create_index(
        "ix_cnb_edit_proposals_run_actor_created",
        "concept_note_edit_proposals",
        ["run_id", "actor_user_id", "created_at"],
    )


def downgrade() -> None:
    """Remove proposals only; existing immutable draft revisions remain intact."""
    op.drop_index(
        "ix_cnb_edit_proposals_run_actor_created",
        table_name="concept_note_edit_proposals",
    )
    op.drop_table("concept_note_edit_proposals")
