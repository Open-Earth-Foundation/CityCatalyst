from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.db.types import JSONBCompat


class ConceptNoteRun(Base):
    """Persisted Concept Note Builder workflow run owned by Climate Advisor."""

    __tablename__ = "concept_note_runs"

    run_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    thread_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        nullable=True,
        comment="CityCatalyst-owned external thread identifier; no local foreign key",
    )
    user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    city_id: Mapped[str] = mapped_column(String(255), nullable=False)
    project_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    funder_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        nullable=True,
        comment="External funder identifier validated against managed CNB reference data",
    )
    selected_funding_opportunity_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        nullable=True,
        comment="External funding-opportunity identifier validated against managed CNB reference data",
    )
    status: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default="active",
        server_default="active",
    )
    lifecycle_state: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="active",
        server_default="active",
    )
    duplicated_from_run_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        nullable=True,
        comment="Source run provenance only; intentionally no cross-run foreign key",
    )
    workflow_step: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default="assembling_context",
        server_default="assembling_context",
    )
    context_summary: Mapped[dict[str, Any]] = mapped_column(
        JSONBCompat(),
        nullable=False,
        default=dict,
    )
    permission_summary: Mapped[dict[str, Any]] = mapped_column(
        JSONBCompat(),
        nullable=False,
        default=dict,
    )
    trace_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    idempotency_key: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        nullable=False,
    )
    request_fingerprint: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    context_bundle: Mapped["ConceptNoteContextBundle"] = relationship(
        "ConceptNoteContextBundle",
        back_populates="run",
        cascade="all, delete-orphan",
        passive_deletes=True,
        uselist=False,
    )
    uploads: Mapped[list["ConceptNoteUpload"]] = relationship(
        "ConceptNoteUpload",
        back_populates="run",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        CheckConstraint(
            "lifecycle_state IN ('active', 'copying', 'deleting')",
            name="ck_concept_note_runs_lifecycle_state",
        ),
        UniqueConstraint(
            "user_id",
            "idempotency_key",
            name="uq_concept_note_runs_user_idempotency",
        ),
        Index(
            "ix_concept_note_runs_user_city_updated",
            "user_id",
            "city_id",
            "updated_at",
        ),
        Index(
            "ix_concept_note_runs_user_city_lifecycle",
            "user_id",
            "city_id",
            "lifecycle_state",
        ),
    )


class ConceptNoteLifecycleOperation(Base):
    """Durable state for a cross-service duplicate or delete operation."""

    __tablename__ = "concept_note_lifecycle_operations"

    operation_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    city_id: Mapped[str] = mapped_column(String(255), nullable=False)
    source_run_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    destination_run_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        nullable=True,
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    idempotency_key: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        nullable=False,
    )
    phase: Mapped[str] = mapped_column(String(64), nullable=False)
    operation_data: Mapped[dict[str, Any]] = mapped_column(
        JSONBCompat(),
        nullable=False,
        default=dict,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint(
            "kind IN ('duplicate', 'delete')",
            name="ck_concept_note_lifecycle_operations_kind",
        ),
        UniqueConstraint(
            "user_id",
            "idempotency_key",
            name="uq_concept_note_lifecycle_user_idempotency",
        ),
        Index(
            "uq_concept_note_lifecycle_source_incomplete",
            "source_run_id",
            unique=True,
            postgresql_where=text("phase <> 'completed'"),
            sqlite_where=text("phase <> 'completed'"),
        ),
    )


class ConceptNoteContextBundle(Base):
    """One durable context bundle associated with a concept-note run."""

    __tablename__ = "concept_note_context_bundles"

    run_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("concept_note_runs.run_id", ondelete="CASCADE"),
        primary_key=True,
    )
    context_bundle: Mapped[dict[str, Any]] = mapped_column(
        JSONBCompat(),
        nullable=False,
        default=dict,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    run: Mapped[ConceptNoteRun] = relationship(
        "ConceptNoteRun",
        back_populates="context_bundle",
    )


class ConceptNoteUpload(Base):
    """Durable CNB upload metadata and CC-owned Markdown pointer."""

    __tablename__ = "concept_note_uploads"

    upload_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
    )
    run_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("concept_note_runs.run_id", ondelete="CASCADE"),
        nullable=False,
    )
    uploaded_by_user_id: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    source_label: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    markdown_s3_key: Mapped[str | None] = mapped_column(
        String(1024),
        nullable=True,
    )
    markdown_sha256: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ingest_status: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default="queued",
        server_default="queued",
    )
    ingest_error_code: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )
    ingest_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    ingest_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    run: Mapped[ConceptNoteRun] = relationship(
        "ConceptNoteRun",
        back_populates="uploads",
    )

    __table_args__ = (
        CheckConstraint(
            "page_count > 0",
            name="ck_concept_note_uploads_positive_page_count",
        ),
        Index(
            "ix_concept_note_uploads_run_status_received",
            "run_id",
            "ingest_status",
            "received_at",
        ),
        Index(
            "ix_concept_note_uploads_user_received",
            "uploaded_by_user_id",
            "received_at",
        ),
    )
