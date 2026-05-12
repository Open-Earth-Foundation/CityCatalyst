"""Create modelled.action_legal_assessement (SSG legal analysis per action + release).

Revision ID: a9f2e8c14b60
Revises: 7c8e7d3a4b21
Create Date: 2026-05-12 00:00:00.000000

One row per (release_id, country_code, src_action_id). Action display names come from modelled.action_pathway
via src_action_id; legal_references is JSONB (e.g. ordered array of citation strings).
Derive legal_analysis_id deterministically from (release_id, country_code, src_action_id) for upserts.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision: str = "a9f2e8c14b60"
down_revision: Union[str, None] = "7c8e7d3a4b21"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "action_legal_assessement",
        sa.Column("legal_analysis_id", UUID(as_uuid=True), nullable=False),
        sa.Column("src_action_id", sa.String(), nullable=False),
        sa.Column("country_code", sa.String(length=2), nullable=False),
        sa.Column("gpc_sector", sa.String(), nullable=True),
        sa.Column("verdict_category", sa.String(), nullable=True),
        sa.Column("verdict_score", sa.Numeric(), nullable=True),
        sa.Column("ownership_category", sa.String(), nullable=True),
        sa.Column("ownership_score", sa.Numeric(), nullable=True),
        sa.Column("ownership_weight", sa.Numeric(), nullable=True),
        sa.Column("ownership_description", sa.Text(), nullable=True),
        sa.Column("restrictions_category", sa.String(), nullable=True),
        sa.Column("restrictions_score", sa.Numeric(), nullable=True),
        sa.Column("restrictions_weight", sa.Numeric(), nullable=True),
        sa.Column("restrictions_description", sa.Text(), nullable=True),
        sa.Column("legal_justification", sa.Text(), nullable=True),
        sa.Column("analysis_date", sa.Date(), nullable=True),
        sa.Column("generation_method", sa.String(), nullable=False),
        sa.Column("legal_references", JSONB, nullable=True),
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
        sa.Column("ownership_description_i18n", JSONB, nullable=True),
        sa.Column("restrictions_description_i18n", JSONB, nullable=True),
        sa.Column("legal_justification_i18n", JSONB, nullable=True),
        sa.ForeignKeyConstraint(
            ["release_id"],
            ["modelled.dataset_release.release_id"],
            name="fk_action_legal_assessement_release_id",
        ),
        sa.PrimaryKeyConstraint("legal_analysis_id"),
        sa.UniqueConstraint(
            "release_id",
            "country_code",
            "src_action_id",
            name="uq_action_legal_assessement_release_country_src_action",
        ),
        schema="modelled",
    )

    op.create_index(
        "idx_action_legal_assessement_release_id",
        "action_legal_assessement",
        ["release_id"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "idx_action_legal_assessement_src_action_id",
        "action_legal_assessement",
        ["src_action_id"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "idx_action_legal_assessement_country_code",
        "action_legal_assessement",
        ["country_code"],
        unique=False,
        schema="modelled",
    )


def downgrade() -> None:
    op.drop_index(
        "idx_action_legal_assessement_country_code",
        table_name="action_legal_assessement",
        schema="modelled",
    )
    op.drop_index(
        "idx_action_legal_assessement_src_action_id",
        table_name="action_legal_assessement",
        schema="modelled",
    )
    op.drop_index(
        "idx_action_legal_assessement_release_id",
        table_name="action_legal_assessement",
        schema="modelled",
    )
    op.drop_table("action_legal_assessement", schema="modelled")
