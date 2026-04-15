"""geospatial_layer_publication

Revision ID: 62abd6613eef
Revises: 2d658bf5a11a
Create Date: 2026-03-02 12:52:25.344320

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '62abd6613eef'
down_revision: Union[str, None] = '2d658bf5a11a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "nbs_layer_publication",
        sa.Column(
            "publication_id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),

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

    # Foreign keys
    op.create_foreign_key(
        "fk_nbs_layer_publication_layer_input",
        source_table="nbs_layer_publication",
        referent_table="nbs_geospatial_catalog",
        local_cols=["layer_input_id"],
        remote_cols=["layer_input_id"],
        source_schema="modelled",
        referent_schema="modelled",
        ondelete="CASCADE",
    )

    op.create_foreign_key(
        "fk_nbs_layer_publication_release",
        source_table="nbs_layer_publication",
        referent_table="dataset_release",
        local_cols=["release_id"],
        remote_cols=["release_id"],
        source_schema="modelled",
        referent_schema="modelled",
        ondelete="SET NULL",
    )

    # Indexes
    op.create_index(
        "ix_nbs_layer_publication_layer_input_id",
        "nbs_layer_publication",
        ["layer_input_id"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "ix_nbs_layer_publication_city_id",
        "nbs_layer_publication",
        ["city_id"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "ix_nbs_layer_publication_release_id",
        "nbs_layer_publication",
        ["release_id"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "ix_nbs_layer_publication_city_data_type",
        "nbs_layer_publication",
        ["city_id", "data_type"],
        unique=False,
        schema="modelled",
    )

    # Uniqueness constraint: one publication per (layer, city, version)
    op.create_unique_constraint(
        "uq_nbs_layer_publication_layer_city_version",
        "nbs_layer_publication",
        ["layer_input_id", "city_id", "version_label"],
        schema="modelled",
    )

    # Light validation (keeps enums flexible during POC)
    op.create_check_constraint(
        "ck_nbs_layer_publication_data_type",
        "nbs_layer_publication",
        "data_type in ('raster','vector')",
        schema="modelled",
    )

    # Optional: ensure assets contains at least one of the expected keys
    # (kept minimal; JSONB structural validation is limited in SQL)
    op.create_check_constraint(
        "ck_nbs_layer_publication_assets_nonempty",
        "nbs_layer_publication",
        "jsonb_typeof(assets) = 'object' AND assets <> '{}'::jsonb",
        schema="modelled",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_nbs_layer_publication_assets_nonempty", 
        "nbs_layer_publication", 
        schema="modelled", 
        type_="check"
    )

    op.drop_constraint(
        "ck_nbs_layer_publication_data_type", 
        "nbs_layer_publication", 
        schema="modelled", 
        type_="check"
    )

    op.drop_constraint(
        "uq_nbs_layer_publication_layer_city_version", 
        "nbs_layer_publication", 
        schema="modelled", 
        type_="unique"
    )

    op.drop_index(
        "ix_nbs_layer_publication_city_data_type", 
        "nbs_layer_publication", 
        schema="modelled",
    )
    op.drop_index(
        "ix_nbs_layer_publication_release_id", 
        "nbs_layer_publication", 
        schema="modelled",
    )
    op.drop_index(
        "ix_nbs_layer_publication_city_id", 
        "nbs_layer_publication", 
        schema="modelled",
    )
    op.drop_index(
        "ix_nbs_layer_publication_layer_input_id", 
        "nbs_layer_publication", 
        schema="modelled",
    )

    op.drop_constraint(
        "fk_nbs_layer_publication_release", 
        "nbs_layer_publication", 
        schema="modelled", 
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_nbs_layer_publication_layer_input", 
        "nbs_layer_publication", 
        schema="modelled", 
        type_="foreignkey",
    )

    op.drop_table("nbs_layer_publication", schema="modelled")
