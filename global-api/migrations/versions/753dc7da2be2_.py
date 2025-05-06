"""empty message

Revision ID: 753dc7da2be2
Revises: 3cf90f0fc5a8, 3e72acc3181b
Create Date: 2025-04-25 15:19:00.423444

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '753dc7da2be2'
down_revision: Union[str, None] = ('3cf90f0fc5a8', '3e72acc3181b')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
