"""Create the managed CNB reference and document-workspace schema.

Revision ID: 20260803_120000
Revises: None
Create Date: 2026-08-03 12:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260803_120000"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create all currently planned CNB tables and access indexes."""
    # Reference data is self-contained inside the managed CNB database.
    op.create_table(
        "funders",
        sa.Column("funder_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("funder_type", sa.String(length=100), nullable=True),
        sa.Column("country", sa.String(length=100), nullable=True),
        sa.Column("region", sa.String(length=255), nullable=True),
        sa.Column(
            "profile",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.PrimaryKeyConstraint("funder_id", name="pk_funders"),
    )
    op.create_table(
        "funding_opportunities",
        sa.Column(
            "funding_opportunity_id", postgresql.UUID(as_uuid=True), nullable=False
        ),
        sa.Column("source_run_id", sa.String(length=255), nullable=False),
        sa.Column("source_record_ref", sa.String(length=255), nullable=False),
        sa.Column("funder_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("applicant_type", sa.String(length=255), nullable=True),
        sa.Column("category", sa.String(length=255), nullable=True),
        sa.Column("sector", sa.String(length=255), nullable=True),
        sa.Column(
            "hazards",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "interventions",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("finance_route", sa.String(length=255), nullable=True),
        sa.Column("instrument_type", sa.String(length=255), nullable=True),
        sa.Column("region_scope", sa.String(length=255), nullable=True),
        sa.Column("min_award", sa.Numeric(precision=18, scale=2), nullable=True),
        sa.Column("max_award", sa.Numeric(precision=18, scale=2), nullable=True),
        sa.Column("currency", sa.String(length=16), nullable=True),
        sa.Column("status", sa.String(length=64), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column(
            "known_gaps",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.ForeignKeyConstraint(
            ["funder_id"],
            ["funders.funder_id"],
            name="fk_funding_opportunities_funder_id_funders",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint(
            "funding_opportunity_id", name="pk_funding_opportunities"
        ),
        sa.UniqueConstraint(
            "source_run_id",
            "source_record_ref",
            name="uq_funding_opportunities_source_identity",
        ),
    )
    op.create_index(
        "ix_funding_opportunities_funder_name",
        "funding_opportunities",
        ["funder_id", "name"],
    )
    op.create_table(
        "funded_projects",
        sa.Column("funded_project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_run_id", sa.String(length=255), nullable=False),
        sa.Column("source_record_ref", sa.String(length=255), nullable=False),
        sa.Column("funder_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("applicant_name", sa.String(length=255), nullable=True),
        sa.Column("applicant_type", sa.String(length=255), nullable=True),
        sa.Column("city", sa.String(length=255), nullable=True),
        sa.Column("state_region", sa.String(length=255), nullable=True),
        sa.Column("country", sa.String(length=100), nullable=True),
        sa.Column("category", sa.String(length=255), nullable=True),
        sa.Column("sector", sa.String(length=255), nullable=True),
        sa.Column(
            "hazards",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "interventions",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("finance_route", sa.String(length=255), nullable=True),
        sa.Column("instrument_type", sa.String(length=255), nullable=True),
        sa.Column("region_scope", sa.String(length=255), nullable=True),
        sa.Column("award_amount", sa.Numeric(precision=18, scale=2), nullable=True),
        sa.Column("currency", sa.String(length=16), nullable=True),
        sa.Column("award_year", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=64), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column(
            "project_tags",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "known_gaps",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.ForeignKeyConstraint(
            ["funder_id"],
            ["funders.funder_id"],
            name="fk_funded_projects_funder_id_funders",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("funded_project_id", name="pk_funded_projects"),
        sa.UniqueConstraint(
            "source_run_id",
            "source_record_ref",
            name="uq_funded_projects_source_identity",
        ),
    )
    op.create_index(
        "ix_funded_projects_funder_name",
        "funded_projects",
        ["funder_id", "name"],
    )
    op.create_table(
        "source_documents",
        sa.Column("source_document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_type", sa.String(length=64), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("license_status", sa.String(length=64), nullable=True),
        sa.Column("content_hash", sa.String(length=128), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("source_document_id", name="pk_source_documents"),
        sa.UniqueConstraint(
            "content_hash",
            "url",
            name="uq_source_documents_content_hash_url",
        ),
    )
    op.create_table(
        "funder_templates",
        sa.Column("template_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "funding_opportunity_id", postgresql.UUID(as_uuid=True), nullable=False
        ),
        sa.Column("template_name", sa.String(length=255), nullable=False),
        sa.Column("output_format", sa.String(length=64), nullable=True),
        sa.Column(
            "chapter_schema",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "required_fields",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.ForeignKeyConstraint(
            ["funding_opportunity_id"],
            ["funding_opportunities.funding_opportunity_id"],
            name="fk_funder_templates_opportunity_id_opportunities",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("template_id", name="pk_funder_templates"),
        sa.UniqueConstraint(
            "funding_opportunity_id",
            "template_name",
            name="uq_funder_templates_opportunity_name",
        ),
    )
    op.create_table(
        "funder_criteria",
        sa.Column("criterion_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "funding_opportunity_id", postgresql.UUID(as_uuid=True), nullable=False
        ),
        sa.Column("source_document_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("criterion_type", sa.String(length=100), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("requirement_text", sa.Text(), nullable=False),
        sa.Column("weight", sa.Numeric(precision=8, scale=4), nullable=True),
        sa.Column("hard_gate", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "normalized_rule",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["funding_opportunity_id"],
            ["funding_opportunities.funding_opportunity_id"],
            name="fk_funder_criteria_opportunity_id_opportunities",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_document_id"],
            ["source_documents.source_document_id"],
            name="fk_funder_criteria_source_document_id_source_documents",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("criterion_id", name="pk_funder_criteria"),
    )
    op.create_table(
        "funding_evidence",
        sa.Column("evidence_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "funding_opportunity_id", postgresql.UUID(as_uuid=True), nullable=True
        ),
        sa.Column("funded_project_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source_document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("claim", sa.Text(), nullable=False),
        sa.Column("quote_or_summary", sa.Text(), nullable=False),
        sa.Column(
            "source_map",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.CheckConstraint(
            "(funding_opportunity_id IS NOT NULL AND funded_project_id IS NULL) OR "
            "(funding_opportunity_id IS NULL AND funded_project_id IS NOT NULL)",
            name=op.f("ck_funding_evidence_exactly_one_parent"),
        ),
        sa.ForeignKeyConstraint(
            ["funded_project_id"],
            ["funded_projects.funded_project_id"],
            name="fk_funding_evidence_project_id_funded_projects",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["funding_opportunity_id"],
            ["funding_opportunities.funding_opportunity_id"],
            name="fk_funding_evidence_opportunity_id_opportunities",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_document_id"],
            ["source_documents.source_document_id"],
            name="fk_funding_evidence_source_id_source_documents",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("evidence_id", name="pk_funding_evidence"),
    )

    # Workspace rows use run_id as an external identifier into CA_DATABASE_URL.
    op.create_table(
        "concept_note_chapters",
        sa.Column("chapter_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("template_section_id", sa.String(length=255), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=64),
            nullable=False,
            server_default="empty",
        ),
        sa.Column("required", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "user_locked", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "position >= 0",
            name=op.f("ck_concept_note_chapters_position_nonnegative"),
        ),
        sa.CheckConstraint(
            "status IN ('empty', 'draft', 'needs_review', 'ready', 'deleted')",
            name=op.f("ck_concept_note_chapters_status_valid"),
        ),
        sa.PrimaryKeyConstraint("chapter_id", name="pk_concept_note_chapters"),
    )
    op.create_index(
        "uq_concept_note_chapters_active_position",
        "concept_note_chapters",
        ["run_id", "position"],
        unique=True,
        postgresql_where=sa.text("status <> 'deleted'"),
    )
    op.create_index(
        "ix_concept_note_chapters_run_status",
        "concept_note_chapters",
        ["run_id", "status"],
    )
    op.create_table(
        "concept_note_chapter_revisions",
        sa.Column("revision_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chapter_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("revision_number", sa.Integer(), nullable=False),
        sa.Column("author_type", sa.String(length=32), nullable=False),
        sa.Column("change_type", sa.String(length=64), nullable=False),
        sa.Column("body_markdown", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "patch_summary",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "revision_number > 0",
            name=op.f(
                "ck_concept_note_chapter_revisions_revision_number_positive"
            ),
        ),
        sa.CheckConstraint(
            "author_type IN ('agent', 'user', 'system')",
            name=op.f("ck_concept_note_chapter_revisions_author_type_valid"),
        ),
        sa.CheckConstraint(
            "change_type IN ('draft', 'edit_text', 'add_chapter', "
            "'delete_chapter', 'restore_chapter', 'rewrite')",
            name=op.f("ck_concept_note_chapter_revisions_change_type_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["chapter_id"],
            ["concept_note_chapters.chapter_id"],
            name="fk_concept_note_chapter_revisions_chapter_id_chapters",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "revision_id", name="pk_concept_note_chapter_revisions"
        ),
        sa.UniqueConstraint(
            "chapter_id",
            "revision_number",
            name="uq_concept_note_chapter_revisions_number",
        ),
    )
    op.create_table(
        "concept_note_evidence_links",
        sa.Column("evidence_link_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chapter_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("selected_source_label", sa.String(length=255), nullable=False),
        sa.Column("source_location", sa.Text(), nullable=True),
        sa.Column("claim_ref", sa.String(length=255), nullable=True),
        sa.Column("quote_or_summary", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["chapter_id"],
            ["concept_note_chapters.chapter_id"],
            name="fk_concept_note_evidence_links_chapter_id_chapters",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "evidence_link_id", name="pk_concept_note_evidence_links"
        ),
    )
    op.create_index(
        "ix_concept_note_evidence_links_chapter",
        "concept_note_evidence_links",
        ["chapter_id"],
    )
    op.create_table(
        "concept_note_gaps",
        sa.Column("gap_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chapter_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("field_key", sa.String(length=255), nullable=True),
        sa.Column("severity", sa.String(length=64), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column(
            "status", sa.String(length=64), nullable=False, server_default="open"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["chapter_id"],
            ["concept_note_chapters.chapter_id"],
            name="fk_concept_note_gaps_chapter_id_chapters",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("gap_id", name="pk_concept_note_gaps"),
    )
    op.create_index(
        "ix_concept_note_gaps_run_status",
        "concept_note_gaps",
        ["run_id", "status"],
    )
    op.create_index("ix_concept_note_gaps_chapter", "concept_note_gaps", ["chapter_id"])
    op.create_table(
        "concept_note_matched_projects",
        sa.Column("match_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("funded_project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("decision", sa.String(length=64), nullable=False),
        sa.Column("fit_rationale", sa.Text(), nullable=False),
        sa.Column(
            "matched_tags",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "evidence",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "caveats",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.ForeignKeyConstraint(
            ["funded_project_id"],
            ["funded_projects.funded_project_id"],
            name="fk_concept_note_matched_projects_project_id_funded_projects",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("match_id", name="pk_concept_note_matched_projects"),
        sa.UniqueConstraint(
            "run_id",
            "funded_project_id",
            name="uq_concept_note_matched_projects_run_project",
        ),
    )
    op.create_index(
        "ix_concept_note_matched_projects_run_decision",
        "concept_note_matched_projects",
        ["run_id", "decision"],
    )
    op.create_table(
        "concept_note_exports",
        sa.Column("export_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("file_type", sa.String(length=32), nullable=False),
        sa.Column("file_ref", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("export_id", name="pk_concept_note_exports"),
    )
    op.create_index(
        "ix_concept_note_exports_run_status",
        "concept_note_exports",
        ["run_id", "status"],
    )


def downgrade() -> None:
    """Remove the managed CNB schema in reverse dependency order."""
    op.drop_table("concept_note_exports")
    op.drop_table("concept_note_matched_projects")
    op.drop_table("concept_note_gaps")
    op.drop_table("concept_note_evidence_links")
    op.drop_table("concept_note_chapter_revisions")
    op.drop_table("concept_note_chapters")
    op.drop_table("funding_evidence")
    op.drop_table("funder_criteria")
    op.drop_table("funder_templates")
    op.drop_table("source_documents")
    op.drop_table("funded_projects")
    op.drop_table("funding_opportunities")
    op.drop_table("funders")
