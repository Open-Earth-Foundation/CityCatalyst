"""merge-all

Revision ID: 3524677cf0b8
Revises: 42369fa38057, 520c99e561eb, 66e9fef4a07a
Create Date: 2023-11-03 12:19:39.727315

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3524677cf0b8'
down_revision: Union[str, None] = ('42369fa38057', '520c99e561eb', '66e9fef4a07a')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
