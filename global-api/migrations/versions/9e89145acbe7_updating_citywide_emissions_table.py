"""updating_citywide_emissions_table

Revision ID: 9e89145acbe7
Revises: 88e4463fef06
Create Date: 2024-03-04 13:35:11.095765

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9e89145acbe7'
down_revision: Union[str, None] = '88e4463fef06'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("citywide_emissions", "emission_factor_value", nullable=True, type_=sa.Float)
    op.alter_column("citywide_emissions", "emission_factor_units", nullable=True, type_=sa.String)


def downgrade() -> None:
    op.alter_column("citywide_emissions", "emission_factor_value", nullable=False, type_=sa.Float)
    op.alter_column("citywide_emissions", "emission_factor_units", nullable=False, type_=sa.String)