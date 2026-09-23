"""Persist chapter descriptions and structural proposal previews.

Revision ID: 20260921_120000
Revises: 20260917_120000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260921_120000"
down_revision = "20260917_120000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Store per-run descriptions and durable reviewable structure proposals."""
    op.add_column(
        "concept_note_chapters",
        sa.Column("description", sa.Text(), nullable=True),
    )
    op.add_column(
        "concept_note_edit_proposals",
        sa.Column("structure", postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    """Remove structural metadata without removing chapter revisions."""
    op.drop_column("concept_note_edit_proposals", "structure")
    op.drop_column("concept_note_chapters", "description")
