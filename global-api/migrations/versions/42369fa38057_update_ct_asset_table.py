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
    op.execute("ALTER TABLE asset ALTER COLUMN id DROP DEFAULT")
    op.execute("ALTER TABLE asset ALTER COLUMN id TYPE UUID USING id::UUID")
    op.execute("ALTER TABLE asset ALTER COLUMN emissions_quantity TYPE BIGINT")


def downgrade() -> None:
    op.execute("ALTER TABLE asset ALTER COLUMN emissions_quantity TYPE INT")
    op.execute("ALTER TABLE asset ALTER COLUMN id TYPE SERIAL")
