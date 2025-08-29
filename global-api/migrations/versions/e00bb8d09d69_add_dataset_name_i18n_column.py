"""add_dataset_name_i18n_column

Revision ID: e00bb8d09d69
Revises: 845b4eb9e3b7
Create Date: 2025-08-28 21:48:23.740078

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = 'e00bb8d09d69'
down_revision: Union[str, None] = '845b4eb9e3b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add dataset_name_i18n JSONB column to modelled.publisher_datasource table
    op.add_column(
        'publisher_datasource',
        sa.Column('dataset_name_i18n', JSONB, nullable=True),
        schema='modelled'
    )


def downgrade() -> None:
    # Drop dataset_name_i18n column from modelled.publisher_datasource table
    op.drop_column(
        'publisher_datasource',
        'dataset_name_i18n',
        schema='modelled'
    )
