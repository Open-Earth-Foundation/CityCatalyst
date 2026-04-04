"""drop all legacy tables with no active API routes

Drops the following tables in a single migration:

EDGAR / crosswalk grid (deprecated data sources):
  - GridCellEmissionsEdgar, CityCellOverlapEdgar, GridCellEdgar
  - crosswalk_GridCellEmissions, crosswalk_CityGridOverlap, crosswalk_GridCell

Deprecated-route tables (routes moved to routes/deprecated/):
  - asset, ghgrp_epa, country_code

NBS tables (no active route):
  - modelled.nbs_layer_publication, modelled.nbs_geospatial_catalog

Legacy public tables superseded by modelled schema equivalents:
  - dim_geography (originally geography, renamed by migration 3ba93748222f)
  - population (superseded by modelled.population)
  - osm
  - climate_action (superseded by modelled.cap_climate_action)

Revision ID: 971397f30dd9
Revises: c3a1d7f82e05
Create Date: 2026-04-04 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql import text

# revision identifiers, used by Alembic.
revision: str = "971397f30dd9"
down_revision: Union[str, None] = "c3a1d7f82e05"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop child tables before their parents to satisfy FK constraints.

    # EDGAR tables (GridCellEmissionsEdgar and CityCellOverlapEdgar
    # both reference GridCellEdgar)
    op.drop_table("GridCellEmissionsEdgar")
    op.drop_table("CityCellOverlapEdgar")
    op.drop_table("GridCellEdgar")

    # Crosswalk tables (GridCellEmissions and CityGridOverlap
    # both reference crosswalk_GridCell)
    op.drop_table("crosswalk_GridCellEmissions")
    op.drop_table("crosswalk_CityGridOverlap")
    op.drop_table("crosswalk_GridCell")

    # Standalone tables whose only consumer was a deprecated route
    op.drop_table("asset")         # city_locode_endpoint_climatetrace
    op.drop_table("ghgrp_epa")     # city_locode_endpoint_ghgrp
    op.drop_table("country_code")  # country_code_endpoint

    # NBS tables — nbs_layer_publication references nbs_geospatial_catalog,
    # so the child must be dropped first.
    op.drop_table("nbs_layer_publication", schema="modelled")
    op.drop_table("nbs_geospatial_catalog", schema="modelled")

    # Legacy public tables — no active route; data superseded by modelled schema.
    # dim_geography was originally created as "geography" (583858ff1aa8) then
    # renamed via raw SQL (3ba93748222f); drop both names with IF EXISTS.
    op.execute("DROP TABLE IF EXISTS public.dim_geography")
    op.execute("DROP TABLE IF EXISTS public.geography")

    # public.population superseded by modelled.population
    op.drop_table("population")

    # public.osm — no longer queried
    op.drop_table("osm")

    # public.climate_action superseded by modelled.cap_climate_action
    op.drop_table("climate_action")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    public_tables = set(inspector.get_table_names(schema="public"))
    modelled_tables = set(inspector.get_table_names(schema="modelled"))

    # ── Recreate EDGAR tables ──────────────────────────────────────────────────

    if "GridCellEdgar" not in public_tables:
        op.create_table(
            "GridCellEdgar",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("lat_center", sa.Float(), nullable=False),
            sa.Column("lon_center", sa.Float(), nullable=False),
            sa.Column("geometry", sa.String(), nullable=False),
            sa.Column("area", sa.Float(), nullable=False),
            sa.Column("created_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")),
            sa.Column("modified_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")),
        )
        # Recreate indices added by 770cdfcf7a28 and 36933af0ca3a
        op.create_index(
            op.f("ix_gridcelledgar_lat_center"), "GridCellEdgar", ["lat_center"], unique=False
        )
        op.create_index(
            op.f("ix_gridcelledgar_lon_center"), "GridCellEdgar", ["lon_center"], unique=False
        )

    if "GridCellEmissionsEdgar" not in public_tables:
        op.create_table(
            "GridCellEmissionsEdgar",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("year", sa.Integer(), nullable=False),
            sa.Column("reference_number", sa.String(), nullable=False),
            sa.Column("gas", sa.String(), nullable=False),
            sa.Column("emissions_quantity", sa.Float(), nullable=False),
            sa.Column("emissions_quantity_units", sa.String(), nullable=False),
            # cell_id was made nullable by migration 06e906516a40
            sa.Column("cell_id", UUID(as_uuid=True), sa.ForeignKey("GridCellEdgar.id"), nullable=True),
            sa.Column("created_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")),
            sa.Column("modified_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")),
            # cell_lat / cell_lon were added by migration 06e906516a40
            sa.Column("cell_lat", sa.Integer(), nullable=True),
            sa.Column("cell_lon", sa.Integer(), nullable=True),
        )

    if "CityCellOverlapEdgar" not in public_tables:
        op.create_table(
            "CityCellOverlapEdgar",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("locode", sa.String(), nullable=False),
            sa.Column("fraction_in_city", sa.Float(), nullable=False),
            # cell_id was made nullable by migration 06e906516a40
            sa.Column("cell_id", UUID(as_uuid=True), sa.ForeignKey("GridCellEdgar.id"), nullable=True),
            sa.Column("created_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")),
            sa.Column("modified_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")),
            # cell_lat / cell_lon were added by migration 06e906516a40
            sa.Column("cell_lat", sa.Integer(), nullable=True),
            sa.Column("cell_lon", sa.Integer(), nullable=True),
        )
        op.create_index(
            op.f("ix_citycelloverlapedgar_locode"), "CityCellOverlapEdgar", ["locode"], unique=False
        )

    # ── Recreate crosswalk tables ──────────────────────────────────────────────

    if "crosswalk_GridCell" not in public_tables:
        op.create_table(
            "crosswalk_GridCell",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("lat_center", sa.Float(), nullable=False),
            sa.Column("lon_center", sa.Float(), nullable=False),
            sa.Column("geometry", sa.String(), nullable=False),
            sa.Column("area", sa.Float(), nullable=False),
            sa.Column("created_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")),
            sa.Column("modified_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")),
        )

    if "crosswalk_GridCellEmissions" not in public_tables:
        op.create_table(
            "crosswalk_GridCellEmissions",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("year", sa.Integer(), nullable=False),
            sa.Column("reference_number", sa.String(), nullable=False),
            sa.Column("gas", sa.String(), nullable=False),
            sa.Column("emissions_quantity", sa.Float(), nullable=False),
            sa.Column("emissions_quantity_units", sa.String(), nullable=False),
            sa.Column(
                "cell_id", UUID(as_uuid=True), sa.ForeignKey("crosswalk_GridCell.id"), nullable=False
            ),
            sa.Column("created_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")),
            sa.Column("modified_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")),
        )

    if "crosswalk_CityGridOverlap" not in public_tables:
        op.create_table(
            "crosswalk_CityGridOverlap",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("locode", sa.String(), nullable=False),
            sa.Column("fraction_in_city", sa.Float(), nullable=False),
            sa.Column(
                "cell_id", UUID(as_uuid=True), sa.ForeignKey("crosswalk_GridCell.id"), nullable=False
            ),
            sa.Column("created_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")),
            sa.Column("modified_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")),
        )

    # ── Recreate standalone deprecated-route tables ────────────────────────────

    # asset: final state after migrations f7b5e625839a, bd6c5bbd6eb4, 42369fa38057
    if "asset" not in public_tables:
        op.create_table(
            "asset",
            sa.Column("old_id", sa.Integer(), nullable=True),
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("asset_id", sa.Integer(), nullable=True),
            sa.Column("filename", sa.String(), nullable=True),
            sa.Column("reference_number", sa.String(), nullable=True),
            sa.Column("iso3_country", sa.String(), nullable=True),
            sa.Column("original_inventory_sector", sa.String(), nullable=True),
            sa.Column("start_time", sa.DateTime(), nullable=True),
            sa.Column("end_time", sa.DateTime(), nullable=True),
            sa.Column("temporal_granularity", sa.String(), nullable=True),
            sa.Column("gas", sa.String(), nullable=True),
            sa.Column("emissions_quantity", sa.BigInteger(), nullable=True),
            sa.Column("emissions_factor", sa.Float(), nullable=True),
            sa.Column("emissions_factor_units", sa.String(), nullable=True),
            sa.Column("capacity", sa.Float(), nullable=True),
            sa.Column("capacity_units", sa.String(), nullable=True),
            sa.Column("capacity_factor", sa.Float(), nullable=True),
            sa.Column("activity", sa.Float(), nullable=True),
            sa.Column("activity_units", sa.String(), nullable=True),
            sa.Column("asset_name", sa.String(), nullable=True),
            sa.Column("asset_type", sa.String(), nullable=True),
            sa.Column("st_astext", sa.String(), nullable=True),
            sa.Column("lat", sa.Float(), nullable=True),
            sa.Column("lon", sa.Float(), nullable=True),
            sa.Column("created_date", sa.DateTime(), nullable=True),
            sa.Column("modified_date", sa.DateTime(), nullable=True),
            sa.Column("database_updated", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")),
            sa.Column("locode", sa.String(), nullable=True),
        )

    # ghgrp_epa: from migration dc1837707630
    if "ghgrp_epa" not in public_tables:
        op.create_table(
            "ghgrp_epa",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("facility_id", sa.String(), nullable=False),
            sa.Column("facility_name", sa.String(), nullable=False),
            sa.Column("city", sa.String(), nullable=False),
            sa.Column("locode", sa.String(), nullable=False),
            sa.Column("state", sa.String(), nullable=False),
            sa.Column("county", sa.String(), nullable=False),
            sa.Column("latitude", sa.Float(), nullable=False),
            sa.Column("longitude", sa.Float(), nullable=False),
            sa.Column("geometry", sa.String(), nullable=False),
            sa.Column("subparts", sa.String(), nullable=False),
            sa.Column("subpart_name", sa.String(), nullable=False),
            sa.Column("sectors", sa.String(), nullable=False),
            sa.Column("final_sector", sa.String(), nullable=False),
            sa.Column("GPC_ref_no", sa.String(), nullable=False),
            sa.Column("year", sa.String(), nullable=False),
            sa.Column("emissions_quantity_units", sa.String(), nullable=False),
            sa.Column("gas", sa.String(), nullable=False),
            sa.Column("emissions_quantity", sa.Float(), nullable=False),
            sa.Column("GWP_ref", sa.String(), nullable=False),
            sa.Column("created_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")),
            sa.Column("modified_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")),
        )

    # country_code: final state after migrations 65608a44ede7, 949c5b9cc18d
    if "country_code" not in public_tables:
        op.create_table(
            "country_code",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("source_name", sa.String(), nullable=False),
            sa.Column("GPC_refno", sa.String(), nullable=False),
            sa.Column("country_name", sa.String(), nullable=False),
            sa.Column("country_code", sa.String(), nullable=False),
            sa.Column("temporal_granularity", sa.String(), nullable=False),
            sa.Column("year", sa.Float(), nullable=False),
            sa.Column("activity_name", sa.String(), nullable=False),
            sa.Column("activity_value", sa.String(), nullable=True),
            sa.Column("activity_units", sa.String(), nullable=True),
            sa.Column("gas_name", sa.String(), nullable=False),
            sa.Column("emissions_value", sa.String(), nullable=False),
            sa.Column("emissions_units", sa.Float(), nullable=False),
            sa.Column("created_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")),
            sa.Column("modified_date", sa.DateTime(), server_default=text("CURRENT_TIMESTAMP")),
            sa.Column("emission_factor_value", sa.Float(), nullable=True),
            sa.Column("emission_factor_units", sa.String(), nullable=True),
        )

    # ── Recreate NBS tables ────────────────────────────────────────────────────

    if "nbs_geospatial_catalog" not in modelled_tables:
        op.create_table(
            "nbs_geospatial_catalog",
            sa.Column("layer_input_id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("layer_type", sa.String(length=64), nullable=False),
            sa.Column("category", sa.String(length=128), nullable=False),
            sa.Column("publisher_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("dataset_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("release_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("access_type", sa.String(length=64), nullable=False),
            sa.Column("source_url", sa.String(length=2048), nullable=True),
            sa.Column("data_format", sa.String(length=64), nullable=True),
            sa.Column("spatial_resolution", sa.String(length=32), nullable=True),
            sa.Column("crs", sa.String(length=32), nullable=True),
            sa.Column("license", sa.String(length=255), nullable=True),
            sa.Column("brief_description", sa.String(length=1024), nullable=True),
            sa.Column("notes", sa.String(length=1024), nullable=True),
            sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            schema="modelled",
        )
        op.create_foreign_key("fk_nbs_geospatial_catalog_dataset", "nbs_geospatial_catalog", "publisher_datasource", ["publisher_id", "dataset_id"], ["publisher_id", "dataset_id"], source_schema="modelled", referent_schema="modelled", ondelete="RESTRICT")
        op.create_foreign_key("fk_nbs_geospatial_catalog_release", "nbs_geospatial_catalog", "dataset_release", ["release_id"], ["release_id"], source_schema="modelled", referent_schema="modelled", ondelete="SET NULL")
        op.create_index("ix_nbs_geospatial_catalog_dataset_id", "nbs_geospatial_catalog", ["dataset_id"], unique=False, schema="modelled")
        op.create_index("ix_nbs_geospatial_catalog_release_id", "nbs_geospatial_catalog", ["release_id"], unique=False, schema="modelled")
        op.create_index("ix_nbs_geospatial_catalog_layer_type_category", "nbs_geospatial_catalog", ["layer_type", "category"], unique=False, schema="modelled")
        op.create_index("ix_nbs_geospatial_catalog_name", "nbs_geospatial_catalog", ["name"], unique=False, schema="modelled")
        op.create_unique_constraint("uq_nbs_geospatial_catalog_dataset_release_name", "nbs_geospatial_catalog", ["publisher_id", "dataset_id", "release_id", "name"], schema="modelled")
        op.create_check_constraint("ck_nbs_geospatial_catalog_layer_type", "nbs_geospatial_catalog", "layer_type in ('hazard','exposure','ecosystem_type','ecosystem_function','opportunity','context')", schema="modelled")
        op.create_check_constraint("ck_nbs_geospatial_catalog_access_type", "nbs_geospatial_catalog", "access_type in ('gee','api','manual_download','internal')", schema="modelled")

    if "nbs_layer_publication" not in modelled_tables:
        op.create_table(
            "nbs_layer_publication",
            sa.Column("publication_id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()")),
            sa.Column("layer_input_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("city_id", sa.String(length=128), nullable=False),
            sa.Column("bbox", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("version_label", sa.String(length=64), nullable=False),
            sa.Column("release_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("data_type", sa.String(length=32), nullable=False),
            sa.Column("published_format", sa.String(length=64), nullable=True),
            sa.Column("resolution_m", sa.Integer(), nullable=True),
            sa.Column("assets", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column("processing_repo_commit", sa.String(length=128), nullable=True),
            sa.Column("methodology_note", sa.String(length=1024), nullable=True),
            sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            schema="modelled",
        )
        op.create_foreign_key("fk_nbs_layer_publication_layer_input", "nbs_layer_publication", "nbs_geospatial_catalog", ["layer_input_id"], ["layer_input_id"], source_schema="modelled", referent_schema="modelled", ondelete="CASCADE")
        op.create_foreign_key("fk_nbs_layer_publication_release", "nbs_layer_publication", "dataset_release", ["release_id"], ["release_id"], source_schema="modelled", referent_schema="modelled", ondelete="SET NULL")
        op.create_index("ix_nbs_layer_publication_layer_input_id", "nbs_layer_publication", ["layer_input_id"], unique=False, schema="modelled")
        op.create_index("ix_nbs_layer_publication_city_id", "nbs_layer_publication", ["city_id"], unique=False, schema="modelled")
        op.create_index("ix_nbs_layer_publication_release_id", "nbs_layer_publication", ["release_id"], unique=False, schema="modelled")
        op.create_index("ix_nbs_layer_publication_city_data_type", "nbs_layer_publication", ["city_id", "data_type"], unique=False, schema="modelled")
        op.create_unique_constraint("uq_nbs_layer_publication_layer_city_version", "nbs_layer_publication", ["layer_input_id", "city_id", "version_label"], schema="modelled")
        op.create_check_constraint("ck_nbs_layer_publication_data_type", "nbs_layer_publication", "data_type in ('raster','vector')", schema="modelled")
        op.create_check_constraint("ck_nbs_layer_publication_assets_nonempty", "nbs_layer_publication", "jsonb_typeof(assets) = 'object' AND assets <> '{}'::jsonb", schema="modelled")

    # ── Recreate legacy public tables ─────────────────────────────────────────

    # dim_geography: final name after migration 3ba93748222f renamed "geography"
    if "dim_geography" not in public_tables and "geography" not in public_tables:
        op.create_table(
            "dim_geography",
            sa.Column("locode", sa.String(8), nullable=False, primary_key=True),
            sa.Column("region", sa.String(8), nullable=True, index=True),
            sa.Column("country", sa.String(4), nullable=False, index=True),
        )

    # public.population: from migration 583858ff1aa8
    if "population" not in public_tables:
        op.create_table(
            "population",
            sa.Column("actor_id", sa.String(8), nullable=False),
            sa.Column("year", sa.Integer(), nullable=False),
            sa.Column("population", sa.BigInteger(), nullable=False),
            sa.PrimaryKeyConstraint("actor_id", "year"),
        )

    # public.osm: from migration 34acb9d76c8e
    if "osm" not in public_tables:
        op.create_table(
            "osm",
            sa.Column("geometry", sa.Text(), nullable=True),
            sa.Column("bbox_north", sa.Float(), nullable=True, index=True),
            sa.Column("bbox_south", sa.Float(), nullable=True, index=True),
            sa.Column("bbox_east", sa.Float(), nullable=True, index=True),
            sa.Column("bbox_west", sa.Float(), nullable=True, index=True),
            sa.Column("place_id", sa.Integer(), nullable=True),
            sa.Column("osm_type", sa.String(), nullable=True),
            sa.Column("osm_id", sa.Integer(), nullable=True, unique=True),
            sa.Column("lat", sa.Float(), nullable=True),
            sa.Column("lon", sa.Float(), nullable=True),
            sa.Column("class", sa.String(), nullable=True),
            sa.Column("type", sa.String(), nullable=True),
            sa.Column("place_rank", sa.Integer(), nullable=True),
            sa.Column("importance", sa.Float(), nullable=True),
            sa.Column("addresstype", sa.String(), nullable=True),
            sa.Column("name", sa.String(), nullable=True),
            sa.Column("display_name", sa.String(), nullable=True),
            sa.Column("locode", sa.String(), nullable=True, primary_key=True),
        )

    # public.climate_action: from migration df2243cdb86d
    if "climate_action" not in public_tables:
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
            sa.CheckConstraint('"CoBenefitsAirQuality" >= -2 AND "CoBenefitsAirQuality" <= 2', name="check_cobenefits_air_quality"),
            sa.CheckConstraint('"CoBenefitsWaterQuality" >= -2 AND "CoBenefitsWaterQuality" <= 2', name="check_cobenefits_water_quality"),
            sa.CheckConstraint('"CoBenefitsHabitat" >= -2 AND "CoBenefitsHabitat" <= 2', name="check_cobenefits_habitat"),
            sa.CheckConstraint('"CoBenefitsCostOfLiving" >= -2 AND "CoBenefitsCostOfLiving" <= 2', name="check_cobenefits_cost_of_living"),
            sa.CheckConstraint('"CoBenefitsHousing" >= -2 AND "CoBenefitsHousing" <= 2', name="check_cobenefits_housing"),
            sa.CheckConstraint('"CoBenefitsMobility" >= -2 AND "CoBenefitsMobility" <= 2', name="check_cobenefits_mobility"),
            sa.CheckConstraint('"CoBenefitsStakeholderEngagement" >= -2 AND "CoBenefitsStakeholderEngagement" <= 2', name="check_cobenefits_stakeholder_engagement"),
            sa.CheckConstraint("\"GHGReductionPotentialStationaryEnergy\" IS NULL or \"GHGReductionPotentialStationaryEnergy\" IN ('0-19', '20-39', '40-59', '60-79', '80-100')", name="check_ghg_reduction_potential_stationary_energy"),
            sa.CheckConstraint("\"GHGReductionPotentialTransportation\" IS NULL or \"GHGReductionPotentialTransportation\" IN ('0-19', '20-39', '40-59', '60-79', '80-100')", name="check_ghg_reduction_potential_transportation"),
            sa.CheckConstraint("\"GHGReductionPotentialWaste\" IS NULL or \"GHGReductionPotentialWaste\" IN ('0-19', '20-39', '40-59', '60-79', '80-100')", name="check_ghg_reduction_potential_waste"),
            sa.CheckConstraint("\"GHGReductionPotentialIPPU\" IS NULL or \"GHGReductionPotentialIPPU\" IN ('0-19', '20-39', '40-59', '60-79', '80-100')", name="check_ghg_reduction_potential_ippu"),
            sa.CheckConstraint("\"GHGReductionPotentialAFOLU\" IS NULL or \"GHGReductionPotentialAFOLU\" IN ('0-19', '20-39', '40-59', '60-79', '80-100')", name="check_ghg_reduction_potential_afolu"),
            sa.CheckConstraint("\"AdaptationEffectiveness\" IS NULL OR \"AdaptationEffectiveness\" IN ('high', 'medium', 'low')", name="check_adaptation_effectiveness"),
            sa.CheckConstraint("\"AdaptationEffectivenessDroughts\" IS NULL OR \"AdaptationEffectivenessDroughts\" IN ('high', 'medium', 'low')", name="check_adaptation_effectiveness_droughts"),
            sa.CheckConstraint("\"AdaptationEffectivenessHeatwaves\" IS NULL OR \"AdaptationEffectivenessHeatwaves\" IN ('high', 'medium', 'low')", name="check_adaptation_effectiveness_heatwaves"),
            sa.CheckConstraint("\"AdaptationEffectivenessFloods\" IS NULL OR \"AdaptationEffectivenessFloods\" IN ('high', 'medium', 'low')", name="check_adaptation_effectiveness_floods"),
            sa.CheckConstraint("\"AdaptationEffectivenessSeaLevelRise\" IS NULL OR \"AdaptationEffectivenessSeaLevelRise\" IN ('high', 'medium', 'low')", name="check_adaptation_effectiveness_sea_level_rise"),
            sa.CheckConstraint("\"AdaptationEffectivenessLandslides\" IS NULL OR \"AdaptationEffectivenessLandslides\" IN ('high', 'medium', 'low')", name="check_adaptation_effectiveness_landslides"),
            sa.CheckConstraint("\"AdaptationEffectivenessStorms\" IS NULL OR \"AdaptationEffectivenessStorms\" IN ('high', 'medium', 'low')", name="check_adaptation_effectiveness_storms"),
            sa.CheckConstraint("\"AdaptationEffectivenessWildfires\" IS NULL OR \"AdaptationEffectivenessWildfires\" IN ('high', 'medium', 'low')", name="check_adaptation_effectiveness_wildfires"),
            sa.CheckConstraint("\"AdaptationEffectivenessDiseases\" IS NULL OR \"AdaptationEffectivenessDiseases\" IN ('high', 'medium', 'low')", name="check_adaptation_effectiveness_diseases"),
            sa.CheckConstraint("\"CostInvestmentNeeded\" IS NULL OR \"CostInvestmentNeeded\" IN ('high', 'medium', 'low')", name="check_cost_investment_needed"),
            sa.CheckConstraint("\"TimelineForImplementation\" IS NULL OR \"TimelineForImplementation\" IN ('<5 years', '5-10 years', '>10 years')", name="check_timeline_for_implementation"),
            sa.CheckConstraint(
                "\"Biome\" is NULL or \"Biome\" in ('none','tropical_rainforest','temperate_forest','desert',"
                "'grassland_savanna','tundra','wetlands','mountains','boreal_forest_taiga','coastal_marine')"
            ),
        )
        # Array-based CHECK constraints require ALTER TABLE (PostgreSQL <@ operator)
        op.execute("""ALTER TABLE climate_action ADD CONSTRAINT check_action_type
            CHECK ("ActionType" IS NULL OR "ActionType" <@ ARRAY['mitigation','adaptation']::varchar[])""")
        op.execute("""ALTER TABLE climate_action ADD CONSTRAINT check_hazard_values
            CHECK ("Hazard" IS NULL OR "Hazard" <@ ARRAY[
              'droughts','heatwaves','floods','sea-level-rise','landslides',
              'storms','wildfires','diseases']::varchar[])""")
        op.execute("""ALTER TABLE climate_action ADD CONSTRAINT check_sector_values
            CHECK ("Sector" IS NULL OR "Sector" <@ ARRAY[
              'stationary_energy','transportation','waste','ippu','afolu',
              'water_resources','food_security','energy_security','biodiversity',
              'public_health','railway_infrastructure','road_infrastructure',
              'port_infrastructure','geo-hydrological_disasters']::varchar[])""")
        op.execute("""ALTER TABLE climate_action ADD CONSTRAINT check_subsector_values
            CHECK ("Subsector" IS NULL OR "Subsector" <@ ARRAY[
              'residential_buildings','commercial_and_institutional_buildings_and_facilities',
              'manufacturing_industries_and_construction','energy_industries',
              'energy_generation_supplied_to_the_grid',
              'agriculture_forestry_and_fishing_activities','non-specified_sources',
              'fugitive_emissions_from_mining_processing_storage_and_transportation_of_coal',
              'fugitive_emissions_from_oil_and_natural_gas_systems',
              'on-road','railways','waterborne_navigation','aviation','off-road',
              'disposal_of_solid_waste_generated_in_the_city',
              'disposal_of_solid_waste_generated_outside_the_city',
              'biological_treatment_of_waste_generated_in_the_city',
              'biological_treatment_of_waste_generated_outside_the_city',
              'incineration_and_open_burning_of_waste_generated_in_the_city',
              'incineration_and_open_burning_of_waste_generated_outside_the_city',
              'wastewater_generated_in_the_city','wastewater_generated_outside_the_city',
              'industrial_processes','product_use','livestock','land',
              'aggregate_sources_and_non-co2_emission_sources_on_land','all']::varchar[])""")
        op.execute("""ALTER TABLE climate_action ADD CONSTRAINT check_primary_purpose
            CHECK ("PrimaryPurpose" IS NULL OR "PrimaryPurpose" <@ ARRAY[
              'ghg_reduction','climate_resilience']::varchar[])""")
