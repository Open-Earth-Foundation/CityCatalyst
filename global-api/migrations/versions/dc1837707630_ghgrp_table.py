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
        "GHGRP_EPA",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("Facility Id", sa.String, nullable=False),
        sa.Column("Facility Name", sa.String, nullable=False),
        sa.Column("City", sa.String, nullable=False),
        sa.Column("State", sa.String, nullable=False),
        sa.Column("County", sa.String, nullable=False),
        sa.Column("Latitude", sa.Float, nullable=False),
        sa.Column("Longitude", sa.Float, nullable=False),
        sa.Column("geometry", sa.String, nullable=False),
        sa.Column("Industry Type (subparts)", sa.String, nullable=False),
        sa.Column("final_subpart_ghgrp", sa.String, nullable=False),
        sa.Column("Industry Type (sectors)", sa.String, nullable=False),
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
    op.drop_table("GHGRP_EPA")
