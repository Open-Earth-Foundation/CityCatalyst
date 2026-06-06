from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, List, Optional
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.db.types import JSONBCompat


class StationaryEnergyDraftRun(Base):
    __tablename__ = "stationary_energy_draft_runs"

    draft_run_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    thread_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("threads.thread_id", ondelete="SET NULL"),
        nullable=True,
    )
    user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    city_id: Mapped[str] = mapped_column(String(255), nullable=False)
    inventory_id: Mapped[str] = mapped_column(String(255), nullable=False)
    sector_code: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default="stationary_energy",
    )
    status: Mapped[str] = mapped_column(String(64), nullable=False)
    workflow_step: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    context_summary: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSONBCompat(),
        nullable=True,
    )
    permission_summary: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSONBCompat(),
        nullable=True,
    )
    trace_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
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

    source_candidates: Mapped[List["StationaryEnergyDraftSourceCandidate"]] = (
        relationship(
            "StationaryEnergyDraftSourceCandidate",
            back_populates="draft_run",
            cascade="all, delete-orphan",
            passive_deletes=True,
        )
    )
    proposals: Mapped[List["StationaryEnergyDraftProposal"]] = relationship(
        "StationaryEnergyDraftProposal",
        back_populates="draft_run",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    review_decisions: Mapped[List["StationaryEnergyReviewDecision"]] = relationship(
        "StationaryEnergyReviewDecision",
        back_populates="draft_run",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        Index("ix_stationary_energy_draft_runs_user_resume", "user_id", "city_id", "inventory_id", "sector_code"),
        Index("ix_stationary_energy_draft_runs_user_status", "user_id", "status"),
        Index("ix_stationary_energy_draft_runs_thread_id", "thread_id"),
    )


class StationaryEnergyDraftSourceCandidate(Base):
    __tablename__ = "stationary_energy_draft_source_candidates"

    candidate_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    draft_run_id: Mapped[UUID] = mapped_column(
        ForeignKey("stationary_energy_draft_runs.draft_run_id", ondelete="CASCADE"),
        nullable=False,
    )
    datasource_id: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    publisher_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    retrieval_method: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    dataset_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    dataset_year: Mapped[Optional[int]] = mapped_column(nullable=True)
    url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    geography_match: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default="unknown",
    )
    source_scope: Mapped[dict[str, Any]] = mapped_column(
        JSONBCompat(),
        nullable=False,
        default=dict,
    )
    source_data: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSONBCompat(),
        nullable=True,
    )
    normalized_rows: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONBCompat(),
        nullable=False,
        default=list,
    )
    applicability_status: Mapped[str] = mapped_column(String(32), nullable=False)
    applicability_issues: Mapped[list[str]] = mapped_column(
        JSONBCompat(),
        nullable=False,
        default=list,
    )
    failure_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    quality_score: Mapped[Optional[Decimal]] = mapped_column(Numeric(), nullable=True)
    confidence_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
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

    draft_run: Mapped[StationaryEnergyDraftRun] = relationship(
        "StationaryEnergyDraftRun",
        back_populates="source_candidates",
    )

    __table_args__ = (
        Index("ix_stationary_energy_source_candidates_run", "draft_run_id"),
        Index("ix_stationary_energy_source_candidates_run_datasource", "draft_run_id", "datasource_id"),
        Index("ix_stationary_energy_source_candidates_run_status", "draft_run_id", "applicability_status"),
    )


class StationaryEnergyDraftProposal(Base):
    __tablename__ = "stationary_energy_draft_proposals"

    proposal_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    draft_run_id: Mapped[UUID] = mapped_column(
        ForeignKey("stationary_energy_draft_runs.draft_run_id", ondelete="CASCADE"),
        nullable=False,
    )
    target_ref: Mapped[dict[str, Any]] = mapped_column(
        JSONBCompat(),
        nullable=False,
        default=dict,
    )
    current_value: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSONBCompat(),
        nullable=True,
    )
    recommended_candidate_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        nullable=True,
    )
    recommended_datasource_id: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    alternative_candidate_ids: Mapped[list[str]] = mapped_column(
        JSONBCompat(),
        nullable=False,
        default=list,
    )
    proposed_value: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSONBCompat(),
        nullable=True,
    )
    rationale: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    confidence_score: Mapped[Optional[Decimal]] = mapped_column(Numeric(), nullable=True)
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

    draft_run: Mapped[StationaryEnergyDraftRun] = relationship(
        "StationaryEnergyDraftRun",
        back_populates="proposals",
    )
    review_decisions: Mapped[List["StationaryEnergyReviewDecision"]] = relationship(
        "StationaryEnergyReviewDecision",
        back_populates="proposal",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        Index("ix_stationary_energy_draft_proposals_run", "draft_run_id"),
        Index("ix_stationary_energy_draft_proposals_run_status", "draft_run_id", "status"),
        Index("ix_stationary_energy_draft_proposals_run_candidate", "draft_run_id", "recommended_candidate_id"),
    )


class StationaryEnergyReviewDecision(Base):
    __tablename__ = "stationary_energy_review_decisions"

    decision_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )
    draft_run_id: Mapped[UUID] = mapped_column(
        ForeignKey("stationary_energy_draft_runs.draft_run_id", ondelete="CASCADE"),
        nullable=False,
    )
    proposal_id: Mapped[UUID] = mapped_column(
        ForeignKey("stationary_energy_draft_proposals.proposal_id", ondelete="CASCADE"),
        nullable=False,
    )
    decision_version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
    )
    user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    selected_source_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    selected_candidate_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        nullable=True,
    )
    manual_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(), nullable=True)
    manual_unit: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    commit_status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="not_applicable",
    )
    commit_response: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSONBCompat(),
        nullable=True,
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

    draft_run: Mapped[StationaryEnergyDraftRun] = relationship(
        "StationaryEnergyDraftRun",
        back_populates="review_decisions",
    )
    proposal: Mapped[StationaryEnergyDraftProposal] = relationship(
        "StationaryEnergyDraftProposal",
        back_populates="review_decisions",
    )

    __table_args__ = (
        UniqueConstraint(
            "draft_run_id",
            "proposal_id",
            "decision_version",
            name="uq_stationary_energy_review_decisions_run_proposal_version",
        ),
        Index("ix_stationary_energy_review_decisions_run_user", "draft_run_id", "user_id"),
        Index("ix_stationary_energy_review_decisions_proposal", "proposal_id"),
        Index("ix_stationary_energy_review_decisions_run_proposal", "draft_run_id", "proposal_id"),
    )
