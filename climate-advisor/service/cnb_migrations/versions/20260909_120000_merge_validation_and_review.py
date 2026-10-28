"""Join chapter validation and reviewed chat-edit migration branches.

Revision ID: 20260909_120000
Revises: 20260828_120000, 20260907_120000
Create Date: 2026-09-09 12:00:00
"""

from collections.abc import Sequence

revision: str = "20260909_120000"
down_revision: str | Sequence[str] | None = (
    "20260828_120000",
    "20260907_120000",
)
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Join both existing schemas without changing their data."""


def downgrade() -> None:
    """Restore the two parent heads without changing their data."""
