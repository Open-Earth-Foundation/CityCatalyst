"""Attach chat threads to their owning Concept Note run.

Revision ID: 20260925_130000
Revises: 20260925_120000
Create Date: 2026-09-25 13:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260925_130000"
down_revision = "20260925_120000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add the owning-run column, backfill it from current runs, and index it."""
    op.add_column(
        "threads",
        sa.Column(
            "concept_note_run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "concept_note_runs.run_id",
                name="fk_threads_concept_note_run_id",
                ondelete="CASCADE",
            ),
            nullable=True,
            comment="Owning Concept Note run; NULL for general Climate Advisor chats",
        ),
    )
    # Every existing run points at exactly one live thread, so that pointer is
    # the authoritative backfill source (older threads were deleted on reset).
    op.execute(
        sa.text(
            """
            UPDATE threads
            SET concept_note_run_id = runs.run_id
            FROM concept_note_runs AS runs
            WHERE runs.thread_id = threads.thread_id
            """
        )
    )
    op.create_index(
        "ix_threads_concept_note_run_created",
        "threads",
        ["concept_note_run_id", "created_at"],
    )


def downgrade() -> None:
    """Drop the owning-run link; runs keep their active thread pointer."""
    op.drop_index("ix_threads_concept_note_run_created", table_name="threads")
    op.drop_column("threads", "concept_note_run_id")
