"""add-EDGAR-tables

Revision ID: 64eb87bae0a3
Revises: bd6c5bbd6eb4
Create Date: 2023-09-18 12:25:22.687198

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text

# revision identifiers, used by Alembic.
revision: str = '64eb87bae0a3'
down_revision: Union[str, None] = 'bd6c5bbd6eb4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('edgar_grid',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('lat_center', sa.Float, nullable=False),
        sa.Column('lon_center', sa.Float, nullable=False),
        sa.Column('geometry', sa.String, nullable=False),
        sa.Column('area', sa.Float, nullable=False),
        sa.Column("created_date", sa.DateTime(), nullable=False),
        sa.Column("modified_date", sa.DateTime(), server_default=text('CURRENT_TIMESTAMP'))
    )

    op.create_table('edgar_data',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('year', sa.Integer, nullable=False),
        sa.Column('reference_number', sa.String, nullable=False),
        sa.Column("gas", sa.String(), nullable=False),
        sa.Column("emissions_quantity", sa.Integer(), nullable=False),
        sa.Column("emissions_quantity_units", sa.String(), nullable=False),
        sa.Column('grid_id', sa.Integer, sa.ForeignKey('edgar_grid.id'), nullable=False),
        sa.Column("created_date", sa.DateTime(), nullable=False),
        sa.Column("modified_date", sa.DateTime(), server_default=text('CURRENT_TIMESTAMP'))
    )

    op.create_table('edgar_city_data',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('locode', sa.String, nullable=False),
        sa.Column('fraction_in_city', sa.Float, nullable=False),
        sa.Column('grid_id', sa.Integer, sa.ForeignKey('edgar_grid.id'), nullable=False),
        sa.Column("created_date", sa.DateTime(), nullable=False),
        sa.Column("modified_date", sa.DateTime(), server_default=text('CURRENT_TIMESTAMP'))
    )


def downgrade() -> None:
    op.drop_table('edgar_city_data')
    op.drop_table('edgar_data')
    op.drop_table('edgar_grid')
