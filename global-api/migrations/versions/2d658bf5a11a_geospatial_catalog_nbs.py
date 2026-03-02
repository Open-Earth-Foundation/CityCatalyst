"""geospatial_catalog_nbs

Revision ID: 2d658bf5a11a
Revises: 91f5e49693dd
Create Date: 2026-03-02 11:56:30.559475

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '2d658bf5a11a'
down_revision: Union[str, None] = '91f5e49693dd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "nbs_geospatial_catalog",
        sa.Column(
            "layer_input_id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),

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

    # Foreign keys (added separately so the schema-qualified refs are explicit)
    # publisher_datasource uses a composite PK (publisher_id, dataset_id), so
    # the catalog must reference both columns together.
    op.create_foreign_key(
        "fk_nbs_geospatial_catalog_dataset",
        source_table="nbs_geospatial_catalog",
        referent_table="publisher_datasource",
        local_cols=["publisher_id", "dataset_id"],
        remote_cols=["publisher_id", "dataset_id"],
        source_schema="modelled",
        referent_schema="modelled",
        ondelete="RESTRICT",
    )

    op.create_foreign_key(
        "fk_nbs_geospatial_catalog_release",
        source_table="nbs_geospatial_catalog",
        referent_table="dataset_release",
        local_cols=["release_id"],
        remote_cols=["release_id"],
        source_schema="modelled",
        referent_schema="modelled",
        ondelete="SET NULL",
    )

    # Indexes
    op.create_index(
        "ix_nbs_geospatial_catalog_dataset_id",
        "nbs_geospatial_catalog",
        ["dataset_id"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "ix_nbs_geospatial_catalog_release_id",
        "nbs_geospatial_catalog",
        ["release_id"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "ix_nbs_geospatial_catalog_layer_type_category",
        "nbs_geospatial_catalog",
        ["layer_type", "category"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "ix_nbs_geospatial_catalog_name",
        "nbs_geospatial_catalog",
        ["name"],
        unique=False,
        schema="modelled",
    )

    # Uniqueness to avoid duplicates of the “same layer from the same dataset release”
    op.create_unique_constraint(
        "uq_nbs_geospatial_catalog_dataset_release_name",
        "nbs_geospatial_catalog",
        ["publisher_id", "dataset_id", "release_id", "name"],
        schema="modelled",
    )

    # Optional: light validation via CHECK constraints (keep simple for POC)
    op.create_check_constraint(
        "ck_nbs_geospatial_catalog_layer_type",
        "nbs_geospatial_catalog",
        "layer_type in ('hazard','exposure','ecosystem_type','ecosystem_function','opportunity','context')",
        schema="modelled",
    )
    op.create_check_constraint(
        "ck_nbs_geospatial_catalog_access_type",
        "nbs_geospatial_catalog",
        "access_type in ('gee','api','manual_download','internal')",
        schema="modelled",
    )


def downgrade() -> None:
    op.drop_constraint("ck_nbs_geospatial_catalog_access_type", "nbs_geospatial_catalog", schema="modelled", type_="check")
    op.drop_constraint("ck_nbs_geospatial_catalog_layer_type", "nbs_geospatial_catalog", schema="modelled", type_="check")

    op.drop_constraint("uq_nbs_geospatial_catalog_dataset_release_name", "nbs_geospatial_catalog", schema="modelled", type_="unique")

    op.drop_index("ix_nbs_geospatial_catalog_name", table_name="nbs_geospatial_catalog", schema="modelled")
    op.drop_index("ix_nbs_geospatial_catalog_layer_type_category", table_name="nbs_geospatial_catalog", schema="modelled")
    op.drop_index("ix_nbs_geospatial_catalog_release_id", table_name="nbs_geospatial_catalog", schema="modelled")
    op.drop_index("ix_nbs_geospatial_catalog_dataset_id", table_name="nbs_geospatial_catalog", schema="modelled")

    op.drop_constraint("fk_nbs_geospatial_catalog_release", "nbs_geospatial_catalog", schema="modelled", type_="foreignkey")
    op.drop_constraint("fk_nbs_geospatial_catalog_dataset", "nbs_geospatial_catalog", schema="modelled", type_="foreignkey")

    op.drop_table("nbs_geospatial_catalog", schema="modelled")
