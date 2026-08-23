"""Add structured gap resolution and chapter confirmation lifecycle.

Revision ID: 20260823_120000
Revises: 20260821_120000
Create Date: 2026-08-23 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260823_120000"
down_revision: str | Sequence[str] | None = "20260821_120000"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the audited gap-resolution and chapter-review lifecycle."""
    # Extend chapters with an exact confirmation pointer and regeneration state.
    op.add_column(
        "concept_note_chapters",
        sa.Column(
            "confirmed_revision_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
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
    op.create_foreign_key(
        "fk_cnb_chapters_confirmed_revision",
        "concept_note_chapters",
        "concept_note_chapter_revisions",
        ["confirmed_revision_id"],
        ["revision_id"],
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        "ck_concept_note_chapters_regeneration_status_valid",
        "concept_note_chapters",
        "regeneration_status IN ('idle', 'processing', 'failed')",
    )

    # Migrate legacy gap strings into the structured contract.
    op.add_column(
        "concept_note_gaps",
        sa.Column("question", sa.Text(), nullable=True),
    )
    op.add_column(
        "concept_note_gaps",
        sa.Column("why_asking", sa.Text(), nullable=True),
    )
    op.add_column(
        "concept_note_gaps",
        sa.Column(
            "suggestions",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "concept_note_gaps",
        sa.Column(
            "source_refs",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "concept_note_gaps",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "concept_note_gaps",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.execute(
        """
        UPDATE concept_note_gaps
        SET question = reason,
            why_asking = 'This information is required to complete the chapter.',
            severity = 'critical',
            field_key = COALESCE(
                field_key,
                'legacy_' || replace(gap_id::text, '-', '_')
            )
        """
    )
    op.alter_column("concept_note_gaps", "field_key", nullable=False)
    op.alter_column("concept_note_gaps", "question", nullable=False)
    op.alter_column("concept_note_gaps", "why_asking", nullable=False)
    op.drop_column("concept_note_gaps", "reason")
    op.create_check_constraint(
        "ck_concept_note_gaps_severity_valid",
        "concept_note_gaps",
        "severity IN ('critical', 'noncritical')",
    )
    op.create_check_constraint(
        "ck_concept_note_gaps_status_valid",
        "concept_note_gaps",
        "status IN ('open', 'processing', 'resolved', 'dismissed', 'caveat')",
    )
    op.create_check_constraint(
        "ck_concept_note_gaps_version_positive",
        "concept_note_gaps",
        "version > 0",
    )

    # Store every resolution and review as an immutable audit event.
    op.create_table(
        "concept_note_gap_resolutions",
        sa.Column("resolution_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("gap_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("actor_user_id", sa.String(length=255), nullable=False),
        sa.Column(
            "source_refs",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("idempotency_key", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "action IN ('answer', 'correction', 'not_a_gap', "
            "'defer_as_caveat', 'evidence_update')",
            name="ck_concept_note_gap_resolutions_action_valid",
        ),
        sa.ForeignKeyConstraint(
            ["gap_id"],
            ["concept_note_gaps.gap_id"],
            name="fk_concept_note_gap_resolutions_gap_id_gaps",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "resolution_id",
            name="pk_concept_note_gap_resolutions",
        ),
        sa.UniqueConstraint(
            "gap_id",
            "idempotency_key",
            name="uq_concept_note_gap_resolutions_idempotency",
        ),
    )
    op.create_index(
        "ix_concept_note_gap_resolutions_gap",
        "concept_note_gap_resolutions",
        ["gap_id", "created_at"],
    )
    op.create_table(
        "concept_note_chapter_reviews",
        sa.Column("review_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chapter_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("revision_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column("idempotency_key", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["chapter_id"],
            ["concept_note_chapters.chapter_id"],
            name="fk_concept_note_chapter_reviews_chapter_id_chapters",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["revision_id"],
            ["concept_note_chapter_revisions.revision_id"],
            name="fk_concept_note_chapter_reviews_revision_id_revisions",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("review_id", name="pk_concept_note_chapter_reviews"),
        sa.UniqueConstraint(
            "chapter_id",
            "idempotency_key",
            name="uq_concept_note_chapter_reviews_idempotency",
        ),
    )
    op.create_index(
        "ix_concept_note_chapter_reviews_chapter",
        "concept_note_chapter_reviews",
        ["chapter_id", "created_at"],
    )


def downgrade() -> None:
    """Restore the original string-only gap representation."""
    op.drop_index(
        "ix_concept_note_chapter_reviews_chapter",
        table_name="concept_note_chapter_reviews",
    )
    op.drop_table("concept_note_chapter_reviews")
    op.drop_index(
        "ix_concept_note_gap_resolutions_gap",
        table_name="concept_note_gap_resolutions",
    )
    op.drop_table("concept_note_gap_resolutions")

    op.drop_constraint(
        "ck_concept_note_gaps_version_positive",
        "concept_note_gaps",
        type_="check",
    )
    op.drop_constraint(
        "ck_concept_note_gaps_status_valid",
        "concept_note_gaps",
        type_="check",
    )
    op.drop_constraint(
        "ck_concept_note_gaps_severity_valid",
        "concept_note_gaps",
        type_="check",
    )
    op.add_column(
        "concept_note_gaps",
        sa.Column("reason", sa.Text(), nullable=True),
    )
    op.execute("UPDATE concept_note_gaps SET reason = question")
    op.alter_column("concept_note_gaps", "reason", nullable=False)
    op.drop_column("concept_note_gaps", "updated_at")
    op.drop_column("concept_note_gaps", "version")
    op.drop_column("concept_note_gaps", "source_refs")
    op.drop_column("concept_note_gaps", "suggestions")
    op.drop_column("concept_note_gaps", "why_asking")
    op.drop_column("concept_note_gaps", "question")
    op.alter_column("concept_note_gaps", "field_key", nullable=True)
    op.execute("UPDATE concept_note_gaps SET severity = 'missing_information'")

    op.drop_constraint(
        "ck_concept_note_chapters_regeneration_status_valid",
        "concept_note_chapters",
        type_="check",
    )
    op.drop_constraint(
        "fk_cnb_chapters_confirmed_revision",
        "concept_note_chapters",
        type_="foreignkey",
    )
    op.drop_column("concept_note_chapters", "regeneration_error")
    op.drop_column("concept_note_chapters", "regeneration_status")
    op.drop_column("concept_note_chapters", "confirmed_revision_id")
