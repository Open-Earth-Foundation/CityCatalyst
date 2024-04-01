"""geography and population

Revision ID: 583858ff1aa8
Revises: 2f940581ac2b
Create Date: 2024-04-01 13:16:30.379044

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '583858ff1aa8'
down_revision: Union[str, None] = '2f940581ac2b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'geography',
        sa.Column('locode', sa.String(8), nullable=False, primary_key=True),
        sa.Column('region', sa.String(8), nullable=True, index=True),
        sa.Column('country', sa.String(4), nullable=False, index=True),
    )
    op.create_table(
        'population',
        sa.Column('actor_id', sa.String(8), nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('population', sa.BigInteger(), nullable=False),
        sa.PrimaryKeyConstraint('actor_id', 'year')
    )
    pass


def downgrade() -> None:
    op.drop_table('population')
    op.drop_table('geography')
    pass
