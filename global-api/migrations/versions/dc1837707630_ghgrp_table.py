"""GHGRP_table

Revision ID: dc1837707630
Revises: 770cdfcf7a28
Create Date: 2023-11-17 08:32:03.210927

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text


# revision identifiers, used by Alembic.
revision: str = 'dc1837707630'
down_revision: Union[str, None] = '770cdfcf7a28'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ghgrp_epa",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("facility_id", sa.String, nullable=False),
        sa.Column("facility_name", sa.String, nullable=False),
        sa.Column("city", sa.String, nullable=False),
        sa.Column("locode", sa.String, nullable=False),
        sa.Column("state", sa.String, nullable=False),
        sa.Column("county", sa.String, nullable=False),
        sa.Column("latitude", sa.Float, nullable=False),
        sa.Column("longitude", sa.Float, nullable=False),
        sa.Column("geometry", sa.String, nullable=False),
        sa.Column("subparts", sa.String, nullable=False),
        sa.Column("subpart_name", sa.String, nullable=False),
        sa.Column("sectors", sa.String, nullable=False),
        sa.Column("final_sector", sa.String, nullable=False),
        sa.Column("GPC_ref_no", sa.String, nullable=False),
        sa.Column("year", sa.String, nullable=False),
        sa.Column("emissions_quantity_units", sa.String, nullable=False),
        sa.Column("gas", sa.String, nullable=False),
        sa.Column("emissions_quantity", sa.Float, nullable=False),
        sa.Column("GWP_ref", sa.String, nullable=False),
        sa.Column(
            "created_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")
        ),
        sa.Column(
            "modified_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")
        ),
    )


def downgrade() -> None:
    op.drop_table("ghgrp_epa")
