"""add-Crosswalk-tables

Revision ID: 520c99e561eb
Revises: bd6c5bbd6eb4
Create Date: 2023-09-28 08:48:47.879238

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text


# revision identifiers, used by Alembic.
revision: str = '520c99e561eb'
down_revision: Union[str, None] = 'bd6c5bbd6eb4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "crosswalk_GridCell",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("lat_center", sa.Float, nullable=False),
        sa.Column("lon_center", sa.Float, nullable=False),
        sa.Column("geometry", sa.String, nullable=False),
        sa.Column("area", sa.Float, nullable=False),
        sa.Column(
            "created_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")
        ),
        sa.Column(
            "modified_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")
        ),
    )

    op.create_table(
        "crosswalk_GridCellEmissions",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("reference_number", sa.String, nullable=False),
        sa.Column("gas", sa.String(), nullable=False),
        sa.Column("emissions_quantity", sa.Float(), nullable=False),
        sa.Column("emissions_quantity_units", sa.String(), nullable=False),
        sa.Column(
            "cell_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("crosswalk_GridCell.id"),
            nullable=False,
        ),
        sa.Column(
            "created_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")
        ),
        sa.Column(
            "modified_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")
        ),
    )

    op.create_table(
        "crosswalk_CityGridOverlap",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("locode", sa.String, nullable=False),
        sa.Column("fraction_in_city", sa.Float, nullable=False),
        sa.Column(
            "cell_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("crosswalk_GridCell.id"),
            nullable=False,
        ),
        sa.Column(
            "created_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")
        ),
        sa.Column(
            "modified_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")
        ),
    )


def downgrade() -> None:
    op.drop_table("crosswalk_CityGridOverlap")
    op.drop_table("crosswalk_GridCellEmissions")
    op.drop_table("crosswalk_GridCell")