"""add match_type and match_reason to modelled.action_policy_signals

Revision ID: a7c4e91b3d05
Revises: c3f9a7e1d2b8
Create Date: 2026-08-17 00:00:00.000000

Nullable columns on individual policy evidence rows:
- match_type: how the finding relates to the action (direct, indirect, contextual)
- match_reason: free-text explanation of that classification
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7c4e91b3d05"
down_revision: Union[str, None] = "c3f9a7e1d2b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "action_policy_signals",
        sa.Column("match_type", sa.String(), nullable=True),
        schema="modelled",
    )
    op.add_column(
        "action_policy_signals",
        sa.Column("match_reason", sa.Text(), nullable=True),
        schema="modelled",
    )
    op.create_check_constraint(
        "ck_action_policy_signals_match_type",
        "action_policy_signals",
        "match_type IS NULL OR match_type IN ('direct', 'indirect', 'contextual')",
        schema="modelled",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_action_policy_signals_match_type",
        "action_policy_signals",
        schema="modelled",
        type_="check",
    )
    op.drop_column("action_policy_signals", "match_reason", schema="modelled")
    op.drop_column("action_policy_signals", "match_type", schema="modelled")
