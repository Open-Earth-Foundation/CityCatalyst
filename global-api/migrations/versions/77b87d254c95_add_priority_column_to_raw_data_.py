"""Add priority column to raw_data.datasource

Revision ID: 77b87d254c95
Revises: 080e981ba25a
Create Date: 2025-03-13 08:01:31.058230

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '77b87d254c95'
down_revision: Union[str, None] = '080e981ba25a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.add_column("datasource", sa.Column("priority", sa.Numeric(10, 3), nullable=True), schema="raw_data")


def downgrade():
    op.drop_column("datasource", "priority", schema="raw_data")
