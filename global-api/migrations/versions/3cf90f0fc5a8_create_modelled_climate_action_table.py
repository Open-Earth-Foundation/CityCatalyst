"""create modelled climate action table

Revision ID: 3cf90f0fc5a8
Revises: df2243cdb86d
Create Date: 2025-04-22 08:13:43.591203

"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text

# revision identifiers, used by Alembic.
revision: str = '3cf90f0fc5a8'
down_revision: Union[str, None] = 'df2243cdb86d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS modelled.cap_climate_action
        (
            action_id VARCHAR(255) NOT NULL PRIMARY KEY,
            action_name JSON NOT NULL,
            action_type VARCHAR[] NOT NULL,
            hazard_name VARCHAR[],
            sector_names VARCHAR[],
            subsector_names VARCHAR[],
            primary_purpose VARCHAR[] NOT NULL,
            description JSON,
            cobenefits_airquality INTEGER,
            cobenefits_waterquality INTEGER,
            cobenefits_habitat INTEGER,
            cobenefits_costofliving INTEGER,
            cobenefits_housing INTEGER,
            cobenefits_mobility INTEGER,
            cobenefits_stakeholderengagement INTEGER,
            equity_and_inclusion_considerations JSON,
            ghgreduction_stationary_energy VARCHAR,
            ghgreduction_transportation VARCHAR,
            ghgreduction_waste VARCHAR,
            ghgreduction_ippu VARCHAR,
            ghgreduction_afolu VARCHAR,
            adaptation_effectiveness VARCHAR,
            cost_investment_needed VARCHAR,
            timeline_for_implementation VARCHAR,
            dependencies JSON,
            key_performance_indicators JSON,
            powers_and_mandates VARCHAR[],
            adaptation_effectiveness_droughts VARCHAR,
            adaptation_effectiveness_heatwaves VARCHAR,
            adaptation_effectiveness_floods VARCHAR,
            adaptation_effectiveness_sealevelrise VARCHAR,
            adaptation_effectiveness_landslides VARCHAR,
            adaptation_effectiveness_storms VARCHAR,
            adaptation_effectiveness_wildfires VARCHAR,
            adaptation_effectiveness_diseases VARCHAR,
            biome VARCHAR,
            -- Integer constraints:
            CONSTRAINT check_cobenefits_air_quality CHECK (cobenefits_airquality BETWEEN -2 AND 2),
            CONSTRAINT check_cobenefits_water_quality CHECK (cobenefits_waterquality BETWEEN -2 AND 2),
            CONSTRAINT check_cobenefits_habitat CHECK (cobenefits_habitat BETWEEN -2 AND 2),
            CONSTRAINT check_cobenefits_cost_of_living CHECK (cobenefits_costofliving BETWEEN -2 AND 2),
            CONSTRAINT check_cobenefits_housing CHECK (cobenefits_housing BETWEEN -2 AND 2),
            CONSTRAINT check_cobenefits_mobility CHECK (cobenefits_mobility BETWEEN -2 AND 2),
            CONSTRAINT check_cobenefits_stakeholder_engagement CHECK (cobenefits_stakeholderengagement BETWEEN -2 AND 2),
            -- GHG Reduction Potential Constraints:
            CONSTRAINT check_ghg_reduction_stationary_energy CHECK (ghgreduction_stationary_energy IS NULL OR ghgreduction_stationary_energy = ANY (ARRAY['0-19', '20-39', '40-59', '60-79', '80-100'])),
            CONSTRAINT check_ghg_reduction_transportation CHECK (ghgreduction_transportation IS NULL OR ghgreduction_transportation = ANY (ARRAY['0-19', '20-39', '40-59', '60-79', '80-100'])),
            CONSTRAINT check_ghg_reduction_waste CHECK (ghgreduction_waste IS NULL OR ghgreduction_waste = ANY (ARRAY['0-19', '20-39', '40-59', '60-79', '80-100'])),
            CONSTRAINT check_ghg_reduction_ippu CHECK (ghgreduction_ippu IS NULL OR ghgreduction_ippu = ANY (ARRAY['0-19', '20-39', '40-59', '60-79', '80-100'])),
            CONSTRAINT check_ghg_reduction_afolu CHECK (ghgreduction_afolu IS NULL OR ghgreduction_afolu = ANY (ARRAY['0-19', '20-39', '40-59', '60-79', '80-100'])),
            -- Adaptation Effectiveness Constraints:
            CONSTRAINT check_adaptation_effectiveness CHECK (adaptation_effectiveness IS NULL OR adaptation_effectiveness = ANY (ARRAY['high', 'medium', 'low'])),
            CONSTRAINT check_adaptation_effectiveness_droughts CHECK (adaptation_effectiveness_droughts IS NULL OR adaptation_effectiveness_droughts = ANY (ARRAY['high', 'medium', 'low'])),
            CONSTRAINT check_adaptation_effectiveness_heatwaves CHECK (adaptation_effectiveness_heatwaves IS NULL OR adaptation_effectiveness_heatwaves = ANY (ARRAY['high', 'medium', 'low'])),
            CONSTRAINT check_adaptation_effectiveness_floods CHECK (adaptation_effectiveness_floods IS NULL OR adaptation_effectiveness_floods = ANY (ARRAY['high', 'medium', 'low'])),
            CONSTRAINT check_adaptation_effectiveness_sealevelrise CHECK (adaptation_effectiveness_sealevelrise IS NULL OR adaptation_effectiveness_sealevelrise = ANY (ARRAY['high', 'medium', 'low'])),
            CONSTRAINT check_adaptation_effectiveness_landslides CHECK (adaptation_effectiveness_landslides IS NULL OR adaptation_effectiveness_landslides = ANY (ARRAY['high', 'medium', 'low'])),
            CONSTRAINT check_adaptation_effectiveness_storms CHECK (adaptation_effectiveness_storms IS NULL OR adaptation_effectiveness_storms = ANY (ARRAY['high', 'medium', 'low'])),
            CONSTRAINT check_adaptation_effectiveness_wildfires CHECK (adaptation_effectiveness_wildfires IS NULL OR adaptation_effectiveness_wildfires = ANY (ARRAY['high', 'medium', 'low'])),
            CONSTRAINT check_adaptation_effectiveness_diseases CHECK (adaptation_effectiveness_diseases IS NULL OR adaptation_effectiveness_diseases = ANY (ARRAY['high', 'medium', 'low'])),
            -- Other constraints:
            CONSTRAINT check_cost_investment_needed CHECK (cost_investment_needed IS NULL OR cost_investment_needed = ANY (ARRAY['high', 'medium', 'low'])),
            CONSTRAINT check_timeline_for_implementation CHECK (timeline_for_implementation IS NULL OR timeline_for_implementation = ANY (ARRAY['<5 years', '5-10 years', '>10 years'])),
            CONSTRAINT check_biome CHECK (biome IS NULL OR biome = ANY (ARRAY['none', 'tropical_rainforest', 'temperate_forest', 'desert', 'grassland_savanna', 'tundra', 'wetlands', 'mountains', 'boreal_forest_taiga', 'coastal_marine']))
        );
    """))

def downgrade() -> None:
    op.drop_table('cap_climate_action', schema='modelled')
