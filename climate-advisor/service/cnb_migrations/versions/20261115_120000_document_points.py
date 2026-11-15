"""Add canonical document points and their durable update outbox.

Revision ID: 20261115_120000
Revises: 20260921_120000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20261115_120000"
down_revision = "20260921_120000"
branch_labels = None
depends_on = None


def _id(name: str) -> sa.Column:
    """Declare an application-assigned UUID primary key."""
    return sa.Column(name, sa.UUID(), primary_key=True)


def _run() -> sa.Column:
    """Reference the CNB workspace without a cross-database CA run FK."""
    return sa.Column(
        "run_id", sa.UUID(), sa.ForeignKey("document_workspaces.run_id"), nullable=False
    )


def _point() -> sa.Column:
    """Reference one canonical point."""
    return sa.Column(
        "point_id", sa.UUID(), sa.ForeignKey("document_points.point_id"), nullable=False
    )


def _json(name: str, *, nullable: bool = False) -> sa.Column:
    """Declare immutable-snapshot JSON without PostgreSQL-only default casts."""
    return sa.Column(name, postgresql.JSONB(), nullable=nullable)


def upgrade() -> None:
    """Create point storage without rewriting existing chapter gaps or CA rows."""
    op.create_table(
        "document_workspaces",
        _id("run_id"),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("setup_version", sa.Integer(), nullable=False),
        sa.Column("setup_fingerprint", sa.String(64)),
        sa.Column("draft_fingerprint", sa.String(64)),
        _json("setup", nullable=True),
    )
    op.create_table(
        "document_setup_snapshots",
        _id("snapshot_id"),
        _run(),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        _json("snapshot"),
        sa.UniqueConstraint("run_id", "version"),
    )
    op.create_table(
        "document_points",
        _id("point_id"),
        _run(),
        sa.Column("semantic_key", sa.String(255), nullable=False),
        _json("definition"),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("accepted_version", sa.Integer(), nullable=False),
        sa.Column("disposition", sa.String(32), nullable=False),
        _json("value", nullable=True),
        _json("task", nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.UniqueConstraint("run_id", "semantic_key"),
    )
    op.create_table(
        "document_point_candidates",
        _id("candidate_id"),
        _point(),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        _json("value"),
        _json("citations"),
        _json("source_identity"),
        sa.Column("status", sa.String(32), nullable=False),
        sa.UniqueConstraint("point_id", "fingerprint"),
    )
    op.create_table(
        "document_point_revisions",
        _id("revision_id"),
        _point(),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.String(255), nullable=False),
        sa.Column("operation", sa.String(64), nullable=False),
        _json("snapshot"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("point_id", "version"),
    )
    op.create_table(
        "document_operations",
        _id("operation_id"),
        _run(),
        sa.Column("idempotency_key", sa.String(200), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        _json("result"),
        sa.UniqueConstraint("run_id", "idempotency_key"),
    )
    op.create_table(
        "document_needs",
        _id("need_id"),
        _run(),
        sa.Column("semantic_key", sa.String(255), nullable=False),
        _json("definition"),
        _json("documents"),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.UniqueConstraint("run_id", "semantic_key"),
    )
    op.create_table(
        "document_point_dependencies",
        _id("dependency_id"),
        _point(),
        sa.Column("chapter_ref", sa.String(255), nullable=False),
        sa.Column("applied_version", sa.Integer(), nullable=False),
        sa.UniqueConstraint("point_id", "chapter_ref"),
    )
    op.create_table(
        "document_update_jobs",
        _id("job_id"),
        _run(),
        sa.Column("workspace_revision", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        _json("payload"),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("lease_token", sa.UUID()),
        sa.Column("lease_until", sa.DateTime(timezone=True)),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("error_code", sa.String(64)),
    )
    op.create_index(
        "ix_document_update_jobs_claim",
        "document_update_jobs",
        ["status", "available_at"],
    )
    op.create_table(
        "document_exports",
        _id("export_id"),
        _run(),
        sa.Column("workspace_revision", sa.Integer(), nullable=False),
        sa.Column("mode", sa.String(16), nullable=False),
        _json("caveats"),
        sa.Column("body_markdown", sa.Text(), nullable=False),
        _json("chapter_revisions"),
    )
    op.create_table(
        "document_source_readings",
        _id("reading_id"),
        _point(),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.UniqueConstraint("point_id", "fingerprint"),
    )


def downgrade() -> None:
    """Remove only the new semantic workspace storage."""
    for table in (
        "document_source_readings",
        "document_exports",
        "document_update_jobs",
        "document_point_dependencies",
        "document_needs",
        "document_operations",
        "document_point_revisions",
        "document_point_candidates",
        "document_points",
        "document_setup_snapshots",
        "document_workspaces",
    ):
        op.drop_table(table)
