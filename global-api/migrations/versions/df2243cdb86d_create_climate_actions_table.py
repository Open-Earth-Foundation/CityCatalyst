"""create climate actions table

Revision ID: df2243cdb86d
Revises: a11d9fd3c3eb
Create Date: 2025-04-09 11:47:10.781581

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY

# revision identifiers, used by Alembic.
revision: str = 'df2243cdb86d'
down_revision: Union[str, None] = 'a11d9fd3c3eb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "climate_action",
        sa.Column("ActionID", sa.String(length=255), primary_key=True),
        sa.Column("ActionName", sa.String(length=255), nullable=False),
        sa.Column("ActionType", ARRAY(sa.String), nullable=False),
        sa.Column("Hazard", ARRAY(sa.String), nullable=True),
        sa.Column("Sector", ARRAY(sa.String), nullable=True),
        sa.Column("Subsector", ARRAY(sa.String), nullable=True),
        sa.Column("PrimaryPurpose", ARRAY(sa.String), nullable=False),
        sa.Column("Description", sa.Text, nullable=True),
        sa.Column("CoBenefitsAirQuality", sa.Integer, nullable=True),
        sa.Column("CoBenefitsWaterQuality", sa.Integer, nullable=True),
        sa.Column("CoBenefitsHabitat", sa.Integer, nullable=True),
        sa.Column("CoBenefitsCostOfLiving", sa.Integer, nullable=True),
        sa.Column("CoBenefitsHousing", sa.Integer, nullable=True),
        sa.Column("CoBenefitsMobility", sa.Integer, nullable=True),
        sa.Column("CoBenefitsStakeholderEngagement", sa.Integer, nullable=True),
        sa.Column("EquityAndInclusionConsiderations", sa.Text, nullable=True),
        sa.Column("GHGReductionPotentialStationaryEnergy", sa.String, nullable=True),
        sa.Column("GHGReductionPotentialTransportation", sa.String, nullable=True),
        sa.Column("GHGReductionPotentialWaste", sa.String, nullable=True),
        sa.Column("GHGReductionPotentialIPPU", sa.String, nullable=True),
        sa.Column("GHGReductionPotentialAFOLU", sa.String, nullable=True),
        sa.Column("AdaptationEffectiveness", sa.String, nullable=True),
        sa.Column("AdaptationEffectivenessDroughts", sa.String, nullable=True),
        sa.Column("AdaptationEffectivenessHeatwaves", sa.String, nullable=True),
        sa.Column("AdaptationEffectivenessFloods", sa.String, nullable=True),
        sa.Column("AdaptationEffectivenessSeaLevelRise", sa.String, nullable=True),
        sa.Column("AdaptationEffectivenessLandslides", sa.String, nullable=True),
        sa.Column("AdaptationEffectivenessStorms", sa.String, nullable=True),
        sa.Column("AdaptationEffectivenessWildfires", sa.String, nullable=True),
        sa.Column("AdaptationEffectivenessDiseases", sa.String, nullable=True),
        sa.Column("CostInvestmentNeeded", sa.String, nullable=True),
        sa.Column("TimelineForImplementation", sa.String, nullable=True),
        sa.Column("Dependencies", ARRAY(sa.String), nullable=True),
        sa.Column("KeyPerformanceIndicators", ARRAY(sa.String), nullable=True),
        sa.Column("PowersAndMandates", ARRAY(sa.String), nullable=True),
        sa.Column("Biome", sa.String, nullable=True),
        sa.CheckConstraint(
            '"CoBenefitsAirQuality" >= -2 AND "CoBenefitsAirQuality" <= 2',
            "check_cobenefits_air_quality",
        ),
        sa.CheckConstraint(
            '"CoBenefitsWaterQuality" >= -2 AND "CoBenefitsWaterQuality" <= 2',
            "check_cobenefits_water_quality",
        ),
        sa.CheckConstraint(
            '"CoBenefitsHabitat" >= -2 AND "CoBenefitsHabitat" <= 2',
            "check_cobenefits_habitat",
        ),
        sa.CheckConstraint(
            '"CoBenefitsCostOfLiving" >= -2 AND "CoBenefitsCostOfLiving" <= 2',
            "check_cobenefits_cost_of_living",
        ),
        sa.CheckConstraint(
            '"CoBenefitsHousing" >= -2 AND "CoBenefitsHousing" <= 2',
            "check_cobenefits_housing",
        ),
        sa.CheckConstraint(
            '"CoBenefitsMobility" >= -2 AND "CoBenefitsMobility" <= 2',
            "check_cobenefits_mobility",
        ),
        sa.CheckConstraint(
            '"CoBenefitsStakeholderEngagement" >= -2 AND "CoBenefitsStakeholderEngagement" <= 2',
            "check_cobenefits_stakeholder_engagement",
        ),
        sa.CheckConstraint(
            "\"GHGReductionPotentialStationaryEnergy\" IS NULL or \"GHGReductionPotentialStationaryEnergy\" IN ('0-19', '20-39', '40-59', '60-79', '80-100')",
            "check_ghg_reduction_potential_stationary_energy",
        ),
        sa.CheckConstraint(
            "\"GHGReductionPotentialTransportation\" IS NULL or \"GHGReductionPotentialTransportation\" IN ('0-19', '20-39', '40-59', '60-79', '80-100')",
            "check_ghg_reduction_potential_transportation",
        ),
        sa.CheckConstraint(
            "\"GHGReductionPotentialWaste\" IS NULL or \"GHGReductionPotentialWaste\" IN ('0-19', '20-39', '40-59', '60-79', '80-100')",
            "check_ghg_reduction_potential_waste",
        ),
        sa.CheckConstraint(
            "\"GHGReductionPotentialIPPU\" IS NULL or \"GHGReductionPotentialIPPU\" IN ('0-19', '20-39', '40-59', '60-79', '80-100')",
            "check_ghg_reduction_potential_ippu",
        ),
        sa.CheckConstraint(
            "\"GHGReductionPotentialAFOLU\" IS NULL or \"GHGReductionPotentialAFOLU\" IN ('0-19', '20-39', '40-59', '60-79', '80-100')",
            "check_ghg_reduction_potential_afolu",
        ),
        sa.CheckConstraint(
            "\"AdaptationEffectiveness\" IS NULL OR \"AdaptationEffectiveness\" IN ('high', 'medium', 'low')",
            "check_adaptation_effectiveness",
        ),
        sa.CheckConstraint(
            "\"AdaptationEffectivenessDroughts\" IS NULL OR \"AdaptationEffectivenessDroughts\" IN ('high', 'medium', 'low')",
            "check_adaptation_effectiveness_droughts",
        ),
        sa.CheckConstraint(
            "\"AdaptationEffectivenessHeatwaves\" IS NULL OR \"AdaptationEffectivenessHeatwaves\" IN ('high', 'medium', 'low')",
            "check_adaptation_effectiveness_heatwaves",
        ),
        sa.CheckConstraint(
            "\"AdaptationEffectivenessFloods\" IS NULL OR \"AdaptationEffectivenessFloods\" IN ('high', 'medium', 'low')",
            "check_adaptation_effectiveness_floods",
        ),
        sa.CheckConstraint(
            "\"AdaptationEffectivenessSeaLevelRise\" IS NULL OR \"AdaptationEffectivenessSeaLevelRise\" IN ('high', 'medium', 'low')",
            "check_adaptation_effectiveness_sea_level_rise",
        ),
        sa.CheckConstraint(
            "\"AdaptationEffectivenessLandslides\" IS NULL OR \"AdaptationEffectivenessLandslides\" IN ('high', 'medium', 'low')",
            "check_adaptation_effectiveness_landslides",
        ),
        sa.CheckConstraint(
            "\"AdaptationEffectivenessStorms\" IS NULL OR \"AdaptationEffectivenessStorms\" IN ('high', 'medium', 'low')",
            "check_adaptation_effectiveness_storms",
        ),
        sa.CheckConstraint(
            "\"AdaptationEffectivenessWildfires\" IS NULL OR \"AdaptationEffectivenessWildfires\" IN ('high', 'medium', 'low')",
            "check_adaptation_effectiveness_wildfires",
        ),
        sa.CheckConstraint(
            "\"AdaptationEffectivenessDiseases\" IS NULL OR \"AdaptationEffectivenessDiseases\" IN ('high', 'medium', 'low')",
            "check_adaptation_effectiveness_diseases",
        ),
        sa.CheckConstraint(
            "\"CostInvestmentNeeded\" IS NULL OR \"CostInvestmentNeeded\" IN ('high', 'medium', 'low')",
            "check_cost_investment_needed",
        ),
        sa.CheckConstraint(
            "\"TimelineForImplementation\" IS NULL OR \"TimelineForImplementation\" IN ('<5 years', '5-10 years', '>10 years')",
            "check_timeline_for_implementation",
        ),
        sa.CheckConstraint(
            """
            "Biome" is NULL or "Biome" in (
            'none',
            'tropical_rainforest',
            'temperate_forest',
            'desert',
            'grassland_savanna',
            'tundra',
            'wetlands',
            'mountains',
            'boreal_forest_taiga',
            'coastal_marine')
            """
        ),
    )
    op.execute(
        """
        ALTER TABLE climate_action
        ADD CONSTRAINT check_action_type
        CHECK ("ActionType" IS NULL OR "ActionType" <@ ARRAY[
        'mitigation', 'adaptation']::varchar[]);
        """
    )
    op.execute(
        """
        ALTER TABLE climate_action
        ADD CONSTRAINT check_hazard_values
        CHECK ("Hazard" IS NULL OR "Hazard" <@ ARRAY['droughts',
          'heatwaves',
          'floods',
          'sea-level-rise',
          'landslides',
          'storms',
          'wildfires',
          'diseases']::varchar[]);
        """
    )
    op.execute(
        """
        ALTER TABLE climate_action
        ADD CONSTRAINT check_sector_values
        CHECK ("Sector" IS NULL OR "Sector" <@ ARRAY[
          'stationary_energy',
          'transportation',
          'waste',
          'ippu',
          'afolu',
          'water_resources',
          'food_security',
          'energy_security',
          'biodiversity',
          'public_health',
          'railway_infrastructure',
          'road_infrastructure',
          'port_infrastructure',
          'geo-hydrological_disasters']::varchar[]);
        """
    )
    op.execute(
        """
        ALTER TABLE climate_action
        ADD CONSTRAINT check_subsector_values
        CHECK ("Subsector" IS NULL OR "Subsector" <@ ARRAY[
          'residential_buildings',
          'commercial_and_institutional_buildings_and_facilities',
          'manufacturing_industries_and_construction',
          'energy_industries',
          'energy_generation_supplied_to_the_grid',
          'agriculture_forestry_and_fishing_activities',
          'non-specified_sources',
          'fugitive_emissions_from_mining_processing_storage_and_transportation_of_coal',
          'fugitive_emissions_from_oil_and_natural_gas_systems',
          'on-road',
          'railways',
          'waterborne_navigation',
          'aviation',
          'off-road',
          'disposal_of_solid_waste_generated_in_the_city',
          'disposal_of_solid_waste_generated_outside_the_city',
          'biological_treatment_of_waste_generated_in_the_city',
          'biological_treatment_of_waste_generated_outside_the_city',
          'incineration_and_open_burning_of_waste_generated_in_the_city',
          'incineration_and_open_burning_of_waste_generated_outside_the_city',
          'wastewater_generated_in_the_city',
          'wastewater_generated_outside_the_city',
          'industrial_processes',
          'product_use',
          'livestock',
          'land',
          'aggregate_sources_and_non-co2_emission_sources_on_land',
          'all'
          ]::varchar[]);
        """
    )
    op.execute(
        """
        ALTER TABLE climate_action
        ADD CONSTRAINT check_primary_purpose
        CHECK ("PrimaryPurpose" IS NULL OR "PrimaryPurpose" <@ ARRAY[
        'ghg_reduction', 'climate_resilience']::varchar[]);
        """
    )


def downgrade() -> None:
    op.drop_table('climate_action')
