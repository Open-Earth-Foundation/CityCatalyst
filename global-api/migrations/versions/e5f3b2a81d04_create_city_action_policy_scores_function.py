"""Create modelled.city_action_policy_scores(locode, release_id) SQL function.

Revision ID: e5f3b2a81d04
Revises: d4e8a1c92f03
Create Date: 2026-05-19 00:00:00.000000

Computes per-city action policy scores from modelled.action_policy_signals using
scoring_rubric v0.2.0 (K=4.0, relevance cap). No materialized table — parameterized
by locode and release_id.
"""
from pathlib import Path
from typing import Sequence, Union

from alembic import op


revision: str = "e5f3b2a81d04"
down_revision: Union[str, None] = "d4e8a1c92f03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_SQL_PATH = (
    Path(__file__).resolve().parents[1] / "sql" / "city_action_policy_scores.sql"
)


def upgrade() -> None:
    op.execute(_SQL_PATH.read_text())


def downgrade() -> None:
    op.execute(
        """
        DROP FUNCTION IF EXISTS modelled.city_action_policy_scores(
            varchar,
            uuid,
            integer
        );
        """
    )
