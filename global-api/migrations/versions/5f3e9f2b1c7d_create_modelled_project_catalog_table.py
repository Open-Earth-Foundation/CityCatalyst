"""create modelled.project_portfolio table

Revision ID: 5f3e9f2b1c7d
Revises: 971397f30dd9
Create Date: 2026-04-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision: str = "5f3e9f2b1c7d"
down_revision: Union[str, None] = "971397f30dd9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_portfolio",
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("source_name", sa.String(), nullable=False),
        sa.Column("source_project_id", sa.String(), nullable=False),
        sa.Column("source_project_url", sa.Text(), nullable=True),
        sa.Column("project_name", sa.Text(), nullable=False),
        sa.Column("project_description", sa.Text(), nullable=True),
        sa.Column("project_status", sa.String(), nullable=True),
        sa.Column("project_type", sa.String(), nullable=True),
        sa.Column("country_code", sa.String(), nullable=True),
        sa.Column("country_name", sa.String(), nullable=True),
        sa.Column("world_region_name", sa.String(), nullable=True),
        sa.Column("approval_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closing_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_commitment_amount", sa.Numeric(), nullable=True),
        sa.Column("total_project_cost_amount", sa.Numeric(), nullable=True),
        sa.Column("currency_code", sa.String(), nullable=True),
        sa.Column("sector_name", sa.Text(), nullable=True),
        sa.Column("theme_name", sa.Text(), nullable=True),
        sa.Column("instrument_type", sa.String(), nullable=True),
        sa.Column("borrower_name", sa.Text(), nullable=True),
        sa.Column("implementing_agency_name", sa.Text(), nullable=True),
        sa.Column("release_id", UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(
            ["release_id"],
            ["modelled.dataset_release.release_id"],
            name="fk_project_portfolio_release_id",
        ),
        sa.PrimaryKeyConstraint("project_id"),
        sa.UniqueConstraint("source_name", "source_project_id", name="uq_project_portfolio_source_project"),
        schema="modelled",
    )

    op.create_index(
        "idx_project_portfolio_release_id",
        "project_portfolio",
        ["release_id"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "idx_project_portfolio_country_code",
        "project_portfolio",
        ["country_code"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "idx_project_portfolio_source_name",
        "project_portfolio",
        ["source_name"],
        unique=False,
        schema="modelled",
    )

    op.create_table(
        "project_summary",
        sa.Column("project_summary_id", UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("source_project_id", sa.String(), nullable=False),
        sa.Column("project_title", sa.Text(), nullable=False),
        sa.Column("funder_id", sa.String(), nullable=False),
        sa.Column("funder_name", sa.String(), nullable=False),
        sa.Column("country_name", sa.String(), nullable=True),
        sa.Column("country_code", sa.String(), nullable=True),
        sa.Column("region_name", sa.String(), nullable=True),
        sa.Column("city_name", sa.String(), nullable=True),
        sa.Column("project_type", sa.String(), nullable=True),
        sa.Column("sector_name", sa.String(), nullable=True),
        sa.Column("subsector_name", sa.String(), nullable=True),
        sa.Column("approval_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closing_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("project_status", sa.String(), nullable=True),
        sa.Column("total_budget_amount_usd", sa.Numeric(), nullable=True),
        sa.Column("primary_funder_amount_usd", sa.Numeric(), nullable=True),
        sa.Column("financing_instrument", sa.String(), nullable=True),
        sa.Column("project_summary_text", sa.Text(), nullable=True),
        sa.Column("lessons_learned", sa.Text(), nullable=True),
        sa.Column("synthesis_notes", sa.Text(), nullable=True),
        sa.Column("site_context", JSONB, nullable=True),
        sa.Column("financing_structure", JSONB, nullable=True),
        sa.Column("data_completeness", JSONB, nullable=True),
        sa.Column("actions_implemented", JSONB, nullable=True),
        sa.Column("key_risks", JSONB, nullable=True),
        sa.Column("evidence_anchors", JSONB, nullable=True),
        sa.Column("secondary_project_types", JSONB, nullable=True),
        sa.Column("co_financiers", JSONB, nullable=True),
        sa.Column("co_benefits", JSONB, nullable=True),
        sa.Column("key_interventions", JSONB, nullable=True),
        sa.Column("replicability_conditions", JSONB, nullable=True),
        sa.Column("model_metadata", JSONB, nullable=True),
        sa.Column("release_id", UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["modelled.project_portfolio.project_id"],
            name="fk_project_summary_project_id",
        ),
        sa.ForeignKeyConstraint(
            ["release_id"],
            ["modelled.dataset_release.release_id"],
            name="fk_project_summary_release_id",
        ),
        sa.PrimaryKeyConstraint("project_summary_id"),
        sa.UniqueConstraint("project_id", name="uq_project_summary_project_id"),
        schema="modelled",
    )

    op.create_index(
        "idx_project_summary_release_id",
        "project_summary",
        ["release_id"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "idx_project_summary_project_id",
        "project_summary",
        ["project_id"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "idx_project_summary_country_code",
        "project_summary",
        ["country_code"],
        unique=False,
        schema="modelled",
    )


def downgrade() -> None:
    op.drop_index("idx_project_summary_country_code", table_name="project_summary", schema="modelled")
    op.drop_index("idx_project_summary_project_id", table_name="project_summary", schema="modelled")
    op.drop_index("idx_project_summary_release_id", table_name="project_summary", schema="modelled")
    op.drop_table("project_summary", schema="modelled")
    op.drop_index("idx_project_portfolio_source_name", table_name="project_portfolio", schema="modelled")
    op.drop_index("idx_project_portfolio_country_code", table_name="project_portfolio", schema="modelled")
    op.drop_index("idx_project_portfolio_release_id", table_name="project_portfolio", schema="modelled")
    op.drop_table("project_portfolio", schema="modelled")
