"""country code emissions units fix

Revision ID: 3b807ef9772b
Revises: b942f4d726be
Create Date: 2024-02-06 10:31:19.606284

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3b807ef9772b'
down_revision: Union[str, None] = 'b942f4d726be'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('country_code', 'emissions_units', type_=sa.String(255))
    pass


def downgrade() -> None:
    op.alter_column('country_code', 'emissions_units', type_=sa.Float)
    pass
