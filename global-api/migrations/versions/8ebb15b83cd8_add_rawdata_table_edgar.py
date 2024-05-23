"""add rawdata table edgar

Revision ID: 8ebb15b83cd8
Revises: 7beb1eefd95c
Create Date: 2024-05-23 10:11:21.246776

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from geoalchemy2.types import Geometry

# revision identifiers, used by Alembic.
revision: str = '8ebb15b83cd8'
down_revision: Union[str, None] = '7beb1eefd95c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # Ensure the raw_data schema exists
    op.execute("CREATE SCHEMA IF NOT EXISTS raw_data")

    # Create custom_polygon table in raw_data schema
    op.create_table(
        'custom_polygon',
        sa.Column('locode', sa.String(), nullable=True),
        sa.Column('bbox_north', sa.Float(), nullable=True),
        sa.Column('bbox_south', sa.Float(), nullable=True),
        sa.Column('bbox_east', sa.Float(), nullable=True),
        sa.Column('bbox_west', sa.Float(), nullable=True),
        sa.Column('center_lat', sa.Float(), nullable=True),
        sa.Column('center_lon', sa.Float(), nullable=True),
        sa.Column('geometry', Geometry(geometry_type='GEOMETRY', srid=4326), nullable=True),
        schema='raw_data'
    )

    # Create edgar_emissions table in raw_data schema
    op.create_table(
        'edgar_emissions',
        sa.Column('geometry', Geometry(geometry_type='GEOMETRY', srid=4326), nullable=True),
        sa.Column('lat', sa.Float(), nullable=True),
        sa.Column('lon', sa.Float(), nullable=True),
        sa.Column('emissions', sa.Float(), nullable=True),
        sa.Column('lat_units', sa.String(), nullable=True),
        sa.Column('lon_units', sa.String(), nullable=True),
        sa.Column('emissions_substance', sa.String(), nullable=True),
        sa.Column('emissions_year', sa.Integer(), nullable=True),
        sa.Column('emissions_units', sa.String(), nullable=True),
        sa.Column('emissions_release', sa.String(), nullable=True),
        sa.Column('emissions_description', sa.String(), nullable=True),
        sa.Column('edgar_sector', sa.String(), nullable=True),
        sa.Column('ipcc_2006_code', sa.String(), nullable=True),
        sa.Column('gpc_refno', sa.String(), nullable=True),
        schema='raw_data'
    )

    # Create osm_city_polygon table in raw_data schema
    op.create_table(
        'osm_city_polygon',
        sa.Column('locode', sa.String(), nullable=True),
        sa.Column('osmid', sa.String(), nullable=True),
        sa.Column('geometry', Geometry(geometry_type='GEOMETRY', srid=4326), nullable=True),
        sa.Column('geometry_type', sa.String(), nullable=True),
        sa.Column('bbox_north', sa.Float(), nullable=True),
        sa.Column('bbox_south', sa.Float(), nullable=True),
        sa.Column('bbox_east', sa.Float(), nullable=True),
        sa.Column('bbox_west', sa.Float(), nullable=True),
        sa.Column('place_id', sa.String(), nullable=True),
        sa.Column('osm_type', sa.String(), nullable=True),
        sa.Column('osm_id', sa.String(), nullable=True),
        sa.Column('lat', sa.Float(), nullable=True),
        sa.Column('lon', sa.Float(), nullable=True),
        sa.Column('geom_class', sa.String(), nullable=True),
        sa.Column('geom_type', sa.String(), nullable=True),
        sa.Column('place_rank', sa.Integer(), nullable=True),
        sa.Column('importance', sa.Float(), nullable=True),
        sa.Column('addresstype', sa.String(), nullable=True),
        sa.Column('geom_name', sa.String(), nullable=True),
        sa.Column('display_name', sa.String(), nullable=True),
        schema='raw_data'
    )


def downgrade():
    # Drop osm_city_polygon table from raw_data schema
    op.drop_table('osm_city_polygon', schema='raw_data')

    # Drop edgar_emissions table from raw_data schema
    op.drop_table('edgar_emissions', schema='raw_data')

    # Drop custom_polygon table from raw_data schema
    op.drop_table('custom_polygon', schema='raw_data')
