"""Merge chat ownership and structured upload migration heads.

Revision ID: 20261005_120000
Revises: 20260925_130000, 20261001_120000
Create Date: 2026-10-05 12:00:00.000000

Both parent migrations retain their schema and data operations. This revision
only joins their histories so databases at either parent can upgrade to head.
"""

revision = "20261005_120000"
down_revision = ("20260925_130000", "20261001_120000")
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Join the parent revisions without changing schema or data."""
    pass


def downgrade() -> None:
    """Restore the parent revision markers without changing schema or data."""
    pass
