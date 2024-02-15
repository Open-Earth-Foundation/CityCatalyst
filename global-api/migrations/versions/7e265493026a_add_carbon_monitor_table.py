"""Add carbon_monitor table

Revision ID: 7e265493026a
Revises: 3b807ef9772b
Create Date: 2024-02-10 20:49:48.304368

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text


# revision identifiers, used by Alembic.
revision: str = '7e265493026a'
down_revision: Union[str, None] = '3b807ef9772b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.create_table(
        'CarbonMonitor',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('actor_id', sa.String),
        sa.Column('year', sa.Integer),
        sa.Column('sector', sa.String),
        sa.Column('gpc_refno', sa.String),
        sa.Column('gas', sa.String),
        sa.Column('emissions_quantity', sa.BigInteger),
        sa.Column('units', sa.String),
        sa.Column(
            "created_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")
        ),
        sa.Column(
            "modified_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")
        ),
    )

def downgrade():
    op.drop_table('CarbonMonitor')
