"""Let a concept note use its own application template instead of a funder's.

Revision ID: 20261007_120000
Revises: 20261001_120000
Create Date: 2026-10-07 12:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20261007_120000"
down_revision = "20261001_120000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add a nullable template snapshot; existing runs keep their funding."""
    op.add_column(
        "concept_note_runs",
        sa.Column(
            "custom_template",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            comment="User-defined application template used instead of a funder programme",
        ),
    )


def downgrade() -> None:
    """Drop the run-owned template; runs fall back to having no template."""
    op.drop_column("concept_note_runs", "custom_template")
