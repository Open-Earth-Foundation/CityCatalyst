"""Canonical points and transactional outbox in the isolated CNB database."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.cnb import CnbBase
from app.models.db.types import JSONBCompat


class DocumentWorkspaceState(CnbBase):
    """Serialization lock and current setup pointer for one authorized CA run."""

    __tablename__ = "document_workspaces"
    run_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    setup_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    setup_fingerprint: Mapped[str | None] = mapped_column(String(64))
    draft_fingerprint: Mapped[str | None] = mapped_column(String(64))
    setup: Mapped[dict[str, Any] | None] = mapped_column(JSONBCompat())


class DocumentSetupSnapshot(CnbBase):
    """Append-only full template contract used to materialize requirements."""

    __tablename__ = "document_setup_snapshots"
    snapshot_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    run_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("document_workspaces.run_id"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSONBCompat(), nullable=False)
    __table_args__ = (UniqueConstraint("run_id", "version"),)


class DocumentPoint(CnbBase):
    """Stable semantic point identity with its current accepted value."""

    __tablename__ = "document_points"
    point_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    run_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("document_workspaces.run_id"), nullable=False
    )
    semantic_key: Mapped[str] = mapped_column(String(255), nullable=False)
    definition: Mapped[dict[str, Any]] = mapped_column(JSONBCompat(), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    accepted_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    disposition: Mapped[str] = mapped_column(
        String(32), nullable=False, default="missing"
    )
    value: Mapped[Any] = mapped_column(JSONBCompat(), nullable=True)
    task: Mapped[dict[str, Any] | None] = mapped_column(JSONBCompat())
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    __table_args__ = (UniqueConstraint("run_id", "semantic_key"),)


class DocumentCandidate(CnbBase):
    """Candidate values keep evidence and never overwrite an accepted answer."""

    __tablename__ = "document_point_candidates"
    candidate_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    point_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("document_points.point_id"), nullable=False
    )
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    value: Mapped[Any] = mapped_column(JSONBCompat(), nullable=False)
    citations: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONBCompat(), nullable=False
    )
    source_identity: Mapped[dict[str, Any]] = mapped_column(
        JSONBCompat(), nullable=False
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    __table_args__ = (UniqueConstraint("point_id", "fingerprint"),)


class DocumentPointRevision(CnbBase):
    """Append-only command/source/setup history, including actor and provenance."""

    __tablename__ = "document_point_revisions"
    revision_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    point_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("document_points.point_id"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    actor_user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    operation: Mapped[str] = mapped_column(String(64), nullable=False)
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSONBCompat(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    __table_args__ = (UniqueConstraint("point_id", "version"),)


class DocumentOperation(CnbBase):
    """Exact response journal: same key and payload replays even after new writes."""

    __tablename__ = "document_operations"
    operation_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    run_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("document_workspaces.run_id"), nullable=False
    )
    idempotency_key: Mapped[str] = mapped_column(String(200), nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    result: Mapped[dict[str, Any]] = mapped_column(JSONBCompat(), nullable=False)
    __table_args__ = (UniqueConstraint("run_id", "idempotency_key"),)


class DocumentNeed(CnbBase):
    """Evidence groups link run uploads and point keys without owning files."""

    __tablename__ = "document_needs"
    need_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    run_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("document_workspaces.run_id"), nullable=False
    )
    semantic_key: Mapped[str] = mapped_column(String(255), nullable=False)
    definition: Mapped[dict[str, Any]] = mapped_column(JSONBCompat(), nullable=False)
    documents: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONBCompat(), nullable=False, default=list
    )
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    __table_args__ = (UniqueConstraint("run_id", "semantic_key"),)


class DocumentDependency(CnbBase):
    """Conservative chapter dependency and last applied point version."""

    __tablename__ = "document_point_dependencies"
    dependency_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    point_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("document_points.point_id"), nullable=False
    )
    chapter_ref: Mapped[str] = mapped_column(String(255), nullable=False)
    applied_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    __table_args__ = (UniqueConstraint("point_id", "chapter_ref"),)


class DocumentUpdateJob(CnbBase):
    """Transactional durable outbox with leases and bounded retry state."""

    __tablename__ = "document_update_jobs"
    job_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    run_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("document_workspaces.run_id"), nullable=False
    )
    workspace_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    payload: Mapped[dict[str, Any]] = mapped_column(JSONBCompat(), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="queued")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lease_token: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    available_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=func.now()
    )
    error_code: Mapped[str | None] = mapped_column(String(64))
    __table_args__ = (Index("ix_document_update_jobs_claim", "status", "available_at"),)


class DocumentExport(CnbBase):
    """Immutable server-authorized export content and eligibility snapshot."""

    __tablename__ = "document_exports"
    export_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    run_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("document_workspaces.run_id"), nullable=False
    )
    workspace_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    mode: Mapped[str] = mapped_column(String(16), nullable=False)
    caveats: Mapped[list[str]] = mapped_column(JSONBCompat(), nullable=False)
    body_markdown: Mapped[str] = mapped_column(Text, nullable=False)
    chapter_revisions: Mapped[dict[str, str]] = mapped_column(
        JSONBCompat(), nullable=False, default=dict
    )


class DocumentSourceReading(CnbBase):
    """Successful source/requirement reads, including evidence with no answer."""

    __tablename__ = "document_source_readings"
    reading_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    point_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("document_points.point_id"), nullable=False
    )
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    __table_args__ = (UniqueConstraint("point_id", "fingerprint"),)
