"""empty message

Revision ID: f852767448af
Revises: 68a6467bb509, 9e89145acbe7
Create Date: 2024-03-29 14:56:33.290421

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f852767448af'
down_revision: Union[str, None] = ('68a6467bb509', '9e89145acbe7')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
