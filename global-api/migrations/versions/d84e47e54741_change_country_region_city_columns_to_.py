"""create_city_polygon_table

Revision ID: d84e47e54741
Revises: e3c866a57c19
Create Date: 2025-06-20 13:02:53.184967

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd84e47e54741'
down_revision: Union[str, None] = 'e3c866a57c19'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create city_polygon table
    op.create_table('city_polygon',
        sa.Column('city_id', sa.VARCHAR(), nullable=True),
        sa.Column('city_name', sa.VARCHAR(), nullable=False),
        sa.Column('city_type', sa.VARCHAR(), nullable=True),
        sa.Column('country_code', sa.VARCHAR(), nullable=False),
        sa.Column('region_code', sa.VARCHAR(), nullable=True),
        sa.Column('locode', sa.CHAR(), nullable=False),
        sa.Column('osm_id', sa.INTEGER(), nullable=True),
        sa.Column('geometry', sa.Text(), nullable=False),
        sa.Column('lat', sa.DOUBLE_PRECISION(), nullable=False),
        sa.Column('lon', sa.DOUBLE_PRECISION(), nullable=False),
        sa.Column('bbox_north', sa.DOUBLE_PRECISION(), nullable=False),
        sa.Column('bbox_south', sa.DOUBLE_PRECISION(), nullable=False),
        sa.Column('bbox_east', sa.DOUBLE_PRECISION(), nullable=False),
        sa.Column('bbox_west', sa.DOUBLE_PRECISION(), nullable=False),
        sa.PrimaryKeyConstraint('locode'),
        schema='modelled'
    )


def downgrade() -> None:
    # Drop city_polygon table
    op.drop_table('city_polygon', schema='modelled')
