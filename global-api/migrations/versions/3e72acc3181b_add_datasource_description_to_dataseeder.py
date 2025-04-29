"""Add datasource_description to dataseeder

Revision ID: 3e72acc3181b
Revises: df2243cdb86d
Create Date: 2025-04-09 17:50:44.542118

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = '3e72acc3181b'
down_revision: Union[str, None] = 'df2243cdb86d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'datasource',
        sa.Column('datasource_description', JSONB, nullable=True),
        schema='public'
    )

def downgrade() -> None:
    op.drop_column(
        'datasource',
        'datasource_description',
        schema='public'
    )
