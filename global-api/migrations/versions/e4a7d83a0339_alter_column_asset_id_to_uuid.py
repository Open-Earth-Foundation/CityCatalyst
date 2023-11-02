"""alter_column_asset_id_to_uuid

Revision ID: e4a7d83a0339
Revises: 66d4e6787ba6
Create Date: 2023-11-02 13:18:08.510772

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e4a7d83a0339"
down_revision: Union[str, None] = "66d4e6787ba6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("asset", "id")
    op.add_column(
        "asset", sa.Column("id", sa.dialects.postgresql.UUID, primary_key=True)
    )
    op.create_primary_key("asset_pkey", "asset", ["id"])


def downgrade() -> None:
    op.drop_constraint("asset_pkey", "asset", type_="primary")
    op.drop_column("asset", "id")
    op.add_column(
        "asset", sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True)
    )
