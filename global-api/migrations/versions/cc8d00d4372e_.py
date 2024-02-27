"""empty message

Revision ID: cc8d00d4372e
Revises: 36933af0ca3a, dc1837707630
Create Date: 2024-01-04 14:45:48.849799

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cc8d00d4372e'
down_revision: Union[str, None] = ('36933af0ca3a', 'dc1837707630')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
