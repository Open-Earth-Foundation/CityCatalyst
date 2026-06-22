"""create modelled.finance_project (+ finance_project_action)

Table 2 of the Chile climate-finance model (design:
dataset-review/reviews/oef/cl-city-action-fundability/releases/v1/implementation.md
section 3.2). Precedent layer: one row per funded/awarded/formulated project, with
co-finance folded into a JSONB `funding_sources` array (section 4.2). Sources: BIP
(cl-ssg-projects), CONAF (cl-conaf-bn-awards), FPA (cl-mma-fpa-awards), GCF (gcf-projects).

Follows the finance_opportunity conventions (revision 9f3c1a7b2e10): UUID PK,
release-scoped natural key, FK to modelled.dataset_release, indexes on release_id and
the (release_id, country_code, <key>) lookups.

Design decisions baked in (signed off in review):
  - project_id is DETERMINISTIC, not random: MD5(CONCAT_WS('-', source_project_id,
    release_id::TEXT))::UUID, assigned by the modelled load (same scheme as opportunity_id).
    Re-running a release reproduces identical ids -> idempotent delete+insert is stable.
  - source_project_id keeps the ORIGINAL source code (codigo_bip / folio / award_id /
    fp_id); identity is per-source.
  - actor_id is the city *locode* (e.g. "CL IQQ"), resolved from comuna at load via the
    cl-ocha-ab lookup; NULL for region-only (CONAF) and national (GCF) rows.
  - descriptive free-text that is translated carries a companion <col>_i18n JSONB
    ({"en": ..., "es": ...}): project_name_i18n, sector_i18n. Other descriptive fields are
    proper nouns (caps-normalized, not translated) or canonical English controlled vocab.
  - sector is intentionally MIXED taxonomy (BIP Spanish source names vs GPC `afolu` for
    CONAF vs GPC tokens for FPA/GCF) -- a known, documented mapping gap (section 6).
  - action matches live in modelled.finance_project_action (not as columns on finance_project),
    mirroring finance_opportunity_action -- so a project can carry several matches. confidence is
    the canonical {strong, goal_aligned}; off-list source confidences are dropped (no link row).
  - no beneficiaries_total column: no source populates it and no consumer reads it
    (model only columns with a consumer).
  - amounts stored raw with amount_unit (CLP_millions / UTM / CLP / USD); no normalized
    currency column for v1 (section 6). cost_total is BIP-fed; FPA/CONAF awards -> amount_committed.

Revision ID: a4f1c9d72b3e
Revises: 9f3c1a7b2e10
Create Date: 2026-06-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision: str = "a4f1c9d72b3e"
down_revision: Union[str, None] = "9f3c1a7b2e10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "finance_project",
        # deterministic id (NOT random): MD5(CONCAT_WS('-', source_project_id, release_id::TEXT))::UUID,
        # assigned by the modelled load (mirrors opportunity_id). Reproducible across re-runs.
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("source_project_id", sa.String(), nullable=False),   # original source code

        # action match is NOT a column here: it lives in modelled.finance_project_action
        # (a project<->action link table, below), mirroring finance_opportunity_action, so a
        # project can carry several action matches.

        # identity / classification
        sa.Column("project_name", sa.Text(), nullable=False),
        sa.Column("project_name_i18n", JSONB, nullable=True),          # {"en": ..., "es": ...}
        sa.Column("sector", sa.String(), nullable=True),               # mixed taxonomy (see docstring)
        sa.Column("sector_i18n", JSONB, nullable=True),
        sa.Column("jurisdiction", sa.String(), nullable=True),         # source label (comuna / region)
        sa.Column("actor_id", sa.String(), nullable=True),             # city locode (e.g. "CL IQQ")

        # lifecycle / evaluation
        sa.Column("lifecycle_stage", sa.String(), nullable=True),
        sa.Column("evaluation_verdict", sa.String(), nullable=True),   # RATE etc.; sparse

        # amounts (currency-explicit, raw with unit -- section 6)
        sa.Column("cost_total", sa.Numeric(), nullable=True),
        sa.Column("amount_committed", sa.Numeric(), nullable=True),
        sa.Column("amount_paid", sa.Numeric(), nullable=True),
        sa.Column("amount_unit", sa.String(), nullable=True),          # CLP_millions / UTM / CLP / USD
        sa.Column("duration_months", sa.Numeric(), nullable=True),

        # provenance / parties
        sa.Column("owner_formulator", sa.Text(), nullable=True),
        sa.Column("funding_channel", sa.String(), nullable=True),      # competitive fund / public investment / intermediated multilateral
        sa.Column("funding_sources", JSONB, nullable=True),            # array of co-finance entries (section 4.2)

        sa.Column("country_code", sa.String(length=2), nullable=True),
        sa.Column("source_dataset", sa.String(), nullable=True),

        # release / housekeeping
        sa.Column("release_id", UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),

        sa.ForeignKeyConstraint(
            ["release_id"], ["modelled.dataset_release.release_id"],
            name="fk_finance_project_release_id",
        ),
        sa.PrimaryKeyConstraint("project_id"),
        sa.UniqueConstraint(
            "release_id", "country_code", "source_project_id",
            name="uq_finance_project_source",
        ),
        schema="modelled",
    )
    op.create_index("idx_finance_project_release_id", "finance_project",
                    ["release_id"], unique=False, schema="modelled")
    op.create_index("idx_finance_project_release_country_actor", "finance_project",
                    ["release_id", "country_code", "actor_id"], unique=False, schema="modelled")
    op.create_index("idx_finance_project_release_country_sector", "finance_project",
                    ["release_id", "country_code", "sector"], unique=False, schema="modelled")

    # project <-> action mapping (many-to-many); room for multiple matches per project.
    # Mirrors modelled.finance_opportunity_action. Built from the per-source action crosswalks
    # (BIP per-project matches; GCF/FPA/CONAF grain crosswalks). confidence is the canonical
    # match strength {strong, goal_aligned}.
    op.create_table(
        "finance_project_action",
        # deterministic id: MD5(CONCAT_WS('-', project_id::TEXT, action_id, mapping_source))::UUID,
        # assigned by the modelled load.
        sa.Column("project_action_id", UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("action_id", sa.String(), nullable=False),
        sa.Column("mapping_source", sa.String(), nullable=True),    # ssg-match / gcf-crosswalk / fpa-crosswalk / conaf-crosswalk
        sa.Column("confidence", sa.String(), nullable=True),        # strong / goal_aligned
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column("release_id", UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(
            ["project_id"], ["modelled.finance_project.project_id"],
            name="fk_finance_project_action_project_id", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["release_id"], ["modelled.dataset_release.release_id"],
            name="fk_finance_project_action_release_id",
        ),
        sa.PrimaryKeyConstraint("project_action_id"),
        sa.UniqueConstraint("project_id", "action_id", "mapping_source",
                            name="uq_finance_project_action"),
        schema="modelled",
    )
    op.create_index("idx_finance_project_action_project_id", "finance_project_action",
                    ["project_id"], unique=False, schema="modelled")
    op.create_index("idx_finance_project_action_action_id", "finance_project_action",
                    ["action_id"], unique=False, schema="modelled")
    op.create_index("idx_finance_project_action_release_id", "finance_project_action",
                    ["release_id"], unique=False, schema="modelled")


def downgrade() -> None:
    op.drop_table("finance_project_action", schema="modelled")
    op.drop_index("idx_finance_project_release_id", table_name="finance_project", schema="modelled")
    op.drop_index("idx_finance_project_release_country_actor", table_name="finance_project", schema="modelled")
    op.drop_index("idx_finance_project_release_country_sector", table_name="finance_project", schema="modelled")
    op.drop_table("finance_project", schema="modelled")
