"""Merge chat ownership and custom template migration heads.

Revision ID: 20261011_120000
Revises: 20261008_120000, 20261007_120000
Create Date: 2026-10-11 12:00:00.000000

Keep both migration histories intact so existing databases on either branch
can upgrade to a single head without repeating schema or data operations.
"""

revision = "20261011_120000"
down_revision = ("20261008_120000", "20261007_120000")
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Join the parent revisions without changing schema or data."""
    pass


def downgrade() -> None:
    """Restore the parent revision markers without changing schema or data."""
    pass
