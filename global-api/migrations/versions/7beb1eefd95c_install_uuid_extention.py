"""install uuid extention

Revision ID: 7beb1eefd95c
Revises: 949c5b9cc18d
Create Date: 2024-05-23 09:38:45.542786

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7beb1eefd95c'
down_revision: Union[str, None] = '949c5b9cc18d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create the uuid-ossp extension
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public')


def downgrade() -> None:
    # Drop the uuid-ossp extension
    op.execute('DROP EXTENSION IF EXISTS "uuid-ossp"')
