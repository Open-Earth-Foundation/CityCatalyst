"""Drop modelled.policy_signals; create modelled.action_policy_signals.

Revision ID: d4e8a1c92f03
Revises: a9f2e8c14b60
Create Date: 2026-05-19 00:00:00.000000

One row per (release, action, territory, document, page, signal, evidence passage).
Pipeline maps primitive_type/relation and signal_confidence at load; evidence is columnar.
Derive policy_signal_id deterministically for upserts (document in ingest SQL).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision: str = "d4e8a1c92f03"
down_revision: Union[str, None] = "a9f2e8c14b60"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index(
        "idx_policy_signals_release_id",
        table_name="policy_signals",
        schema="modelled",
    )
    op.drop_index(
        "idx_policy_signals_gpc_sector",
        table_name="policy_signals",
        schema="modelled",
    )
    op.drop_index(
        "idx_policy_signals_signal_type",
        table_name="policy_signals",
        schema="modelled",
    )
    op.drop_index(
        "idx_policy_signals_location_code",
        table_name="policy_signals",
        schema="modelled",
    )
    op.drop_table("policy_signals", schema="modelled")

    op.create_table(
        "action_policy_signals",
        sa.Column("policy_signal_id", UUID(as_uuid=True), nullable=False),
        sa.Column("src_action_id", sa.String(), nullable=False),
        sa.Column("location_scope", sa.String(), nullable=False),
        sa.Column("location_code", sa.String(), nullable=False),
        sa.Column("location_name", sa.Text(), nullable=False),
        sa.Column("signal_type", sa.String(), nullable=False),
        sa.Column("signal_relation", sa.String(), nullable=False),
        sa.Column("signal_strength", sa.String(), nullable=False),
        sa.Column("explicitness", sa.String(), nullable=False),
        sa.Column("document_type", sa.String(), nullable=False),
        sa.Column("document_name", sa.Text(), nullable=False),
        sa.Column("doc_relevance", sa.String(), nullable=False),
        sa.Column("signal_summary", sa.Text(), nullable=False),
        sa.Column("evidence_text", sa.Text(), nullable=False),
        sa.Column("page", sa.Integer(), nullable=False),
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
            name="fk_action_policy_signals_release_id",
        ),
        sa.PrimaryKeyConstraint("policy_signal_id"),
        schema="modelled",
    )

    op.create_index(
        "idx_action_policy_signals_release_id",
        "action_policy_signals",
        ["release_id"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "idx_action_policy_signals_location_code",
        "action_policy_signals",
        ["location_code"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "idx_action_policy_signals_signal_type",
        "action_policy_signals",
        ["signal_type"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "idx_action_policy_signals_release_src_action",
        "action_policy_signals",
        ["release_id", "src_action_id"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "idx_action_policy_signals_release_territory",
        "action_policy_signals",
        ["release_id", "location_scope", "location_code"],
        unique=False,
        schema="modelled",
    )


def downgrade() -> None:
    op.drop_index(
        "idx_action_policy_signals_release_territory",
        table_name="action_policy_signals",
        schema="modelled",
    )
    op.drop_index(
        "idx_action_policy_signals_release_src_action",
        table_name="action_policy_signals",
        schema="modelled",
    )
    op.drop_index(
        "idx_action_policy_signals_signal_type",
        table_name="action_policy_signals",
        schema="modelled",
    )
    op.drop_index(
        "idx_action_policy_signals_location_code",
        table_name="action_policy_signals",
        schema="modelled",
    )
    op.drop_index(
        "idx_action_policy_signals_release_id",
        table_name="action_policy_signals",
        schema="modelled",
    )
    op.drop_table("action_policy_signals", schema="modelled")

    op.create_table(
        "policy_signals",
        sa.Column("policy_signal_id", UUID(as_uuid=True), nullable=False),
        sa.Column("location_code", sa.String(), nullable=True),
        sa.Column("location_name", sa.Text(), nullable=False),
        sa.Column("location_scope", sa.String(), nullable=False),
        sa.Column("signal_type", sa.String(), nullable=False),
        sa.Column("signal_relation", sa.String(), nullable=False),
        sa.Column("signal_strength", sa.String(), nullable=True),
        sa.Column("signal_subject", sa.Text(), nullable=False),
        sa.Column("gpc_sector", sa.String(), nullable=True),
        sa.Column("signal_summary", sa.Text(), nullable=True),
        sa.Column("key_numeric", JSONB, nullable=True),
        sa.Column("evidence_anchors", JSONB, nullable=True),
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
            name="fk_policy_signals_release_id",
        ),
        sa.PrimaryKeyConstraint("policy_signal_id"),
        schema="modelled",
    )

    op.create_index(
        "idx_policy_signals_location_code",
        "policy_signals",
        ["location_code"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "idx_policy_signals_signal_type",
        "policy_signals",
        ["signal_type"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "idx_policy_signals_gpc_sector",
        "policy_signals",
        ["gpc_sector"],
        unique=False,
        schema="modelled",
    )
    op.create_index(
        "idx_policy_signals_release_id",
        "policy_signals",
        ["release_id"],
        unique=False,
        schema="modelled",
    )
