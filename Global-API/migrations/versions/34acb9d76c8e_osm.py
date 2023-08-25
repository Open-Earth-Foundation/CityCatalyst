"""osm

Revision ID: 34acb9d76c8e
Revises: d1b6acb48d66
Create Date: 2023-08-23 09:36:30.550293

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '34acb9d76c8e'
down_revision: Union[str, None] = 'd1b6acb48d66'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.create_table("osm",
                    sa.Column("geometry", sa.Text(), nullable=True),
                    sa.Column("bbox_north", sa.Float(), nullable=True, index=True),
                    sa.Column("bbox_south", sa.Float(), nullable=True, index=True),
                    sa.Column("bbox_east", sa.Float(), nullable=True, index=True),
                    sa.Column("bbox_west", sa.Float(), nullable=True, index=True),
                    sa.Column("place_id", sa.Integer(), nullable=True),
                    sa.Column("osm_type", sa.String(), nullable=True),
                    sa.Column("osm_id", sa.Integer(), nullable=True, unique=True),
                    sa.Column("lat", sa.Float(), nullable=True),
                    sa.Column("lon", sa.Float(), nullable=True),
                    sa.Column("class", sa.String(), nullable=True),
                    sa.Column("type", sa.String(), nullable=True),
                    sa.Column("place_rank", sa.Integer(), nullable=True),
                    sa.Column("importance", sa.Float(), nullable=True),
                    sa.Column("addresstype", sa.String(), nullable=True),
                    sa.Column("name", sa.String(), nullable=True),
                    sa.Column("display_name", sa.String(), nullable=True),
                    sa.Column("locode", sa.String(), nullable=True, primary_key=True))

def downgrade() -> None:
    op.drop_table("osm")
