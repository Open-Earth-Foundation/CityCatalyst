"""Create modelled.action_mitigation_feasibility_chain table.

Revision ID: 4b7e2a1c9d8f
Revises: e5f3b2a81d04
Create Date: 2026-05-20 00:00:00.000000

Stores action-to-SR1.5 feasibility bridge rows loaded from scoring_chain.csv.
One row per deterministic chain_id (generated in ingest SQL) anchored to release_id.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = "4b7e2a1c9d8f"
down_revision: Union[str, None] = "e5f3b2a81d04"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "action_mitigation_feasibility_chain",
        sa.Column("chain_id", UUID(as_uuid=True), nullable=False),
        sa.Column("country_code", sa.String(length=2), nullable=False),
        sa.Column("src_action_id", sa.String(), nullable=False),
        sa.Column("global_mitigation_option", sa.Text(), nullable=False),
        sa.Column("action_mapping_strength", sa.String(), nullable=True),
        sa.Column("option_family", sa.String(), nullable=True),
        sa.Column("feasibility_dimension", sa.String(), nullable=False),
        sa.Column("global_indicator", sa.String(), nullable=False),
        sa.Column("global_verdict_code", sa.String(), nullable=False),
        sa.Column("global_verdict_description", sa.String(), nullable=True),
        sa.Column("city_indicator", sa.String(), nullable=True),
        sa.Column("city_indicator_direction", sa.String(), nullable=True),
        sa.Column("city_family_scope", sa.String(), nullable=True),
        sa.Column("interpretation", sa.Text(), nullable=False),
        sa.Column("release_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.ForeignKeyConstraint(
            ["release_id"],
            ["modelled.dataset_release.release_id"],
            name="fk_action_mitigation_feasibility_chain_release_id",
        ),
        sa.PrimaryKeyConstraint("chain_id"),
        schema="modelled",
    )

    op.create_index(
        "idx_action_mitigation_feasibility_chain_release_id",
        "action_mitigation_feasibility_chain",
        ["release_id"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "idx_amfc_release_country_src_action",
        "action_mitigation_feasibility_chain",
        ["release_id", "country_code", "src_action_id"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "idx_action_mitigation_feasibility_chain_global_indicator",
        "action_mitigation_feasibility_chain",
        ["global_indicator"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "idx_action_mitigation_feasibility_chain_city_indicator",
        "action_mitigation_feasibility_chain",
        ["city_indicator"],
        unique=False,
        schema="modelled",
    )


def downgrade() -> None:
    op.drop_index(
        "idx_action_mitigation_feasibility_chain_city_indicator",
        table_name="action_mitigation_feasibility_chain",
        schema="modelled",
    )
    op.drop_index(
        "idx_action_mitigation_feasibility_chain_global_indicator",
        table_name="action_mitigation_feasibility_chain",
        schema="modelled",
    )
    op.drop_index(
        "idx_amfc_release_country_src_action",
        table_name="action_mitigation_feasibility_chain",
        schema="modelled",
    )
    op.drop_index(
        "idx_action_mitigation_feasibility_chain_release_id",
        table_name="action_mitigation_feasibility_chain",
        schema="modelled",
    )
    op.drop_table("action_mitigation_feasibility_chain", schema="modelled")
