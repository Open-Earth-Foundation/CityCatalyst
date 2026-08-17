"""Add Stationary Energy notation-key review fields.

Revision ID: 20260701_120000
Revises: 20260616_090000
Create Date: 2026-07-01 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260701_120000"
down_revision = "20260616_090000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add notation-key metadata to staged and saved review selections."""
    op.add_column(
        "stationary_energy_staged_review_selections",
        sa.Column("notation_key", sa.String(length=8), nullable=True),
    )
    op.add_column(
        "stationary_energy_staged_review_selections",
        sa.Column("unavailable_reason", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "stationary_energy_staged_review_selections",
        sa.Column("unavailable_explanation", sa.Text(), nullable=True),
    )
    op.add_column(
        "stationary_energy_review_decisions",
        sa.Column("notation_key", sa.String(length=8), nullable=True),
    )
    op.add_column(
        "stationary_energy_review_decisions",
        sa.Column("unavailable_reason", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "stationary_energy_review_decisions",
        sa.Column("unavailable_explanation", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    """Remove Stationary Energy notation-key review metadata."""
    op.drop_column("stationary_energy_review_decisions", "unavailable_explanation")
    op.drop_column("stationary_energy_review_decisions", "unavailable_reason")
    op.drop_column("stationary_energy_review_decisions", "notation_key")
    op.drop_column(
        "stationary_energy_staged_review_selections",
        "unavailable_explanation",
    )
    op.drop_column("stationary_energy_staged_review_selections", "unavailable_reason")
    op.drop_column("stationary_energy_staged_review_selections", "notation_key")
