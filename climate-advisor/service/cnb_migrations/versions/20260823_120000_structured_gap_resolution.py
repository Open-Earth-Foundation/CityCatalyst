"""Add chapter regeneration status tracking.

Revision ID: 20260823_120000
Revises: 20260821_120000
Create Date: 2026-08-23 12:00:00

The rest of this revision's original scope (structured gap fields,
concept_note_chapters.confirmed_revision_id, the gap_resolutions and
chapter_reviews audit tables) was independently reimplemented by
20260907_120000 (cnb_review_workflow) on the develop branch. Once both
branches merged, this revision was trimmed to keep only the pieces
20260907_120000 does not already provide, so the two branches join
cleanly at 20260923_120000 without re-creating the same columns/tables.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260823_120000"
down_revision: str | Sequence[str] | None = "20260821_120000"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Track chapter regeneration state after a gap is resolved."""
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
