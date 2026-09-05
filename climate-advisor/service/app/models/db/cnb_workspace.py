"""SQLAlchemy models for the future CNB document workspace."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from app.db.cnb import CnbBase
from app.models.db.types import JSONBCompat
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    false,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column


class ConceptNoteChapter(CnbBase):
    """Chapter metadata for one CA-owned concept-note run."""

    __tablename__ = "concept_note_chapters"

    chapter_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    run_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    template_section_id: Mapped[str | None] = mapped_column(String(255))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(64), nullable=False, default="empty", server_default="empty"
    )
    required: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    user_locked: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    confirmed_revision_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(
            "concept_note_chapter_revisions.revision_id",
            name="fk_cnb_chapters_confirmed_revision",
            ondelete="SET NULL",
            use_alter=True,
        ),
    )
    regeneration_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="idle", server_default="idle"
    )
    regeneration_error: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint("position >= 0", name="position_nonnegative"),
        CheckConstraint(
            "status IN ('empty', 'draft', 'needs_review', 'ready', 'deleted')",
            name="status_valid",
        ),
        CheckConstraint(
            "regeneration_status IN ('idle', 'processing', 'failed')",
            name="regeneration_status_valid",
        ),
        Index(
            "uq_concept_note_chapters_active_position",
            "run_id",
            "position",
            unique=True,
            postgresql_where=text("status <> 'deleted'"),
        ),
        Index("ix_concept_note_chapters_run_status", "run_id", "status"),
    )


class ConceptNoteChapterRevision(CnbBase):
    """Immutable full-text revision for a concept-note chapter."""

    __tablename__ = "concept_note_chapter_revisions"

    revision_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    chapter_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("concept_note_chapters.chapter_id", ondelete="CASCADE"),
        nullable=False,
    )
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    author_type: Mapped[str] = mapped_column(String(32), nullable=False)
    change_type: Mapped[str] = mapped_column(String(64), nullable=False)
    body_markdown: Mapped[str] = mapped_column(
        Text, nullable=False, default="", server_default=""
    )
    patch_summary: Mapped[dict[str, Any]] = mapped_column(
        JSONBCompat(), nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "chapter_id",
            "revision_number",
            name="uq_concept_note_chapter_revisions_number",
        ),
        CheckConstraint("revision_number > 0", name="revision_number_positive"),
        CheckConstraint(
            "author_type IN ('agent', 'user', 'system')",
            name="author_type_valid",
        ),
        CheckConstraint(
            "change_type IN ('draft', 'edit_text', 'add_chapter', "
            "'delete_chapter', 'restore_chapter', 'rewrite')",
            name="change_type_valid",
        ),
    )


class ConceptNoteEvidenceLink(CnbBase):
    """Workspace citation from a chapter claim to selected run context."""

    __tablename__ = "concept_note_evidence_links"

    evidence_link_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    chapter_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("concept_note_chapters.chapter_id", ondelete="CASCADE"),
        nullable=False,
    )
    selected_source_label: Mapped[str] = mapped_column(String(255), nullable=False)
    source_location: Mapped[str | None] = mapped_column(Text)
    claim_ref: Mapped[str | None] = mapped_column(String(255))
    quote_or_summary: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (Index("ix_concept_note_evidence_links_chapter", "chapter_id"),)


class ConceptNoteGap(CnbBase):
    """Missing fact or required template field for a concept-note run."""

    __tablename__ = "concept_note_gaps"

    gap_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    run_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    chapter_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("concept_note_chapters.chapter_id", ondelete="SET NULL"),
    )
    field_key: Mapped[str] = mapped_column(String(255), nullable=False)
    severity: Mapped[str] = mapped_column(String(64), nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    why_asking: Mapped[str] = mapped_column(Text, nullable=False)
    suggestions: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONBCompat(), nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    source_refs: Mapped[list[str]] = mapped_column(
        JSONBCompat(), nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    status: Mapped[str] = mapped_column(
        String(64), nullable=False, default="open", server_default="open"
    )
    version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "severity IN ('critical', 'noncritical')",
            name="severity_valid",
        ),
        CheckConstraint(
            "status IN ('open', 'processing', 'resolved', 'dismissed', 'caveat')",
            name="status_valid",
        ),
        CheckConstraint("version > 0", name="version_positive"),
        Index("ix_concept_note_gaps_run_status", "run_id", "status"),
        Index("ix_concept_note_gaps_chapter", "chapter_id"),
    )


class ConceptNoteGapResolution(CnbBase):
    """Append-only user or evidence resolution event for a structured gap."""

    __tablename__ = "concept_note_gap_resolutions"

    resolution_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    gap_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("concept_note_gaps.gap_id", ondelete="CASCADE"),
        nullable=False,
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    answer: Mapped[str | None] = mapped_column(Text)
    actor_user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    source_refs: Mapped[list[str]] = mapped_column(
        JSONBCompat(), nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    idempotency_key: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "action IN ('answer', 'correction', 'not_a_gap', "
            "'defer_as_caveat', 'evidence_update')",
            name="action_valid",
        ),
        UniqueConstraint(
            "gap_id",
            "idempotency_key",
            name="uq_concept_note_gap_resolutions_idempotency",
        ),
        Index("ix_concept_note_gap_resolutions_gap", "gap_id", "created_at"),
    )


class ConceptNoteChapterReview(CnbBase):
    """Append-only confirmation of one exact immutable chapter revision."""

    __tablename__ = "concept_note_chapter_reviews"

    review_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    chapter_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("concept_note_chapters.chapter_id", ondelete="CASCADE"),
        nullable=False,
    )
    revision_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("concept_note_chapter_revisions.revision_id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    idempotency_key: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "chapter_id",
            "idempotency_key",
            name="uq_concept_note_chapter_reviews_idempotency",
        ),
        Index("ix_concept_note_chapter_reviews_chapter", "chapter_id", "created_at"),
    )


class ConceptNoteMatchedProject(CnbBase):
    """Selected reviewed project retained for one CA-owned run."""

    __tablename__ = "concept_note_matched_projects"

    match_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    run_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    funded_project_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("funded_projects.funded_project_id", ondelete="RESTRICT"),
        nullable=False,
    )
    decision: Mapped[str] = mapped_column(String(64), nullable=False)
    fit_rationale: Mapped[str] = mapped_column(Text, nullable=False)
    matched_tags: Mapped[list[str]] = mapped_column(
        JSONBCompat(), nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    evidence: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONBCompat(), nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    caveats: Mapped[list[str]] = mapped_column(
        JSONBCompat(), nullable=False, default=list, server_default=text("'[]'::jsonb")
    )

    __table_args__ = (
        UniqueConstraint(
            "run_id",
            "funded_project_id",
            name="uq_concept_note_matched_projects_run_project",
        ),
        Index("ix_concept_note_matched_projects_run_decision", "run_id", "decision"),
    )


class ConceptNoteExport(CnbBase):
    """Generated concept-note export reference and lifecycle state."""

    __tablename__ = "concept_note_exports"

    export_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    run_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    file_type: Mapped[str] = mapped_column(String(32), nullable=False)
    file_ref: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(64), nullable=False)

    __table_args__ = (Index("ix_concept_note_exports_run_status", "run_id", "status"),)
