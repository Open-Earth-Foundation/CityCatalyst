"""rename geography table to dim_geography

Revision ID: 1973e633eea5
Revises: 949c5b9cc18d
Create Date: 2024-05-21 18:27:35.824586

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1973e633eea5'
down_revision: Union[str, None] = '949c5b9cc18d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE geography RENAME TO dim_geography")


def downgrade() -> None:
    op.execute("ALTER TABLE dim_geography RENAME TO geography")
