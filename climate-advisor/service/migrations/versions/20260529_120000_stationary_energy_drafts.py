"""Add stationary energy draft persistence

Revision ID: 20260529_120000
Revises: 20251003_003723
Create Date: 2026-05-29 12:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "20260529_120000"
down_revision = "20251003_003723"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create Stationary Energy draft run, candidate, proposal, and review tables."""

    op.create_table(
        "stationary_energy_draft_runs",
        sa.Column("draft_run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("thread_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column("city_id", sa.String(length=255), nullable=False),
        sa.Column("inventory_id", sa.String(length=255), nullable=False),
        sa.Column("sector_code", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=64), nullable=False),
        sa.Column("workflow_step", sa.String(length=64), nullable=True),
        sa.Column("context_summary", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("permission_summary", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("trace_id", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["thread_id"], ["threads.thread_id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("draft_run_id"),
    )
    op.create_index(
        "ix_stationary_energy_draft_runs_user_resume",
        "stationary_energy_draft_runs",
        ["user_id", "city_id", "inventory_id", "sector_code"],
    )
    op.create_index(
        "ix_stationary_energy_draft_runs_user_status",
        "stationary_energy_draft_runs",
        ["user_id", "status"],
    )
    op.create_index(
        "ix_stationary_energy_draft_runs_thread_id",
        "stationary_energy_draft_runs",
        ["thread_id"],
    )

    op.create_table(
        "stationary_energy_draft_source_candidates",
        sa.Column("candidate_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("draft_run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("datasource_id", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("publisher_name", sa.String(length=255), nullable=True),
        sa.Column("retrieval_method", sa.String(length=255), nullable=True),
        sa.Column("dataset_name", sa.String(length=255), nullable=True),
        sa.Column("dataset_year", sa.Integer(), nullable=True),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("geography_match", sa.String(length=64), nullable=False),
        sa.Column("source_scope", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("source_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "normalized_rows",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("applicability_status", sa.String(length=32), nullable=False),
        sa.Column(
            "applicability_issues",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("quality_score", sa.Numeric(), nullable=True),
        sa.Column("confidence_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["draft_run_id"],
            ["stationary_energy_draft_runs.draft_run_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("candidate_id"),
    )
    op.create_index(
        "ix_stationary_energy_source_candidates_run",
        "stationary_energy_draft_source_candidates",
        ["draft_run_id"],
    )
    op.create_index(
        "ix_stationary_energy_source_candidates_run_datasource",
        "stationary_energy_draft_source_candidates",
        ["draft_run_id", "datasource_id"],
    )
    op.create_index(
        "ix_stationary_energy_source_candidates_run_status",
        "stationary_energy_draft_source_candidates",
        ["draft_run_id", "applicability_status"],
    )

    op.create_table(
        "stationary_energy_draft_proposals",
        sa.Column("proposal_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("draft_run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "target_ref",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("current_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("recommended_candidate_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("recommended_datasource_id", sa.String(length=255), nullable=True),
        sa.Column(
            "alternative_candidate_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("proposed_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("confidence_score", sa.Numeric(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["draft_run_id"],
            ["stationary_energy_draft_runs.draft_run_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("proposal_id"),
    )
    op.create_index(
        "ix_stationary_energy_draft_proposals_run",
        "stationary_energy_draft_proposals",
        ["draft_run_id"],
    )
    op.create_index(
        "ix_stationary_energy_draft_proposals_run_status",
        "stationary_energy_draft_proposals",
        ["draft_run_id", "status"],
    )
    op.create_index(
        "ix_stationary_energy_draft_proposals_run_candidate",
        "stationary_energy_draft_proposals",
        ["draft_run_id", "recommended_candidate_id"],
    )

    op.create_table(
        "stationary_energy_review_decisions",
        sa.Column("decision_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("draft_run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("proposal_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("decision_version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("selected_source_id", sa.String(length=255), nullable=True),
        sa.Column("selected_candidate_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("manual_value", sa.Numeric(), nullable=True),
        sa.Column("manual_unit", sa.String(length=64), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("commit_status", sa.String(length=32), nullable=False),
        sa.Column("commit_response", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["draft_run_id"],
            ["stationary_energy_draft_runs.draft_run_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["proposal_id"],
            ["stationary_energy_draft_proposals.proposal_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("decision_id"),
        sa.UniqueConstraint(
            "draft_run_id",
            "proposal_id",
            "decision_version",
            name="uq_stationary_energy_review_decisions_run_proposal_version",
        ),
    )
    op.create_index(
        "ix_stationary_energy_review_decisions_run_user",
        "stationary_energy_review_decisions",
        ["draft_run_id", "user_id"],
    )
    op.create_index(
        "ix_stationary_energy_review_decisions_proposal",
        "stationary_energy_review_decisions",
        ["proposal_id"],
    )
    op.create_index(
        "ix_stationary_energy_review_decisions_run_proposal",
        "stationary_energy_review_decisions",
        ["draft_run_id", "proposal_id"],
    )


def downgrade() -> None:
    """Drop Stationary Energy draft persistence tables and indexes."""

    op.drop_index(
        "ix_stationary_energy_review_decisions_run_proposal",
        table_name="stationary_energy_review_decisions",
    )
    op.drop_index(
        "ix_stationary_energy_review_decisions_proposal",
        table_name="stationary_energy_review_decisions",
    )
    op.drop_index(
        "ix_stationary_energy_review_decisions_run_user",
        table_name="stationary_energy_review_decisions",
    )
    op.drop_table("stationary_energy_review_decisions")

    op.drop_index(
        "ix_stationary_energy_draft_proposals_run_candidate",
        table_name="stationary_energy_draft_proposals",
    )
    op.drop_index(
        "ix_stationary_energy_draft_proposals_run_status",
        table_name="stationary_energy_draft_proposals",
    )
    op.drop_index(
        "ix_stationary_energy_draft_proposals_run",
        table_name="stationary_energy_draft_proposals",
    )
    op.drop_table("stationary_energy_draft_proposals")

    op.drop_index(
        "ix_stationary_energy_source_candidates_run_status",
        table_name="stationary_energy_draft_source_candidates",
    )
    op.drop_index(
        "ix_stationary_energy_source_candidates_run_datasource",
        table_name="stationary_energy_draft_source_candidates",
    )
    op.drop_index(
        "ix_stationary_energy_source_candidates_run",
        table_name="stationary_energy_draft_source_candidates",
    )
    op.drop_table("stationary_energy_draft_source_candidates")

    op.drop_index(
        "ix_stationary_energy_draft_runs_thread_id",
        table_name="stationary_energy_draft_runs",
    )
    op.drop_index(
        "ix_stationary_energy_draft_runs_user_status",
        table_name="stationary_energy_draft_runs",
    )
    op.drop_index(
        "ix_stationary_energy_draft_runs_user_resume",
        table_name="stationary_energy_draft_runs",
    )
    op.drop_table("stationary_energy_draft_runs")
