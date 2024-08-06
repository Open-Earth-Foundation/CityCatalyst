"""Merge heads

Revision ID: 14281ed38551
Revises: 3ba93748222f, f8f5b2a87fff
Create Date: 2024-08-06 08:48:58.428337

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '14281ed38551'
down_revision: Union[str, None] = ('3ba93748222f', 'f8f5b2a87fff')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
