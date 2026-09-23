"""Track chapter regeneration state after a gap is resolved.

Revision ID: 20260924_120000
Revises: 20260921_120000
Create Date: 2026-09-24 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260924_120000"
down_revision: str | Sequence[str] | None = "20260921_120000"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add regeneration status and error columns to chapters."""
    op.add_column(
        "concept_note_chapters",
        sa.Column(
            "regeneration_status",
            sa.String(length=32),
            nullable=False,
            server_default="idle",
        ),
    )
    op.add_column(
        "concept_note_chapters",
        sa.Column("regeneration_error", sa.String(length=255), nullable=True),
    )
    op.create_check_constraint(
        "ck_concept_note_chapters_regeneration_status_valid",
        "concept_note_chapters",
        "regeneration_status IN ('idle', 'processing', 'failed')",
    )


def downgrade() -> None:
    """Drop chapter regeneration state tracking."""
    op.drop_constraint(
        "ck_concept_note_chapters_regeneration_status_valid",
        "concept_note_chapters",
        type_="check",
    )
    op.drop_column("concept_note_chapters", "regeneration_error")
    op.drop_column("concept_note_chapters", "regeneration_status")
