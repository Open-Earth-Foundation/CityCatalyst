"""Persist semantic-review objections on failed Concept Note edit proposals.

Revision ID: 20261111_120000
Revises: 20260921_120000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20261111_120000"
down_revision = "20260921_120000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Keep why review rejected a proposal so chat can explain the failure."""
    op.add_column(
        "concept_note_edit_proposals",
        sa.Column(
            "review_objections",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    """Remove review objections without changing proposals or draft revisions."""
    op.drop_column("concept_note_edit_proposals", "review_objections")
