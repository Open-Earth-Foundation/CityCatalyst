"""change_country_region_city_columns_to_varchar

Revision ID: d84e47e54741
Revises: e3c866a57c19
Create Date: 2025-06-20 13:02:53.184967

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd84e47e54741'
down_revision: Union[str, None] = 'e3c866a57c19'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Change country_code column to VARCHAR
    op.alter_column('modelled.city_polygon', 'country_code',
                    existing_type=sa.TEXT(),
                    type_=sa.VARCHAR(),
                    existing_nullable=True)
    
    # Change region_code column to VARCHAR
    op.alter_column('modelled.city_polygon', 'region_code',
                    existing_type=sa.TEXT(),
                    type_=sa.VARCHAR(),
                    existing_nullable=True)
    
    # Change city_id column to VARCHAR
    op.alter_column('modelled.city_polygon', 'city_id',
                    existing_type=sa.TEXT(),
                    type_=sa.VARCHAR(),
                    existing_nullable=True)


def downgrade() -> None:
    # Revert country_code column back to TEXT
    op.alter_column('modelled.city_polygon', 'country_code',
                    existing_type=sa.VARCHAR(),
                    type_=sa.TEXT(),
                    existing_nullable=True)
    
    # Revert region_code column back to TEXT
    op.alter_column('modelled.city_polygon', 'region_code',
                    existing_type=sa.VARCHAR(),
                    type_=sa.TEXT(),
                    existing_nullable=True)
    
    # Revert city_id column back to TEXT
    op.alter_column('modelled.city_polygon', 'city_id',
                    existing_type=sa.VARCHAR(),
                    type_=sa.TEXT(),
                    existing_nullable=True)
