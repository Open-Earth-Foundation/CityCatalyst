"""Enforce one application template per funding opportunity.

Revision ID: 20260821_120000
Revises: 20260803_120000
Create Date: 2026-08-21 12:00:00
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260821_120000"
down_revision: str | Sequence[str] | None = "20260803_120000"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Replace the name-scoped constraint with the product-level invariant."""
    op.drop_constraint(
        "uq_funder_templates_opportunity_name",
        "funder_templates",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_funder_templates_opportunity",
        "funder_templates",
        ["funding_opportunity_id"],
    )


def downgrade() -> None:
    """Restore support for multiple named templates per opportunity."""
    op.drop_constraint(
        "uq_funder_templates_opportunity",
        "funder_templates",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_funder_templates_opportunity_name",
        "funder_templates",
        ["funding_opportunity_id", "template_name"],
    )
