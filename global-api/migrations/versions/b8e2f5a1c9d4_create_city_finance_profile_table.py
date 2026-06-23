"""create modelled.city_finance_profile

The CITY layer of the Chile climate-finance model (design:
dataset-review/reviews/oef/cl-city-action-fundability/releases/v1/implementation.md
section 5.1). One small row per city: the two CITY axes the score reads -- financial
autonomy and delivery capacity -- plus the derived archetype. Source: the SUBDERE/SINIM
review (cl-subdere-sinim). ~345 comunas for Chile; this replaces the 35k-row precomputed
cross-product with a per-city input table.

Follows the finance_opportunity / finance_project conventions: deterministic UUID PK,
release-scoped natural key, FK to modelled.dataset_release.

Decisions:
  - city_profile_id is DETERMINISTIC: MD5(CONCAT_WS('-', actor_id, release_id::TEXT))::UUID,
    assigned by the modelled load.
  - actor_id is the city locode (the score endpoint key), resolved from comuna_cut via the
    cl-ocha-ab lookup at load. Rows whose comuna has no locode are dropped (cannot be queried).
  - autonomy = clip(1 - fcm_dependency_pct/100, 0, 1); capacity = 0.7*pctrank(staff_profesional_total)
    + 0.3*pctrank(professionalization_pct) -- the methodology blend, computed in the pipeline.
  - city_archetype banded from (autonomy, capacity) at 0.5 (city-facing, strength-based labels):
    Self-sufficient / Delivery-ready / Well-resourced / Support-ready.

Revision ID: b8e2f5a1c9d4
Revises: a4f1c9d72b3e
Create Date: 2026-06-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = "b8e2f5a1c9d4"
down_revision: Union[str, None] = "a4f1c9d72b3e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "city_finance_profile",
        # deterministic id: MD5(CONCAT_WS('-', actor_id, release_id::TEXT))::UUID, set by the modelled load
        sa.Column("city_profile_id", UUID(as_uuid=True), nullable=False),
        sa.Column("actor_id", sa.String(), nullable=False),        # city locode (the API key)
        #sa.Column("comuna_cut", sa.String(), nullable=True),       # CUT code, provenance

        sa.Column("autonomy", sa.Numeric(), nullable=True),        # 0-1, 1 - fcm_dependency_pct/100
        sa.Column("capacity", sa.Numeric(), nullable=True),        # 0-1, staff-percentile blend
        sa.Column("city_archetype", sa.String(), nullable=True),   # Self-sufficient / Delivery-ready / Well-resourced / Support-ready

        sa.Column("country_code", sa.String(length=2), nullable=True),
        sa.Column("source_dataset", sa.String(), nullable=True),

        sa.Column("release_id", UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),

        sa.ForeignKeyConstraint(
            ["release_id"], ["modelled.dataset_release.release_id"],
            name="fk_city_finance_profile_release_id",
        ),
        sa.PrimaryKeyConstraint("city_profile_id"),
        sa.UniqueConstraint("release_id", "actor_id", name="uq_city_finance_profile_actor"),
        schema="modelled",
    )
    op.create_index("idx_city_finance_profile_release_id", "city_finance_profile",
                    ["release_id"], unique=False, schema="modelled")
    op.create_index("idx_city_finance_profile_release_country_actor", "city_finance_profile",
                    ["release_id", "country_code", "actor_id"], unique=False, schema="modelled")


def downgrade() -> None:
    for ix in ("release_country_actor", "release_id"):
        op.drop_index(f"idx_city_finance_profile_{ix}", table_name="city_finance_profile", schema="modelled")
    op.drop_table("city_finance_profile", schema="modelled")
