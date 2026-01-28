"""create_population_table_globalAPI

Revision ID: 92f76aa847c6
Revises: 2c02fff0607f
Create Date: 2026-01-28 13:41:08.962261

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '92f76aa847c6'
down_revision: Union[str, None] = '2c02fff0607f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'population',
        sa.Column('population_id', UUID(), nullable=False),
        sa.Column('publisher_id', UUID(), nullable=False),
        sa.Column('dataset_id', UUID(), nullable=False),
        sa.Column('population_value', sa.Numeric(18, 8), nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column(
            'population_source',
            sa.String(),
            nullable=False,
            comment='national census, projection, estimation'
        ),
        sa.Column(
            'geographical_level',
            sa.String(),
            nullable=False,
            comment='country, region, city'
        ),
        sa.Column(
            'actor_id',
            sa.String(),
            nullable=False,
            comment='DE, BR, BR SER'
        ),
        sa.PrimaryKeyConstraint('population_id'),
        sa.ForeignKeyConstraint(
            ['publisher_id', 'dataset_id'],
            [
                'modelled.publisher_datasource.publisher_id',
                'modelled.publisher_datasource.dataset_id'
            ],
            name='fk_population_publisher'
        ),
        sa.UniqueConstraint(
            'publisher_id',
            'dataset_id',
            'year',
            'actor_id',
            name='uix_population'
        ),
        schema='modelled'
    )


def downgrade() -> None:
    op.drop_table('population', schema='modelled')
