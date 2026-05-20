"""Create modelled.action_pathway and action_pathway_mitigation_impact (GPC subsector + refs on impacts).

Revision ID: c9a4e21bd301
Revises: b7c2d9e4a1f0
Create Date: 2026-04-27 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


# revision identifiers, used by Alembic.
revision: str = "c9a4e21bd301"
down_revision: Union[str, None] = "b7c2d9e4a1f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "action_pathway",
        sa.Column("pathway_id", UUID(as_uuid=True), nullable=False),
        sa.Column("src_action_id", sa.String(), nullable=True),
        sa.Column("publisher_id", sa.String(), nullable=True),
        sa.Column("action_type", sa.String(), nullable=False),
        sa.Column("action_role", sa.String(), nullable=True),
        sa.Column("intervention_type", sa.String(), nullable=True),
        sa.Column("investment_cost", sa.String(), nullable=True),
        sa.Column("implementation_timeline", sa.String(), nullable=True),
        sa.Column("generation_method", sa.String(), nullable=False),
        sa.Column("name_i18n", JSONB, nullable=True),
        sa.Column("description_i18n", JSONB, nullable=True),
        sa.Column("intervention_summary_i18n", JSONB, nullable=True),
        sa.Column("outcome_summary_i18n", JSONB, nullable=True),
        sa.Column("release_id", UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.CheckConstraint(
            "action_type IN ('mitigation', 'adaptation')",
            name="check_action_pathway_action_type",
        ),
        sa.ForeignKeyConstraint(
            ["release_id"],
            ["modelled.dataset_release.release_id"],
            name="fk_action_pathway_release_id",
        ),
        sa.PrimaryKeyConstraint("pathway_id"),
        schema="modelled",
    )

    op.create_index(
        "idx_action_pathway_release_id",
        "action_pathway",
        ["release_id"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "idx_action_pathway_action_type",
        "action_pathway",
        ["action_type"],
        unique=False,
        schema="modelled",
    )

    op.create_table(
        "action_pathway_mitigation_impact",
        sa.Column("pathway_impact_id", UUID(as_uuid=True), nullable=False),
        sa.Column("pathway_id", UUID(as_uuid=True), nullable=False),
        sa.Column("subsector_number", sa.String(), nullable=True),
        sa.Column("gpc_reference_number", JSONB, nullable=True),
        sa.Column("metric_name", sa.String(), nullable=False),
        sa.Column("metric_units", sa.String(), nullable=True),
        sa.Column("metric_value_numeric", sa.Numeric(), nullable=True),
        sa.Column("metric_value_text", sa.String(), nullable=True),
        sa.Column("reporting_year", sa.Integer(), nullable=True),
        sa.Column("release_id", UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(
            ["pathway_id"],
            ["modelled.action_pathway.pathway_id"],
            name="fk_action_pathway_mitigation_impact_pathway_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["release_id"],
            ["modelled.dataset_release.release_id"],
            name="fk_action_pathway_mitigation_impact_release_id",
        ),
        sa.PrimaryKeyConstraint("pathway_impact_id"),
        schema="modelled",
    )
    op.create_index(
        "idx_action_pathway_mitigation_impact_pathway_id",
        "action_pathway_mitigation_impact",
        ["pathway_id"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "idx_action_pathway_mitigation_impact_release_id",
        "action_pathway_mitigation_impact",
        ["release_id"],
        unique=False,
        schema="modelled",
    )


def downgrade() -> None:
    op.drop_index(
        "idx_action_pathway_mitigation_impact_release_id",
        table_name="action_pathway_mitigation_impact",
        schema="modelled",
    )
    op.drop_index(
        "idx_action_pathway_mitigation_impact_pathway_id",
        table_name="action_pathway_mitigation_impact",
        schema="modelled",
    )
    op.drop_table("action_pathway_mitigation_impact", schema="modelled")
    op.drop_index("idx_action_pathway_action_type", table_name="action_pathway", schema="modelled")
    op.drop_index("idx_action_pathway_release_id", table_name="action_pathway", schema="modelled")
    op.drop_table("action_pathway", schema="modelled")
