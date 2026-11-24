"""Track an active Concept Note chat turn on its thread."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20261122_120000"
down_revision = "20261011_120000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "threads",
        sa.Column("reply_turn_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "threads",
        sa.Column("reply_turn_expires_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("threads", "reply_turn_expires_at")
    op.drop_column("threads", "reply_turn_id")
