"""Add latest-result persistence for chapter readiness validation.

Revision ID: 20260828_120000
Revises: 20260821_120000
Create Date: 2026-08-28 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260828_120000"
down_revision: str | Sequence[str] | None = "20260821_120000"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create one replaceable validation result per concept-note chapter."""
    op.create_table(
        "concept_note_chapter_validations",
        sa.Column("validation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chapter_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "validated_revision_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        sa.Column(
            "validation_input_fingerprint",
            sa.String(length=64),
            nullable=False,
        ),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column(
            "checks",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "findings",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "validated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "status IN ('ready', 'needs_review', 'incomplete')",
            name=op.f("ck_concept_note_chapter_validations_status_valid"),
        ),
        sa.CheckConstraint(
            "length(validation_input_fingerprint) = 64",
            name=op.f("ck_concept_note_chapter_validations_fingerprint_length"),
        ),
        sa.ForeignKeyConstraint(
            ["chapter_id"],
            ["concept_note_chapters.chapter_id"],
            name="fk_cnb_chapter_validations_chapter",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["validated_revision_id"],
            ["concept_note_chapter_revisions.revision_id"],
            name="fk_cnb_chapter_validations_revision",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint(
            "validation_id",
            name="pk_concept_note_chapter_validations",
        ),
        sa.UniqueConstraint(
            "chapter_id",
            name="uq_concept_note_chapter_validations_chapter",
        ),
    )


def downgrade() -> None:
    """Remove persisted chapter validation results."""
    op.drop_table("concept_note_chapter_validations")
