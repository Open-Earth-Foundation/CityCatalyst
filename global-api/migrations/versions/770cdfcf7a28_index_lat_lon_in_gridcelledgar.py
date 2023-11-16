"""index lat lon in GridCellEdgar

Revision ID: 770cdfcf7a28
Revises: 3524677cf0b8
Create Date: 2023-11-15 17:35:26.777770

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "770cdfcf7a28"
down_revision: Union[str, None] = "3524677cf0b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        op.f("ix_gridcelledgar_lat_center"),
        "GridCellEdgar",
        ["lat_center"],
        unique=False,
    )
    op.create_index(
        op.f("ix_gridcelledgar_lon_center"),
        "GridCellEdgar",
        ["lon_center"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_gridcelledgar_lon_center"), table_name="GridCellEdgar")
    op.drop_index(op.f("ix_gridcelledgar_lat_center"), table_name="GridCellEdgar")
