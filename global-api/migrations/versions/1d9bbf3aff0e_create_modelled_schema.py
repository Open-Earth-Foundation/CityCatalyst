"""create_modelled_schema

Revision ID: 1d9bbf3aff0e
Revises: 14281ed38551
Create Date: 2024-08-25 21:11:36.082604

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = '1d9bbf3aff0e'
down_revision: Union[str, None] = '14281ed38551'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    # Create the 'modelled' schema if it does not exist
    if 'modelled' not in inspector.get_schema_names():
        op.execute("CREATE SCHEMA modelled")

    # Check if the 'activity_subcategory' table already exists
    if 'activity_subcategory' not in inspector.get_table_names(schema='modelled'):
        op.create_table(
            'activity_subcategory',
            sa.Column('activity_id', sa.UUID(), primary_key=True),
            sa.Column('activity_name', sa.Text(), nullable=True),
            sa.Column('activity_units', sa.Text(), nullable=True),
            sa.Column('gpcmethod_id', sa.UUID(), nullable=True),
            sa.Column('activity_subcategory_type', sa.JSON(), nullable=True),
            schema='modelled'  # Specify the schema here
        )

    # Check if the 'emissions' table already exists
    if 'emissions' not in inspector.get_table_names(schema='modelled'):
        op.create_table(
            'emissions',
            sa.Column('emissions_id', sa.UUID(), primary_key=True),
            sa.Column('datasource_name', sa.Text(), nullable=True),
            sa.Column('actor_id', sa.String(), nullable=True),
            sa.Column('city_id', sa.Text(), nullable=True),
            sa.Column('gpc_reference_number', sa.Text(), nullable=True),
            sa.Column('emissions_value', sa.Float(), nullable=True),
            sa.Column('emissions_year', sa.Numeric(), nullable=True),
            sa.Column('emissions_units', sa.Text(), nullable=True),
            sa.Column('gpcmethod_id', sa.UUID(), nullable=True),
            sa.Column('gas_name', sa.Text(), nullable=True),
            sa.Column('emissionfactor_id', sa.UUID(), nullable=True),
            sa.Column('activity_id', sa.UUID(), nullable=True),
            sa.Column('activity_value', sa.Text(), nullable=True),
            sa.Column('spatial_granularity', sa.Text(), nullable=False),
            sa.Column('geometry_type', sa.Text(), nullable=True),
            sa.Column('geometry', sa.ARRAY(sa.Text()), nullable=True),  # Adjust if using PostGIS or other
            sa.Column('geometry_id', sa.Text(), nullable=True),
            schema='modelled'  # Specify the schema here
        )

    # Check if the 'gpc_methodology' table already exists
    if 'gpc_methodology' not in inspector.get_table_names(schema='modelled'):
        op.create_table(
            'gpc_methodology',
            sa.Column('gpcmethod_id', sa.UUID(), primary_key=True),
            sa.Column('methodology_name', sa.Text(), nullable=True),
            sa.Column('methodology_description', sa.Text(), nullable=True),
            sa.Column('gpc_reference_number', sa.Text(), nullable=True),
            sa.Column('scope', sa.Integer(), nullable=True),  # Changed to Integer for SQL compatibility
            schema='modelled'  # Specify the schema here
        )

    # Check if the 'emissions_factor' table already exists
    if 'emissions_factor' not in inspector.get_table_names(schema='modelled'):
        op.create_table(
            'emissions_factor',
            sa.Column('emissionfactor_id', sa.UUID(), primary_key=True),  # Set as primary key directly
            sa.Column('gas_name', sa.Text(), nullable=True),
            sa.Column('emissionfactor_value', sa.Float(), nullable=True),
            sa.Column('unit_denominator', sa.Text(), nullable=True),
            sa.Column('activity_id', sa.UUID(), nullable=True),
            sa.Column('datasource_name', sa.Text(), nullable=True),
            sa.Column('active_from', sa.Date(), nullable=True),
            sa.Column('active_to', sa.Date(), nullable=True),
            sa.Column('actor_id', sa.Text(), nullable=True),
            schema='modelled'  # Specify the schema here
        )

    # Check if the 'global_warming_potential' table already exists
    if 'global_warming_potential' not in inspector.get_table_names(schema='modelled'):
        op.create_table(
            'global_warming_potential',
            sa.Column('gas_name', sa.VARCHAR(), nullable=True),
            sa.Column('time_horizon', sa.VARCHAR(), nullable=False),
            sa.Column('ar2', sa.Numeric(), nullable=True),
            sa.Column('ar3', sa.Numeric(), nullable=True),
            sa.Column('ar4', sa.Numeric(), nullable=True),
            sa.Column('ar5', sa.Numeric(), nullable=True),
            sa.Column('ar6', sa.Numeric(), nullable=True),
            schema='modelled'  # Specify the schema here
        )

def downgrade() -> None:
    op.drop_table('global_warming_potential', schema='modelled')  # Specify schema in downgrade
    op.drop_table('emissions_factor', schema='modelled')  # Specify schema in downgrade
    op.drop_table('gpc_methodology', schema='modelled')  # Specify schema in downgrade
    op.drop_table('emissions', schema='modelled')  # Specify schema in downgrade
    op.drop_table('activity_subcategory', schema='modelled')  # Drop activity_subcategory last
