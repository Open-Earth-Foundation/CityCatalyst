"""Name the selected Concept Note funding reference as an opportunity.

Revision ID: 20260811_120000
Revises: 20260730_120000
Create Date: 2026-08-11 12:00:00.000000
"""

from alembic import op


revision = "20260811_120000"
down_revision = "20260730_120000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Rename the generic reference column to its actual entity type."""
    op.alter_column(
        "concept_note_runs",
        "selected_funding_record_id",
        new_column_name="selected_funding_opportunity_id",
        comment=(
            "External funding-opportunity identifier validated against managed "
            "CNB reference data"
        ),
    )


def downgrade() -> None:
    """Restore the legacy generic funding-reference column name."""
    op.alter_column(
        "concept_note_runs",
        "selected_funding_opportunity_id",
        new_column_name="selected_funding_record_id",
        comment=(
            "External funding-record identifier validated against managed CNB "
            "reference data"
        ),
    )
