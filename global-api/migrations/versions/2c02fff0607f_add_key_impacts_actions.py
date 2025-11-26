"""add_key_impacts_actions

Revision ID: 2c02fff0607f
Revises: d3f9011814f9
Create Date: 2025-11-17 04:33:26.422483

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY


# revision identifiers, used by Alembic.
revision: str = '2c02fff0607f'
down_revision: Union[str, None] = 'd3f9011814f9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'cap_climate_action',
        sa.Column('key_impacts', ARRAY(sa.String), nullable=True),
        schema='modelled'
    )


def downgrade() -> None:
    op.drop_column('cap_climate_action', 'key_impacts', schema='modelled')
