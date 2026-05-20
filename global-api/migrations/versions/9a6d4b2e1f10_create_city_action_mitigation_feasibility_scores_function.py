"""Create modelled.city_action_mitigation_feasibility_scores SQL function.

Revision ID: 9a6d4b2e1f10
Revises: 4b7e2a1c9d8f
Create Date: 2026-05-20 00:00:00.000000
"""
from pathlib import Path
from typing import Sequence, Union

from alembic import op


revision: str = "9a6d4b2e1f10"
down_revision: Union[str, None] = "4b7e2a1c9d8f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_SQL_PATH = (
    Path(__file__).resolve().parents[1] / "sql" / "city_action_mitigation_feasibility_scores.sql"
)


def upgrade() -> None:
    op.execute(_SQL_PATH.read_text())


def downgrade() -> None:
    op.execute(
        """
        DROP FUNCTION IF EXISTS modelled.city_action_mitigation_feasibility_scores(
            varchar,
            uuid,
            varchar
        );
        """
    )
