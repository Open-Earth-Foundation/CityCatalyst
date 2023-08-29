"""emissions_quantity_units

Revision ID: d1b6acb48d66
Revises: f7b5e625839a
Create Date: 2023-08-23 09:19:47.568892

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1b6acb48d66'
down_revision: Union[str, None] = 'f7b5e625839a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('asset',
                  sa.Column("emissions_quantity_units", sa.String(), nullable=True))

def downgrade() -> None:
    op.drop_column('asset', 'emissions_quantity_units')
