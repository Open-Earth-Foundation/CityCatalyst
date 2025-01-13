"""add table emissions forecasting

Revision ID: 080e981ba25a
Revises: b1e6ab175504
Create Date: 2025-01-13 16:53:25.090340

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text

# revision identifiers, used by Alembic.
revision: str = '080e981ba25a'
down_revision: Union[str, None] = 'b1e6ab175504'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:

    conn = op.get_bind()

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS modelled.ghgi_emission_forecast(
       	id uuid,
       	actor_id varchar,
       	cluster_id int,
       	cluster_name json,
       	cluster_description json,
       	gpc_sector varchar,
       	forecast_year int,
       	future_year int,
       	growth_rate numeric,
        spatial_granularity varchar,
       	datasource varchar null,
       	CONSTRAINT ghgi_forecast PRIMARY KEY (id)
        );
    """))

    pass


def downgrade() -> None:
    op.drop_table('ghgi_emission_forecast', schema='modelled')
    pass
