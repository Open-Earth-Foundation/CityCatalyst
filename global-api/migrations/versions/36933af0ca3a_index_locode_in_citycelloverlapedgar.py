"""index locode in CityCellOverlapEdgar

Revision ID: 36933af0ca3a
Revises: 06e906516a40
Create Date: 2023-11-18 00:22:35.786892

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '36933af0ca3a'
down_revision: Union[str, None] = '06e906516a40'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        op.f('ix_citycelloverlapedgar_locode'),
        'CityCellOverlapEdgar',
        ['locode'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_citycelloverlapedgar_locode'),
                  table_name='CityCellOverlapEdgar')
