"""initial schema

Revision ID: f7b5e625839a
Revises:
Create Date: 2023-08-22 08:55:06.135460

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text

# revision identifiers, used by Alembic.
revision: str = 'f7b5e625839a'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.create_table("asset",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("asset_id", sa.Integer(), nullable=True),
        sa.Column("filename", sa.String(), nullable=True),
        sa.Column("reference_number", sa.String(), nullable=True),
        sa.Column("iso3_country", sa.String(), nullable=True),
        sa.Column("original_inventory_sector", sa.String(), nullable=True),
        sa.Column("start_time", sa.DateTime(), nullable=True),
        sa.Column("end_time", sa.DateTime(), nullable=True),
        sa.Column("temporal_granularity", sa.String(), nullable=True),
        sa.Column("gas", sa.String(), nullable=True),
        sa.Column("emissions_quantity", sa.Integer(), nullable=True),
        sa.Column("emissions_factor", sa.Float(), nullable=True),
        sa.Column("emissions_factor_units", sa.String(), nullable=True),
        sa.Column("capacity", sa.Float(), nullable=True),
        sa.Column("capacity_units", sa.String(), nullable=True),
        sa.Column("capacity_factor", sa.Float(), nullable=True),
        sa.Column("activity", sa.Float(), nullable=True),
        sa.Column("activity_units", sa.String(), nullable=True),
        sa.Column("asset_name", sa.String(), nullable=True),
        sa.Column("asset_type", sa.String(), nullable=True),
        sa.Column("st_astext", sa.String(), nullable=True),
        sa.Column("lat", sa.Float(), nullable=True),
        sa.Column("lon", sa.Float(), nullable=True),
        sa.Column("created_date", sa.DateTime(), nullable=True),
        sa.Column("modified_date", sa.DateTime(), nullable=True),
        sa.Column("database_updated", sa.DateTime(), server_default=text('CURRENT_TIMESTAMP'))
    ),

def downgrade() -> None:
    op.drop_table("asset")
