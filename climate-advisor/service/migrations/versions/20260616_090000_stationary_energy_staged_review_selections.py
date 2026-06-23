"""Add stationary energy staged review selections

Revision ID: 20260616_090000
Revises: 20260529_120000
Create Date: 2026-06-16 09:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "20260616_090000"
down_revision = "20260529_120000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create the table used for agent-staged Stationary Energy review choices."""
    op.create_table(
        "stationary_energy_staged_review_selections",
        sa.Column("selection_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("draft_run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("proposal_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("selected_source_id", sa.String(length=255), nullable=True),
        sa.Column("selected_candidate_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column("tool_call_id", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["draft_run_id"],
            ["stationary_energy_draft_runs.draft_run_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["proposal_id"],
            ["stationary_energy_draft_proposals.proposal_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("selection_id"),
        sa.UniqueConstraint(
            "draft_run_id",
            "proposal_id",
            "user_id",
            name="uq_stationary_energy_staged_selection_active",
        ),
    )
    op.create_index(
        "ix_stationary_energy_staged_review_selections_run_user",
        "stationary_energy_staged_review_selections",
        ["draft_run_id", "user_id"],
    )
    op.create_index(
        "ix_stationary_energy_staged_review_selections_proposal",
        "stationary_energy_staged_review_selections",
        ["proposal_id"],
    )


def downgrade() -> None:
    """Drop the staged review selections table and its indexes."""
    op.drop_index(
        "ix_stationary_energy_staged_review_selections_proposal",
        table_name="stationary_energy_staged_review_selections",
    )
    op.drop_index(
        "ix_stationary_energy_staged_review_selections_run_user",
        table_name="stationary_energy_staged_review_selections",
    )
    op.drop_table("stationary_energy_staged_review_selections")
