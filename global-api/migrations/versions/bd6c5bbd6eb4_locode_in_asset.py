"""locode in asset

Revision ID: bd6c5bbd6eb4
Revises: 34acb9d76c8e
Create Date: 2023-08-23 09:52:07.401156

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bd6c5bbd6eb4'
down_revision: Union[str, None] = '34acb9d76c8e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('asset',
                    sa.Column("locode", sa.String(), index=True, nullable=True))


def downgrade() -> None:
    op.drop_column('asset', 'locode')
