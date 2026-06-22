"""create modelled.finance_opportunity (+ finance_opportunity_action)

Table 1 of the Chile climate-finance model (design:
dataset-review/reviews/oef/cl-city-action-fundability/releases/v1/implementation.md).
Supply catalogue: one row per fund/program-call a city could pursue or facilitate, plus
a fund<->action link table. Column set follows the source-field audit and the post-load
review (multi-valued fields are arrays; currency is explicit; country-agnostic vocab).

Revision ID: 9f3c1a7b2e10
Revises: ba244429bef5
Create Date: 2026-06-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision: str = "9f3c1a7b2e10"
down_revision: Union[str, None] = "ba244429bef5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "finance_opportunity",
        sa.Column("opportunity_id", UUID(as_uuid=True), nullable=False,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("source_opportunity_id", sa.String(), nullable=False),

        # identity / funder
        sa.Column("opportunity_name", sa.Text(), nullable=False),
        sa.Column("funder_name", sa.String(), nullable=True),
        sa.Column("funder_level", sa.String(), nullable=True),      # national / regional / local (backfilled)
        sa.Column("funder_channel", sa.String(), nullable=True),
        sa.Column("provider", sa.String(), nullable=True),          # implementer, when != funder

        # instrument / sector / eligibility  (multi-valued -> JSONB arrays)
        sa.Column("instrument", sa.String(), nullable=True),
        sa.Column("gpc_sectors", JSONB, nullable=True),
        sa.Column("eligible_actor", JSONB, nullable=True),          # array of canonical actors
        sa.Column("eligible_actor_detail", sa.Text(), nullable=True),

        # access
        sa.Column("city_application", JSONB, nullable=True),        # array: direct / facilitated / intermediated
        sa.Column("funding_channel", sa.String(), nullable=True),
        sa.Column("access_tier", sa.String(), nullable=True),       # competitive / gated / intermediated

        # timing / status
        sa.Column("open_date", sa.Date(), nullable=True),
        sa.Column("close_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column("status_as_of", sa.Date(), nullable=True),
        sa.Column("recurrence", sa.String(), nullable=True),

        # amount (currency-explicit)
        sa.Column("amount", sa.Numeric(), nullable=True),
        sa.Column("amount_currency", sa.String(), nullable=True),
        sa.Column("amount_note", sa.Text(), nullable=True),

        # relevance
        sa.Column("climate_relevance", sa.String(), nullable=True),
        sa.Column("specificity", sa.String(), nullable=True),

        # provenance / quality
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("legal_basis_url", sa.Text(), nullable=True),     # Bases / Resolución Exenta etc.
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("country_code", sa.String(length=2), nullable=True),
        sa.Column("source_dataset", sa.String(), nullable=True),

        # release / housekeeping
        sa.Column("release_id", UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),

        sa.ForeignKeyConstraint(
            ["release_id"], ["modelled.dataset_release.release_id"],
            name="fk_finance_opportunity_release_id",
        ),
        sa.PrimaryKeyConstraint("opportunity_id"),
        sa.UniqueConstraint(
            "release_id", "country_code", "source_opportunity_id",
            name="uq_finance_opportunity_source",
        ),
        schema="modelled",
    )
    op.create_index("idx_finance_opportunity_release_id", "finance_opportunity",
                    ["release_id"], unique=False, schema="modelled")
    op.create_index("idx_finance_opportunity_release_country", "finance_opportunity",
                    ["release_id", "country_code"], unique=False, schema="modelled")
    op.create_index("idx_finance_opportunity_release_country_close_date", "finance_opportunity",
                    ["release_id", "country_code", "close_date"], unique=False, schema="modelled")
    op.create_index("idx_finance_opportunity_funding_channel", "finance_opportunity",
                    ["funding_channel"], unique=False, schema="modelled")
    op.create_index("idx_finance_opportunity_access_tier", "finance_opportunity",
                    ["access_tier"], unique=False, schema="modelled")
    for col in ("gpc_sectors", "eligible_actor", "city_application"):
        op.create_index(f"idx_finance_opportunity_{col}", "finance_opportunity",
                        [col], unique=False, schema="modelled", postgresql_using="gin")

    # fund <-> action mapping (many-to-many); from source mappings (INDAP) now, the matcher later
    op.create_table(
        "finance_opportunity_action",
        sa.Column("opportunity_action_id", UUID(as_uuid=True), nullable=False,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("opportunity_id", UUID(as_uuid=True), nullable=False),
        sa.Column("action_id", sa.String(), nullable=False),
        sa.Column("mapping_source", sa.String(), nullable=True),    # e.g. indap-review, matcher
        sa.Column("confidence", sa.String(), nullable=True),
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column("release_id", UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(
            ["opportunity_id"], ["modelled.finance_opportunity.opportunity_id"],
            name="fk_finance_opportunity_action_opportunity_id", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["release_id"], ["modelled.dataset_release.release_id"],
            name="fk_finance_opportunity_action_release_id",
        ),
        sa.PrimaryKeyConstraint("opportunity_action_id"),
        sa.UniqueConstraint("opportunity_id", "action_id", "mapping_source",
                            name="uq_finance_opportunity_action"),
        schema="modelled",
    )
    op.create_index("idx_finance_opportunity_action_opportunity_id", "finance_opportunity_action",
                    ["opportunity_id"], unique=False, schema="modelled")
    op.create_index("idx_finance_opportunity_action_action_id", "finance_opportunity_action",
                    ["action_id"], unique=False, schema="modelled")
    op.create_index("idx_finance_opportunity_action_release_id", "finance_opportunity_action",
                    ["release_id"], unique=False, schema="modelled")


def downgrade() -> None:
    op.drop_table("finance_opportunity_action", schema="modelled")
    for ix in ("gpc_sectors", "eligible_actor", "city_application", "access_tier",
               "funding_channel", "release_country_close_date", "release_country", "release_id"):
        op.drop_index(f"idx_finance_opportunity_{ix}", table_name="finance_opportunity", schema="modelled")
    op.drop_table("finance_opportunity", schema="modelled")
