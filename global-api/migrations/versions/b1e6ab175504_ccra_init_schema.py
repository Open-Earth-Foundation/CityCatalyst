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

    # Execute raw SQL using the text() construct
    conn.execute(text("""
    CREATE TABLE IF NOT EXISTS modelled.city_profile (
      city_id UUID PRIMARY KEY,
      actor_id VARCHAR,
      city_boundary BYTEA,
      country_code VARCHAR,
      region_code VARCHAR,
      area NUMERIC
    );
    """))

    conn.execute(text("""
    CREATE TABLE IF NOT EXISTS modelled.dim_ccra_components (
      component_id UUID PRIMARY KEY,
      component_type VARCHAR,
      component_typename VARCHAR,
      compenent_descripton VARCHAR
    );
    """))

    conn.execute(text("""
    CREATE TABLE IF NOT EXISTS modelled.ccra_impact_chain_assessment (
      assessment_id UUID PRIMARY KEY,
      city_id UUID,
      key_impact_id UUID,
      hazard_id UUID,
      exposure_id UUID,
      vulnerablity_id UUID,
      risk_id UUID,
      time_period_id UUID,
      scenario_id UUID
    );
    """))

    conn.execute(text("""
    CREATE TABLE IF NOT EXISTS modelled.city_ccra_riskassessment (
      assessment_id UUID PRIMARY KEY,
      risk_score NUMERIC,
      risk_scorename VARCHAR,
      hazard_score NUMERIC,
      hazard_scorename VARCHAR,
      exposure_score NUMERIC,
      exposure_scorename VARCHAR,
      vulnerablity_score NUMERIC,
      vulnerablity_scorename VARCHAR,
      adaptive_capacity_score NUMERIC,
      adaptive_capacity_scorename VARCHAR,
      sensitivity_score NUMERIC,
      sensitivity_scorename VARCHAR,
      scenario_name VARCHAR,
      time_period INT
    );
    """))

    conn.execute(text("""
    CREATE TABLE IF NOT EXISTS modelled.city_ccra_indicator (
      city_id UUID PRIMARY KEY,
      indicator_id UUID,
      indicator_score NUMERIC,
      indicator_normalized_score NUMERIC,
      indicator_scorename VARCHAR,
      scenario_name VARCHAR,
      time_period INT,
      datasource VARCHAR
    );
    """))

    conn.execute(text("""
    CREATE TABLE IF NOT EXISTS modelled.city_ccra_hazardindicator (
      assessment_id UUID PRIMARY KEY,
      indicator_id UUID,
      hazardindicator_weight NUMERIC,
      hazardindicator_score NUMERIC,
      hazardindicator_scorename VARCHAR
    );
    """))

    conn.execute(text("""
    CREATE TABLE IF NOT EXISTS modelled.city_ccra_exposureindicator (
      assessment_id UUID PRIMARY KEY,
      indicator_id UUID,
      exposureindicator_weight NUMERIC,
      exposureindicator_score NUMERIC,
      exposureindicator_scorename VARCHAR
    );
    """))

    conn.execute(text("""
    CREATE TABLE IF NOT EXISTS modelled.city_ccra_vulnerablityindicator (
      assessment_id UUID PRIMARY KEY,
      vulnerablity_subcategory VARCHAR,
      indicator_id UUID,
      vulnerablityindicator_weight NUMERIC,
      vulnerablityindicator_score NUMERIC,
      vulnerablityindicator_scorename VARCHAR
    );
    """))

    conn.execute(text("""
    CREATE TABLE IF NOT EXISTS modelled.ccra_scenario (
      scenario_id UUID PRIMARY KEY,
      scenario_name VARCHAR
    );
    """))

    conn.execute(text("""
    CREATE TABLE IF NOT EXISTS modelled.ccra_time_period (
      time_period_id UUID PRIMARY KEY,
      start_year DATE,
      end_year DATE
    );
    """))


def downgrade() -> None:
    op.drop_table('ccra_time_period', schema='modelled')
    op.drop_table('ccra_scenario', schema='modelled')
    op.drop_table('city_ccra_vulnerablityindicator', schema='modelled')
    op.drop_table('city_ccra_exposureindicator', schema='modelled')
    op.drop_table('city_ccra_hazardindicator', schema='modelled')
    op.drop_table('city_ccra_indicator', schema='modelled')
    op.drop_table('city_ccra_riskassessment', schema='modelled')
    op.drop_table('ccra_impact_chain_assessment', schema='modelled')
    op.drop_table('dim_ccra_components', schema='modelled')
    op.drop_table('city_profile', schema='modelled')
