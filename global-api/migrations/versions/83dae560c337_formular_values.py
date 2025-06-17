"""formular_values

Revision ID: 83dae560c337
Revises: 2a229870789c
Create Date: 2025-06-16 07:10:04.347435

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision: str = '83dae560c337'
down_revision: Union[str, None] = '2a229870789c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create gpc_sector table
    op.create_table(
        'gpc_sector',
        sa.Column('sector_name', sa.String(), nullable=False),
        sa.Column('subsector_name', sa.String(), nullable=False),
        sa.Column('sector_refno', sa.String(), nullable=False),
        sa.Column('subsector_refno', sa.String(), nullable=False),
        sa.Column('scope', sa.Integer(), nullable=False),
        sa.Column('gpc_reference_number', sa.String(), nullable=False),
        sa.Column('reporting_level', sa.String(), nullable=False),
        sa.Column('gpc_version', sa.String(), nullable=False),
        sa.PrimaryKeyConstraint('gpc_reference_number'),
        schema='modelled'
    )

    # Create publisher_datasource table
    op.create_table(
        'publisher_datasource',
        sa.Column('publisher_id', UUID(), nullable=False),
        sa.Column('publisher_name', sa.String(), nullable=False),
        sa.Column('publisher_url', sa.String(), nullable=False),
        sa.Column('dataset_id', UUID(), nullable=False),
        sa.Column('datasource_name', sa.String(), nullable=False),
        sa.Column('dataset_name', sa.String(), nullable=False),
        sa.Column('dataset_url', sa.String(), nullable=False),
        sa.PrimaryKeyConstraint('publisher_id', 'dataset_id'),
        sa.UniqueConstraint('publisher_name', 'datasource_name', 'dataset_name', name='uix_publisher_datasource'),
        schema='modelled'
    )

    # Create ghgi_methodology table
    op.create_table(
        'ghgi_methodology',
        sa.Column('method_id', UUID(), nullable=False),
        sa.Column('methodology_name', sa.String(), nullable=False),
        sa.Column('methodology_description', sa.Text()),
        sa.Column('gpc_reference_number', sa.String(), nullable=False),
        sa.PrimaryKeyConstraint('method_id'),
        sa.ForeignKeyConstraint(
            ['gpc_reference_number'],
            ['modelled.gpc_sector.gpc_reference_number'],
            name='fk_ghgi_methodology_gpc'
        ),
        sa.UniqueConstraint('methodology_name', 'gpc_reference_number', name='uix_ghgi_methodology'),
        schema='modelled'
    )

    # Create formula_input table
    op.create_table(
        'formula_input',
        sa.Column('formula_input_id', UUID(), nullable=False),
        sa.Column('method_id', UUID(), nullable=False),
        sa.Column('publisher_id', UUID(), nullable=False),
        sa.Column('dataset_id', UUID(), nullable=False),
        sa.Column('gas_name', sa.String(), nullable=False, comment='CO2, CH4, N2O, ..'),
        sa.Column('parameter_code', sa.String(), nullable=False),
        sa.Column('parameter_name', sa.String(), nullable=False),
        sa.Column('gpc_reference_number', sa.String(), nullable=False),
        sa.Column('formula_input_value', sa.Numeric(18, 8), nullable=False),
        sa.Column('formula_input_units', sa.String(), nullable=False),
        sa.Column('metadata', JSONB()),
        sa.Column('actor_id', sa.String()),
        sa.PrimaryKeyConstraint('formula_input_id'),
        sa.ForeignKeyConstraint(
            ['method_id'],
            ['modelled.ghgi_methodology.method_id'],
            name='fk_formula_input_method'
        ),
        sa.ForeignKeyConstraint(
            ['publisher_id', 'dataset_id'],
            ['modelled.publisher_datasource.publisher_id', 'modelled.publisher_datasource.dataset_id'],
            name='fk_formula_input_publisher'
        ),
        sa.ForeignKeyConstraint(
            ['gpc_reference_number'],
            ['modelled.gpc_sector.gpc_reference_number'],
            name='fk_formula_input_gpc'
        ),
        sa.UniqueConstraint(
            'method_id', 'publisher_id', 'dataset_id', 'gas_name', 
            'parameter_code', 'gpc_reference_number', 'metadata', 'actor_id',
            name='uix_formula_input'
        ),
        schema='modelled'
    )


def downgrade() -> None:
    op.drop_table('formula_input', schema='modelled')
    op.drop_table('ghgi_methodology', schema='modelled')
    op.drop_table('publisher_datasource', schema='modelled')
    op.drop_table('gpc_sector', schema='modelled')
