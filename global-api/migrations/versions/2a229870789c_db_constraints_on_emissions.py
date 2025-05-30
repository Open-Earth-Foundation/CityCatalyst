"""db constraints on emissions

Revision ID: 2a229870789c
Revises: e3c866a57c19
Create Date: 2025-05-29 16:30:45.121774

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2a229870789c'
down_revision: Union[str, None] = 'e3c866a57c19'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('emissions', 'emissions_year', type_=sa.Integer(), existing_type=sa.Numeric(), schema='modelled', nullable=False)
    op.alter_column(
        'emissions',
        'activity_value',
        type_=sa.Numeric(20, 8),
        existing_type=sa.Text(),
        schema='modelled',
        postgresql_using='activity_value::numeric(20,8)'
    )
    op.alter_column('emissions', 'city_id', type_=sa.String(), existing_type=sa.Text(), schema='modelled', nullable=False)
    op.alter_column('emissions', 'gpc_reference_number', type_=sa.String(), existing_type=sa.Text(), schema='modelled', nullable=False)
    op.alter_column('emissions', 'spatial_granularity', type_=sa.String(), existing_type=sa.Text(), schema='modelled', nullable=False)
    op.alter_column('emissions', 'datasource_name', type_=sa.String(), existing_type=sa.Text(), schema='modelled', nullable=False)
    op.alter_column('emissions', 'emissions_units', type_=sa.String(), existing_type=sa.Text(), schema='modelled', nullable=False)
    op.alter_column('emissions', 'gas_name', type_=sa.String(), existing_type=sa.Text(), schema='modelled', nullable=False)
    op.alter_column(
        'emissions',
        'emissions_value',
        type_=sa.Numeric(20, 8),
        existing_type=sa.Float(),
        schema='modelled',
        nullable=False,
        postgresql_using='emissions_value::numeric(20,8)'
    )
    op.alter_column('emissions', 'actor_id', type_=sa.String(), existing_type=sa.Text(), schema='modelled', nullable=False)
    op.alter_column('emissions', 'emissionfactor_id', type_=sa.String(), existing_type=sa.UUID(), schema='modelled')
    op.alter_column('emissions', 'geometry_type', type_=sa.String(), existing_type=sa.Text(), schema='modelled')
    op.alter_column('emissions', 'geometry_id', type_=sa.String(), existing_type=sa.Text(), schema='modelled')
    op.create_check_constraint(
        'check_emissions_units_kg',
        'emissions',
        "emissions_units = 'kg'",
        schema='modelled'
    )
    op.create_check_constraint(
        'check_gas_name_list',
        'emissions',
        "gas_name IN ('C2F6', 'CF4', 'CH4', 'CO', 'CO2', 'N20', 'N2O', 'NOx')",
        schema='modelled'
    )


def downgrade() -> None:
    op.alter_column(
        'emissions',
        'activity_value',
        type_=sa.Text(),
        existing_type=sa.Numeric(),
        schema='modelled',
        postgresql_using='activity_value::text'
    )
    op.alter_column('emissions', 'emissions_year', type_=sa.Numeric(), existing_type=sa.Integer(), schema='modelled', nullable=True)
    op.alter_column('emissions', 'city_id', type_=sa.Text(), existing_type=sa.String(), schema='modelled', nullable=True)
    op.alter_column('emissions', 'gpc_reference_number', type_=sa.Text(), existing_type=sa.String(), schema='modelled', nullable=True)
    op.alter_column('emissions', 'spatial_granularity', type_=sa.Text(), existing_type=sa.String(), schema='modelled', nullable=True)
    op.alter_column('emissions', 'datasource_name', type_=sa.Text(), existing_type=sa.String(), schema='modelled', nullable=True)
    op.alter_column('emissions', 'emissions_units', type_=sa.Text(), existing_type=sa.String(), schema='modelled', nullable=True)
    op.alter_column('emissions', 'gas_name', type_=sa.Text(), existing_type=sa.String(), schema='modelled', nullable=True)
    op.alter_column(
        'emissions',
        'emissions_value',
        type_=sa.Float(),
        existing_type=sa.Numeric(18, 8),
        schema='modelled',
        nullable=True,
        postgresql_using='emissions_value::float'
    )
    op.alter_column('emissions', 'actor_id', type_=sa.Text(), existing_type=sa.String(), schema='modelled', nullable=True)
    op.alter_column('emissions', 'emissionfactor_id', type_=sa.UUID(), existing_type=sa.String(), schema='modelled')
    op.alter_column('emissions', 'geometry_type', type_=sa.Text(), existing_type=sa.String(), schema='modelled')
    op.alter_column('emissions', 'geometry_id', type_=sa.Text(), existing_type=sa.String(), schema='modelled')
    op.drop_constraint('check_emissions_units_kg', 'emissions', type_='check', schema='modelled')
    op.drop_constraint('check_gas_name_list', 'emissions', type_='check', schema='modelled')
