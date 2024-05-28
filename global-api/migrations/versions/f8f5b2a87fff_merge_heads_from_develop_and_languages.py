"""Merge heads from develop and languages

Revision ID: f8f5b2a87fff
Revises: c360f7e67f44, 77d1cb7b24df
Create Date: 2024-05-28 08:30:14.654581

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f8f5b2a87fff'
down_revision: Union[str, None] = ('c360f7e67f44', '77d1cb7b24df')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
