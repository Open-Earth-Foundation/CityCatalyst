"""Durable edit proposals in the managed CNB store, separate from draft revisions."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from app.db.cnb import CnbBase
from app.models.db.types import JSONBCompat
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column


class ConceptNoteEditProposal(CnbBase):
    """Owned proposal and immutable planning inputs with an explicit lifecycle."""

    __tablename__ = "concept_note_edit_proposals"

    proposal_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    run_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    actor_user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    idempotency_key: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    instruction: Mapped[str] = mapped_column(Text, nullable=False)
    scope: Mapped[dict[str, Any]] = mapped_column(JSONBCompat(), nullable=False)
    base_revisions: Mapped[dict[str, int]] = mapped_column(
        JSONBCompat(), nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    changes: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONBCompat(), nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="processing", server_default="processing"
    )
    clarification: Mapped[str | None] = mapped_column(Text)
    error_code: Mapped[str | None] = mapped_column(String(64))
    apply_key: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    apply_fingerprint: Mapped[str | None] = mapped_column(String(64))
    applied_result: Mapped[dict[str, Any] | None] = mapped_column(JSONBCompat())
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "run_id",
            "actor_user_id",
            "idempotency_key",
            name="uq_cnb_edit_proposals_idempotency",
        ),
        CheckConstraint(
            "status IN ('processing', 'clarification_required', 'proposed', 'applied', 'partially_applied', 'rejected', 'failed', 'stale')",
            name="status_valid",
        ),
        CheckConstraint(
            "length(trim(instruction)) > 0 AND length(instruction) <= 8000",
            name="instruction_bounded",
        ),
        Index(
            "ix_cnb_edit_proposals_run_actor_created",
            "run_id",
            "actor_user_id",
            "created_at",
        ),
    )


class ConceptNoteEditApplication(CnbBase):
    """Append-only edit/undo/restore batch with an ordered run-local history."""

    __tablename__ = "concept_note_edit_applications"

    application_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    run_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    actor_user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    proposal_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("concept_note_edit_proposals.proposal_id", ondelete="RESTRICT"),
    )
    restores_application_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(
            "concept_note_edit_applications.application_id", ondelete="RESTRICT"
        ),
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    operation: Mapped[str] = mapped_column(String(16), nullable=False)
    idempotency_key: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    before_revisions: Mapped[dict[str, int]] = mapped_column(
        JSONBCompat(), nullable=False
    )
    after_revisions: Mapped[dict[str, int]] = mapped_column(
        JSONBCompat(), nullable=False
    )
    accepted_change_ids: Mapped[list[str]] = mapped_column(
        JSONBCompat(), nullable=False, default=list
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "run_id",
            "actor_user_id",
            "idempotency_key",
            name="uq_cnb_edit_applications_idempotency",
        ),
        UniqueConstraint(
            "run_id", "sequence", name="uq_cnb_edit_applications_sequence"
        ),
        CheckConstraint("sequence > 0", name="sequence_positive"),
        CheckConstraint(
            "operation IN ('apply', 'undo', 'restore')", name="operation_valid"
        ),
        Index("ix_cnb_edit_applications_run_sequence", "run_id", "sequence"),
    )
