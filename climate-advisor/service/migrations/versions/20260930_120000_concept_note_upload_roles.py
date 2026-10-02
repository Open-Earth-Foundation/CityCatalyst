"""Persist the role of run-scoped Concept Note source uploads.

Existing uploads remain ordinary references. Climate Action Plan uploads use
the same CC source storage, OCR, delivery and context-building pipeline.

Revision ID: 20260930_120000
Revises: 20260925_120000
"""

import sqlalchemy as sa
from alembic import op

revision = "20260930_120000"
down_revision = "20260925_120000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add an immutable source role, defaulting existing uploads to reference."""
    op.add_column(
        "concept_note_uploads",
        sa.Column(
            "source_role", sa.String(32), nullable=False, server_default="reference"
        ),
    )
    op.create_check_constraint(
        "ck_concept_note_uploads_source_role",
        "concept_note_uploads",
        "source_role IN ('reference', 'climate_action_plan')",
    )


def downgrade() -> None:
    """Remove role metadata while preserving uploaded documents."""
    op.drop_constraint(
        "ck_concept_note_uploads_source_role", "concept_note_uploads", type_="check"
    )
    op.drop_column("concept_note_uploads", "source_role")
