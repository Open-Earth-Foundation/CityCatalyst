"""Save partial gap-form answers on their gap version.

Revision ID: 20261121_120000
Revises: 20261111_120000
"""

import sqlalchemy as sa
from alembic import op

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
    """Allow a partial_answer event that names the gap version it answers."""
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


def downgrade() -> None:
    """Drop saved partial answers; resolved gaps and their answers are kept."""
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
