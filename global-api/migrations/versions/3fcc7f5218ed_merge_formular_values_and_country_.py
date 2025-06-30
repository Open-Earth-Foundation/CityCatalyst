"""merge formular_values and country_region_city_columns changes

Revision ID: 3fcc7f5218ed
Revises: 83dae560c337, d84e47e54741
Create Date: 2025-06-20 13:32:50.060325

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3fcc7f5218ed'
down_revision: Union[str, None] = ('83dae560c337', 'd84e47e54741')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
