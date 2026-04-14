"""create modelled.policy_signals table

Revision ID: b7c2d9e4a1f0
Revises: 5f3e9f2b1c7d
Create Date: 2026-04-14 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


# revision identifiers, used by Alembic.
revision: str = "b7c2d9e4a1f0"
down_revision: Union[str, None] = "5f3e9f2b1c7d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
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
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
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


def downgrade() -> None:
    op.drop_index("idx_policy_signals_release_id", table_name="policy_signals", schema="modelled")
    op.drop_index("idx_policy_signals_gpc_sector", table_name="policy_signals", schema="modelled")
    op.drop_index("idx_policy_signals_signal_type", table_name="policy_signals", schema="modelled")
    op.drop_index("idx_policy_signals_location_code", table_name="policy_signals", schema="modelled")
    op.drop_table("policy_signals", schema="modelled")
