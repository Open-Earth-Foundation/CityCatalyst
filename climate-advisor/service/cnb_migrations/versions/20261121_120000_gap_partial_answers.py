"""Save partial gap-form answers and accepted narrowing progress per gap.

Revision ID: 20261121_120000
Revises: 20261111_120000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20261121_120000"
down_revision = "20261111_120000"
branch_labels = None
depends_on = None

# The initial resolution table passed an already prefixed name through the
# naming convention, so Postgres stores this truncated, hashed form.
OLD_ACTION_CHECK = "ck_concept_note_gap_resolutions_ck_concept_note_gap_res_f550"
ACTION_CHECK = "ck_concept_note_gap_resolutions_action_valid"
ACTIONS = "'answer', 'correction', 'not_a_gap', 'defer_as_caveat', 'evidence_update'"


def upgrade() -> None:
    """Allow versioned partial_answer events and add nullable gap answer progress."""
    # Partial answers name the gap version they answer.
    op.add_column(
        "concept_note_gap_resolutions",
        sa.Column("gap_version", sa.Integer(), nullable=True),
    )
    op.drop_constraint(
        op.f(OLD_ACTION_CHECK), "concept_note_gap_resolutions", type_="check"
    )
    op.create_check_constraint(
        op.f(ACTION_CHECK),
        "concept_note_gap_resolutions",
        f"action IN ({ACTIONS}, 'partial_answer')",
    )
    # Accepted narrowing progress; existing gaps start as SQL NULL.
    op.add_column(
        "concept_note_gaps",
        sa.Column(
            "answer_progress", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
    )


def downgrade() -> None:
    """Drop narrowing progress and saved partial answers; resolved gaps are kept."""
    op.drop_column("concept_note_gaps", "answer_progress")
    op.execute(
        "DELETE FROM concept_note_gap_resolutions WHERE action = 'partial_answer'"
    )
    op.drop_constraint(
        op.f(ACTION_CHECK), "concept_note_gap_resolutions", type_="check"
    )
    op.create_check_constraint(
        op.f(OLD_ACTION_CHECK),
        "concept_note_gap_resolutions",
        f"action IN ({ACTIONS})",
    )
    op.drop_column("concept_note_gap_resolutions", "gap_version")
