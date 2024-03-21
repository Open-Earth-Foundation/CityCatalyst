"""allow null values in citywide_emissions

Revision ID: 0ca75cb48d2c
Revises: 3b807ef9772b
Create Date: 2024-02-29 12:33:15.109520

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0ca75cb48d2c"
down_revision: Union[str, None] = "3b807ef9772b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "citywide_emissions",
        "emission_factor_value",
        existing_type=sa.Float(),
        nullable=True,
    )
    op.alter_column(
        "citywide_emissions",
        "emission_factor_units",
        existing_type=sa.String(),
        nullable=True,
    )
    op.alter_column(
        "citywide_emissions", "activity_name", existing_type=sa.String(), nullable=True
    )


def downgrade() -> None:
    op.alter_column(
        "citywide_emissions",
        "emission_factor_value",
        existing_type=sa.Float(),
        nullable=False,
    )
    op.alter_column(
        "citywide_emissions",
        "emission_factor_units",
        existing_type=sa.String(),
        nullable=False,
    )
    op.alter_column(
        "citywide_emissions", "activity_name", existing_type=sa.String(), nullable=False
    )
