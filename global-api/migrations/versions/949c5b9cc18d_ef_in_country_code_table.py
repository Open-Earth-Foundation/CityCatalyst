"""EF_in_country_code_table

Revision ID: 949c5b9cc18d
Revises: 583858ff1aa8
Create Date: 2024-04-03 10:24:31.131245

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '949c5b9cc18d'
down_revision: Union[str, None] = '583858ff1aa8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("country_code", "emission_factor_value", nullable=True, type_=sa.Float)
    op.alter_column("country_code", "emission_factor_units", nullable=True, type_=sa.String)


def downgrade() -> None:
    op.drop_column("country_code", "emission_factor_value", nullable=False, type_=sa.Float)
    op.drop_column("country_code", "emission_factor_units", nullable=False, type_=sa.String)
