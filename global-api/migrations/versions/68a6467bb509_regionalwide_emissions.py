"""regionalwide_emissions

Revision ID: 68a6467bb509
Revises: 191489d19e2a
Create Date: 2024-03-18 13:29:17.038764

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text


# revision identifiers, used by Alembic.
revision: str = '68a6467bb509'
down_revision: Union[str, None] = '191489d19e2a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.create_table(
        "regionalwide_emissions",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("source_name", sa.String, nullable=False),
        sa.Column("GPC_refno", sa.String, nullable=False),
        sa.Column("province_name", sa.String, nullable=False),
        sa.Column("province_code", sa.String, nullable=False),
        sa.Column("temporal_granularity", sa.String, nullable=False),
        sa.Column("year", sa.Float, nullable=False),
        sa.Column("activity_name", sa.String, nullable=False),
        sa.Column("activity_value", sa.Float, nullable=True),
        sa.Column("activity_units", sa.String, nullable=True),
        sa.Column("gas_name", sa.String, nullable=False),
        sa.Column("emission_factor_value", sa.Float, nullable=False),
        sa.Column("emission_factor_units", sa.String, nullable=False),
        sa.Column("emissions_value", sa.Float, nullable=False),
        sa.Column("emissions_units", sa.String, nullable=False),
        sa.Column(
            "created_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")
        ),
        sa.Column(
            "modified_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")
        ),
    )


def downgrade() -> None:
    op.drop_table("regionalwide_emissions")
