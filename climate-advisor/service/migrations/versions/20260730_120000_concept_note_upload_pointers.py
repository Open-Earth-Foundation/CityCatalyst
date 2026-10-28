"""Store Concept Note Markdown by CC S3 pointer.

Revision ID: 20260730_120000
Revises: 20260729_120000
Create Date: 2026-07-30 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260730_120000"
down_revision = "20260729_120000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Allow pre-conversion uploads and replace inline Markdown with an S3 key."""
    op.add_column(
        "concept_note_uploads",
        sa.Column("markdown_s3_key", sa.String(length=1024), nullable=True),
    )
    op.alter_column(
        "concept_note_uploads",
        "markdown_sha256",
        existing_type=sa.String(length=64),
        nullable=True,
    )
    op.alter_column(
        "concept_note_uploads",
        "page_count",
        existing_type=sa.Integer(),
        nullable=True,
    )
    op.alter_column(
        "concept_note_uploads",
        "ingest_status",
        existing_type=sa.String(length=64),
        server_default="queued",
        existing_nullable=False,
    )
    op.drop_column("concept_note_uploads", "markdown_text")


def downgrade() -> None:
    """Restore the legacy schema with placeholders, not recovered Markdown.

    Empty Markdown and a zero hash only satisfy the legacy NOT NULL constraints;
    they cannot recover inline content discarded by the upgrade.
    """
    op.add_column(
        "concept_note_uploads",
        sa.Column("markdown_text", sa.Text(), nullable=True),
    )
    op.execute(
        sa.text(
            """
            UPDATE concept_note_uploads
            SET markdown_text = COALESCE(markdown_text, ''),
                markdown_sha256 = COALESCE(
                    markdown_sha256,
                    repeat('0', 64)
                ),
                page_count = COALESCE(page_count, 1)
            """
        )
    )
    op.alter_column(
        "concept_note_uploads",
        "markdown_text",
        existing_type=sa.Text(),
        nullable=False,
    )
    op.alter_column(
        "concept_note_uploads",
        "ingest_status",
        existing_type=sa.String(length=64),
        server_default="processing",
        existing_nullable=False,
    )
    op.alter_column(
        "concept_note_uploads",
        "page_count",
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.alter_column(
        "concept_note_uploads",
        "markdown_sha256",
        existing_type=sa.String(length=64),
        nullable=False,
    )
    op.drop_column("concept_note_uploads", "markdown_s3_key")
