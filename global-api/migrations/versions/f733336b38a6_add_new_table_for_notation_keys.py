"""add new table for notation keys

Revision ID: f733336b38a6
Revises: e00bb8d09d69
Create Date: 2025-10-15 09:12:24.360988

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f733336b38a6'
down_revision: Union[str, None] = 'e00bb8d09d69'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'ghgi_city_facility_occurance',
        sa.Column('id', sa.UUID(), nullable=False, primary_key=True),
        sa.Column('locode', sa.String(), nullable=False),
        sa.Column('gpc_reference_number', sa.String(), nullable=False),
        sa.Column('facility_count', sa.Integer(), nullable=True),
        sa.Column('datasource_year', sa.Integer(), nullable=True),
        sa.Column('datasource_name', sa.String(), nullable=False),
        sa.Column('spatial_granularity', sa.String(), nullable=True),
        sa.UniqueConstraint('locode', 'gpc_reference_number', 'datasource_name', name='uq_ghgi_city_facility_occurance'),
        schema='modelled'
    )


def downgrade() -> None:
    op.drop_table('ghgi_city_facility_occurance', schema='modelled')
