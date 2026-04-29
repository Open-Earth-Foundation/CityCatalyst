"""add_dataset_id_and_release_id_to_city_polygon

Revision ID: 9bed789e7eda
Revises: 62abd6613eef
Create Date: 2026-03-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = '9bed789e7eda'
down_revision: Union[str, None] = '62abd6613eef'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'city_polygon',
        sa.Column('dataset_id', UUID(as_uuid=True), nullable=True),
        schema='modelled'
    )
    op.add_column(
        'city_polygon',
        sa.Column('release_id', UUID(as_uuid=True), nullable=True),
        schema='modelled'
    )


def downgrade() -> None:
    op.drop_column('city_polygon', 'release_id', schema='modelled')
    op.drop_column('city_polygon', 'dataset_id', schema='modelled')
