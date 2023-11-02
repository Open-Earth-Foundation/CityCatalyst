"""asset_emissions_quantity_type_bigint

Revision ID: 66d4e6787ba6
Revises: 64eb87bae0a3
Create Date: 2023-11-02 12:12:10.235702

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "66d4e6787ba6"
down_revision: Union[str, None] = "64eb87bae0a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("asset", "emissions_quantity", type_=sa.BigInteger())


def downgrade() -> None:
    op.alter_column("asset", "emissions_quantity", type_=sa.Integer())
