"""empty message

Revision ID: b942f4d726be
Revises: 65608a44ede7, 88e4463fef06
Create Date: 2024-02-06 10:15:06.316608

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b942f4d726be'
down_revision: Union[str, None] = ('65608a44ede7', '88e4463fef06')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
