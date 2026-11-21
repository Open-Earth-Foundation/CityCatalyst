"""Persist accepted narrowing progress on each gap row.

Revision ID: 20261121_130000
Revises: 20261121_120000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20261121_130000"
down_revision = "20261121_120000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add a nullable JSONB progress column; existing gaps start as SQL NULL."""
    op.add_column(
        "concept_note_gaps",
        sa.Column(
            "answer_progress", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
    )


def downgrade() -> None:
    """Drop accepted narrowing progress; gap versions and resolutions are kept."""
    op.drop_column("concept_note_gaps", "answer_progress")
