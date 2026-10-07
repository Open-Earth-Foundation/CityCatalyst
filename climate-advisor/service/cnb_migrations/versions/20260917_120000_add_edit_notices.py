"""Persist server-counted exclusions on Concept Note edit proposals.

Revision ID: 20260917_120000
Revises: 20260909_120000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260917_120000"
down_revision = "20260909_120000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Retain exclusions across proposal reload and acceptance."""
    op.add_column(
        "concept_note_edit_proposals",
        sa.Column(
            "notices",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    """Remove proposal notices without changing draft revisions."""
    op.drop_column("concept_note_edit_proposals", "notices")
