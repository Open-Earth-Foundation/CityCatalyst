"""fix_column_type_activity_emissions

Revision ID: c360f7e67f44
Revises: 949c5b9cc18d
Create Date: 2024-05-22 08:21:13.727742

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c360f7e67f44'
down_revision: Union[str, None] = '949c5b9cc18d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('country_code', 'activity_value',
                    existing_type=sa.String(),
                    type_=sa.Float(),
                    postgresql_using='activity_value::double precision')
    op.alter_column('country_code', 'emissions_value',
                    existing_type=sa.String(),
                    type_=sa.Float(),
                    postgresql_using='emissions_value::double precision')

def downgrade() -> None:
    op.alter_column('country_code', 'activity_value',
                    existing_type=sa.Float(),
                    type_=sa.String(),
                    postgresql_using='activity_value::text')
    op.alter_column('country_code', 'emissions_value',
                    existing_type=sa.Float(),
                    type_=sa.String(),
                    postgresql_using='emissions_value::text')
