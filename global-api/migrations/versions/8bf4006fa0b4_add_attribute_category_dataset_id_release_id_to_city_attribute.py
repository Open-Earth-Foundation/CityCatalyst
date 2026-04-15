"""add_attribute_category_dataset_id_release_id_to_city_attribute

Revision ID: 8bf4006fa0b4
Revises: 9bed789e7eda
Create Date: 2026-03-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = '8bf4006fa0b4'
down_revision: Union[str, None] = '9bed789e7eda'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'city_attribute',
        sa.Column('attribute_category', sa.String(), nullable=True),
        schema='modelled'
    )
    op.add_column(
        'city_attribute',
        sa.Column('dataset_id', UUID(as_uuid=True), nullable=True),
        schema='modelled'
    )
    op.add_column(
        'city_attribute',
        sa.Column('release_id', UUID(as_uuid=True), nullable=True),
        schema='modelled'
    )


def downgrade() -> None:
    op.drop_column('city_attribute', 'release_id', schema='modelled')
    op.drop_column('city_attribute', 'dataset_id', schema='modelled')
    op.drop_column('city_attribute', 'attribute_category', schema='modelled')
