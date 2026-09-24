"""Store structured PDF artifact identity beside Concept Note Markdown.

Revision ID: 20260922_120000
Revises: 20260811_120000
Create Date: 2026-09-22 12:00:00.000000
"""

import sqlalchemy as sa
from alembic import op

revision = "20260922_120000"
down_revision = "20260811_120000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add nullable structured-artifact columns without rewriting legacy rows."""
    op.add_column(
        "concept_note_uploads",
        sa.Column("annotation_mode", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "concept_note_uploads",
        sa.Column("structured_s3_key", sa.String(length=1024), nullable=True),
    )
    op.add_column(
        "concept_note_uploads",
        sa.Column("structured_sha256", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "concept_note_uploads",
        sa.Column("structured_size_bytes", sa.Integer(), nullable=True),
    )
    op.add_column(
        "concept_note_uploads",
        sa.Column("structured_schema_version", sa.String(length=64), nullable=True),
    )
    op.create_check_constraint(
        "ck_concept_note_uploads_structured_identity",
        "concept_note_uploads",
        """
        (
            annotation_mode IS NULL
            AND structured_s3_key IS NULL
            AND structured_sha256 IS NULL
            AND structured_size_bytes IS NULL
            AND structured_schema_version IS NULL
        )
        OR
        (
            annotation_mode IN ('none', 'visual_context')
            AND structured_s3_key IS NOT NULL
            AND structured_sha256 IS NOT NULL
            AND structured_size_bytes > 0
            AND structured_schema_version IS NOT NULL
        )
        """,
    )


def downgrade() -> None:
    """Remove structured artifact columns and leave Markdown pointers intact."""
    op.drop_constraint(
        "ck_concept_note_uploads_structured_identity",
        "concept_note_uploads",
        type_="check",
    )
    op.drop_column("concept_note_uploads", "structured_schema_version")
    op.drop_column("concept_note_uploads", "structured_size_bytes")
    op.drop_column("concept_note_uploads", "structured_sha256")
    op.drop_column("concept_note_uploads", "structured_s3_key")
    op.drop_column("concept_note_uploads", "annotation_mode")
