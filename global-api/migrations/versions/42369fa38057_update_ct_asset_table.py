"""update-CT-asset-table

Revision ID: 42369fa38057
Revises: 64eb87bae0a3
Create Date: 2023-10-18 13:18:48.197671

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '42369fa38057'
down_revision: Union[str, None] = '64eb87bae0a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("asset_pkey", "asset", type_="primary")
    op.alter_column("asset",
                    "id",
                    new_column_name="old_id",
                    primary_key=False,
                    nullable=True)
    op.add_column("asset",
                  sa.Column("id",
                  sa.UUID(),
                  nullable=False,
                  primary_key=True,
                  default=sa.text("gen_random_uuid()")))
    op.create_primary_key("asset_pkey", "asset", ["id"])
    op.execute('ALTER TABLE asset ALTER COLUMN emissions_quantity TYPE BIGINT')

def downgrade() -> None:
    op.execute('ALTER TABLE asset ALTER COLUMN emissions_quantity TYPE INTEGER')
    op.drop_constraint("asset_pkey", "asset", type_="primary")
    op.drop_column("asset", "id")
    op.alter_column("asset",
                    "old_id",
                    new_column_name="id",
                    primary_key=True,
                    nullable=False)
