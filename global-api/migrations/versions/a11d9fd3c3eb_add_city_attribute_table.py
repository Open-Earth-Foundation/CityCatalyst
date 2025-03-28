"""add city attribute table

Revision ID: a11d9fd3c3eb
Revises: 77b87d254c95
Create Date: 2025-03-24 15:37:56.948199

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a11d9fd3c3eb'
down_revision: Union[str, None] = '77b87d254c95'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # Use a raw SQL statement we apply the same scripts in global-api repo so we can successfull run pipelines
    # without dependency on this release in citycatalyst schema.
    op.execute("""
        CREATE TABLE IF NOT EXISTS modelled.city_attribute (
            city_id VARCHAR NOT NULL,
            locode VARCHAR NOT NULL,
            country_code VARCHAR NOT NULL,
            region_name varchar,
            attribute_type VARCHAR NOT NULL,
            attribute_value VARCHAR NOT NULL,
            attribute_units VARCHAR,
            datasource VARCHAR NOT NULL,
            datasource_date INT,
            PRIMARY KEY (city_id, locode, attribute_type, datasource)
        );
    """)

def downgrade():
    # To reverse this migration
    op.drop_table('city_attribute', schema='modelled')
