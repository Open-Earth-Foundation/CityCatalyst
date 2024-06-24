"""rename geography table

Revision ID: 3ba93748222f
Revises: c360f7e67f44
Create Date: 2024-06-21 14:38:24.885658

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3ba93748222f'
down_revision: Union[str, None] = 'c360f7e67f44'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SQL to rename the table if it exists
    sql = """
    DO $$ 
    BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'geography') THEN
            ALTER TABLE geography RENAME TO dim_geography;
        END IF;
    END $$;
    """
    op.execute(sql)

def downgrade() -> None:
    # SQL to revert the table name if it was renamed
    sql = """
    DO $$ 
    BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dim_geography') THEN
            ALTER TABLE new_geography RENAME TO geography;
        END IF;
    END $$;
    """
    op.execute(sql)