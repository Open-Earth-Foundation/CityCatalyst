"""create city adapta risk fact table

Revision ID: 7c8e7d3a4b21
Revises: c9a4e21bd301
Create Date: 2026-04-29 13:02:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "7c8e7d3a4b21"
down_revision: Union[str, None] = "c9a4e21bd301"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "city_adapta_risk_fact",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        # City/time
        sa.Column("actor_id", sa.String(length=32), nullable=True),
        sa.Column("city_name", sa.String(length=255), nullable=False),
        sa.Column("country_code", sa.String(length=2), nullable=False, server_default="BR"),
        sa.Column("timeframe", sa.Integer(), nullable=True),
        sa.Column("scenario", sa.String(length=64), nullable=False),
        sa.Column("scenario_family", sa.String(length=16), nullable=True),
        # Hierarchy (IDs + names)
        sa.Column("sector_id", sa.Integer(), nullable=True),
        sa.Column("sector_name", sa.String(length=255), nullable=True),
        sa.Column("risk_id", sa.Integer(), nullable=False),
        sa.Column("risk_name", sa.String(length=255), nullable=False),
        sa.Column("risk_component_id", sa.Integer(), nullable=True),
        sa.Column("risk_component_name", sa.String(length=255), nullable=True),
        sa.Column("impact_chain_id_1", sa.Integer(), nullable=True),
        sa.Column("impact_chain_name_1", sa.String(length=255), nullable=True),
        sa.Column("impact_chain_id_2", sa.Integer(), nullable=True),
        sa.Column("impact_chain_name_2", sa.String(length=255), nullable=True),
        sa.Column("impact_chain_id_3", sa.Integer(), nullable=True),
        sa.Column("impact_chain_name_3", sa.String(length=255), nullable=True),
        sa.Column("base_indicator_id", sa.Integer(), nullable=True),
        sa.Column("base_indicator_name", sa.String(length=255), nullable=True),
        sa.Column("base_indicator_level", sa.Integer(), nullable=True),
        # Values
        sa.Column("risk_value_numeric", sa.Numeric(10, 4), nullable=True),
        sa.Column("risk_value_string", sa.String(length=64), nullable=True),
        sa.Column("risk_component_value_numeric", sa.Numeric(10, 4), nullable=True),
        sa.Column("risk_component_value_string", sa.String(length=64), nullable=True),
        sa.Column("impact_chain_1_value_numeric", sa.Numeric(10, 4), nullable=True),
        sa.Column("impact_chain_1_value_string", sa.String(length=64), nullable=True),
        sa.Column("impact_chain_2_value_numeric", sa.Numeric(10, 4), nullable=True),
        sa.Column("impact_chain_2_value_string", sa.String(length=64), nullable=True),
        sa.Column("impact_chain_3_value_numeric", sa.Numeric(10, 4), nullable=True),
        sa.Column("impact_chain_3_value_string", sa.String(length=64), nullable=True),
        sa.Column("base_indicator_value_numeric", sa.Numeric(10, 4), nullable=True),
        sa.Column("base_indicator_value_string", sa.String(length=64), nullable=True),
        # Null semantics
        sa.Column(
            "null_type",
            sa.String(length=32),
            nullable=False,
            server_default="none",
        ),
        # Provenance
        sa.Column("release_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source_dataset", sa.String(length=255), nullable=False),
        sa.Column("release_version", sa.String(length=64), nullable=True),
        sa.Column("source_vintage", sa.String(length=128), nullable=True),
        sa.Column("spatial_support_level", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_city_adapta_risk_fact"),
        schema="modelled",
    )

    op.create_foreign_key(
        "fk_city_adapta_risk_fact_release",
        source_table="city_adapta_risk_fact",
        referent_table="dataset_release",
        local_cols=["release_id"],
        remote_cols=["release_id"],
        source_schema="modelled",
        referent_schema="modelled",
        ondelete="SET NULL",
    )

    # Logical uniqueness from implementation proposal.
    op.create_unique_constraint(
        "uq_city_adapta_risk_fact_logical_key",
        "city_adapta_risk_fact",
        [
            "actor_id",
            "timeframe",
            "scenario",
            "base_indicator_id",
            "risk_component_id",
            "impact_chain_id_1",
            "impact_chain_id_2",
            "impact_chain_id_3",
        ],
        schema="modelled",
    )

    op.create_index(
        "ix_city_adapta_risk_fact_actor_time_scenario",
        "city_adapta_risk_fact",
        ["actor_id", "timeframe", "scenario"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "ix_city_adapta_risk_fact_actor_sector",
        "city_adapta_risk_fact",
        ["actor_id", "sector_id"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "ix_city_adapta_risk_fact_actor_risk",
        "city_adapta_risk_fact",
        ["actor_id", "risk_id"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "ix_city_adapta_risk_fact_actor_time_scenario_component",
        "city_adapta_risk_fact",
        ["actor_id", "timeframe", "scenario", "risk_component_id"],
        unique=False,
        schema="modelled",
    )

    op.create_check_constraint(
        "ck_city_adapta_risk_fact_null_type",
        "city_adapta_risk_fact",
        "null_type in ('none', 'structural_null', 'data_gap_null')",
        schema="modelled",
    )
    op.create_check_constraint(
        "ck_city_adapta_risk_fact_spatial_support_level",
        "city_adapta_risk_fact",
        "spatial_support_level in ('municipal', 'state', 'subsystem', 'asset')",
        schema="modelled",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_city_adapta_risk_fact_spatial_support_level",
        "city_adapta_risk_fact",
        schema="modelled",
        type_="check",
    )
    op.drop_constraint(
        "ck_city_adapta_risk_fact_null_type",
        "city_adapta_risk_fact",
        schema="modelled",
        type_="check",
    )

    op.drop_index(
        "ix_city_adapta_risk_fact_actor_time_scenario_component",
        table_name="city_adapta_risk_fact",
        schema="modelled",
    )
    op.drop_index(
        "ix_city_adapta_risk_fact_actor_risk",
        table_name="city_adapta_risk_fact",
        schema="modelled",
    )
    op.drop_index(
        "ix_city_adapta_risk_fact_actor_sector",
        table_name="city_adapta_risk_fact",
        schema="modelled",
    )
    op.drop_index(
        "ix_city_adapta_risk_fact_actor_time_scenario",
        table_name="city_adapta_risk_fact",
        schema="modelled",
    )

    op.drop_constraint(
        "uq_city_adapta_risk_fact_logical_key",
        "city_adapta_risk_fact",
        schema="modelled",
        type_="unique",
    )
    op.drop_constraint(
        "fk_city_adapta_risk_fact_release",
        "city_adapta_risk_fact",
        schema="modelled",
        type_="foreignkey",
    )
    op.drop_table("city_adapta_risk_fact", schema="modelled")
