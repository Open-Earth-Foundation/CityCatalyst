"""no-grid-cell-edgar

Revision ID: 06e906516a40
Revises: 770cdfcf7a28
Create Date: 2023-11-17 17:15:56.539228

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '06e906516a40'
down_revision: Union[str, None] = '770cdfcf7a28'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:

    op.add_column('GridCellEmissionsEdgar',
                  sa.Column('cell_lat',
                            sa.Integer(),
                            nullable=True,
                            index=True))
    op.add_column('GridCellEmissionsEdgar',
                    sa.Column('cell_lon',
                              sa.Integer(),
                              nullable=True,
                              index=True))

    op.add_column('CityCellOverlapEdgar',
                    sa.Column('cell_lat',
                                sa.Integer(),
                                nullable=True,
                                index=True))
    op.add_column('CityCellOverlapEdgar',
                    sa.Column('cell_lon',
                                sa.Integer(),
                                nullable=True,
                                index=True))

    op.execute("""
    UPDATE "GridCellEmissionsEdgar"
    SET cell_lat = ROUND("GridCellEdgar".lat_center * 10)::INTEGER,
        cell_lon = ROUND("GridCellEdgar".lon_center * 10)::INTEGER
    FROM "GridCellEdgar"
    WHERE "GridCellEmissionsEdgar".cell_id = "GridCellEdgar".id
    """)

    op.execute("""
    UPDATE "CityCellOverlapEdgar"
    SET cell_lat = ROUND("GridCellEdgar".lat_center * 10)::INTEGER,
        cell_lon = ROUND("GridCellEdgar".lon_center * 10)::INTEGER
    FROM "GridCellEdgar"
    WHERE "CityCellOverlapEdgar".cell_id = "GridCellEdgar".id
    """)

    op.alter_column('GridCellEmissionsEdgar',
                    'cell_id',
                    nullable=True)

    op.alter_column('CityCellOverlapEdgar',
                    'cell_id',
                    nullable=True)


def downgrade() -> None:

    op.drop_column('GridCellEmissionsEdgar', 'cell_lat')
    op.drop_column('GridCellEmissionsEdgar', 'cell_lon')
    op.drop_column('CityCellOverlapEdgar', 'cell_lat')
    op.drop_column('CityCellOverlapEdgar', 'cell_lon')

    # This might fail.

    op.alter_column('GridCellEmissionsEdgar', 'cell_id', nullable=False)
    op.alter_column('CityCellOverlapEdgar', 'cell_id', nullable=False)
