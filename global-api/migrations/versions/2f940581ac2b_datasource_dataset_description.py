"""datasource.dataset_description

Revision ID: 2f940581ac2b
Revises: f852767448af
Create Date: 2024-03-29 15:05:42.928203

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2f940581ac2b'
down_revision: Union[str, None] = 'f852767448af'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.add_column('datasource', sa.Column("dataset_description", sa.Text(), nullable=True))
    pass


def downgrade() -> None:
    op.drop_column('datasource', 'dataset_description')
    pass