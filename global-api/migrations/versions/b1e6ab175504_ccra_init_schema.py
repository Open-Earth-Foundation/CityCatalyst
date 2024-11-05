"""ccra_init_schema

Revision ID: b1e6ab175504
Revises: 1d9bbf3aff0e
Create Date: 2024-10-10 19:45:09.029742

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text


# revision identifiers, used by Alembic.
revision: str = 'b1e6ab175504'
down_revision: Union[str, None] = '1d9bbf3aff0e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS modelled.ccra_indicator (
          "id" uuid,
          "actor_id" varchar,
          "indicator_name" varchar,
          "indicator_score" numeric,
          "indicator_units" varchar,
          "indicator_normalized_score" numeric,
          "indicator_year" int,
          "scenario_name" varchar,
          "datasource" varchar,
          PRIMARY KEY (id)
        );
    """))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS modelled.ccra_impactchain (
          id UUID,
          keyimpact_name VARCHAR,
          hazard_name VARCHAR,
          latest_year INT,
          scenario_name VARCHAR,
          PRIMARY KEY (id)
        );
    """))

    conn.execute(text("""
    CREATE TABLE IF NOT EXISTS modelled.ccra_impactchain_indicator (
      impact_id UUID,
      indicator_id UUID,
      actor_id VARCHAR,
      category VARCHAR,
      subcategory VARCHAR,
      indicator_name VARCHAR,
      indicator_score NUMERIC,
      indicator_weight NUMERIC,
      relationship VARCHAR,
      datasource VARCHAR,
      PRIMARY KEY (impact_id, indicator_id, category, subcategory)
    );
    """))

    conn.execute(text("""
    CREATE TABLE IF NOT EXISTS modelled.ccra_riskassessment (
      "impact_id" uuid,
      "actor_id" varchar,
      "risk_score" numeric,
      "hazard_score" numeric,
      "exposure_score" numeric,
      "vulnerability_score" numeric,
      "adaptive_capacity_score" numeric,
      "sensitivity_score" numeric,
      "risk_lower_limit" numeric,
      "risk_upper_limit" numeric,
      PRIMARY KEY (impact_id, actor_id)
    );
    """))


def downgrade() -> None:
    op.drop_table('ccra_indicator', schema='modelled')
    op.drop_table('ccra_impactchain', schema='modelled')
    op.drop_table('ccra_impactchain_indicator', schema='modelled')
    op.drop_table('ccra_riskassessment', schema='modelled')
