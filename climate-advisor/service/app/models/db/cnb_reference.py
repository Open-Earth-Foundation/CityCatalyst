"""SQLAlchemy models for curated CNB funding-reference data."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from app.db.cnb import CnbBase
from app.models.db.types import JSONBCompat
from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    false,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column


class CnbFunder(CnbBase):
    """Canonical funder profile shared across CNB runs."""

    __tablename__ = "funders"

    funder_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    funder_type: Mapped[str | None] = mapped_column(String(100))
    country: Mapped[str | None] = mapped_column(String(100))
    region: Mapped[str | None] = mapped_column(String(255))
    profile: Mapped[dict[str, Any]] = mapped_column(
        JSONBCompat(), nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )


class CnbFundingRecord(CnbBase):
    """One funding opportunity or one complete funded-project example."""

    __tablename__ = "funding_records"

    funding_record_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    source_run_id: Mapped[str] = mapped_column(String(255), nullable=False)
    source_record_ref: Mapped[str] = mapped_column(String(255), nullable=False)
    funder_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("funders.funder_id", ondelete="RESTRICT"),
        nullable=False,
    )
    is_opportunity: Mapped[bool] = mapped_column(Boolean, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    applicant_name: Mapped[str | None] = mapped_column(String(255))
    applicant_type: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(255))
    state_region: Mapped[str | None] = mapped_column(String(255))
    country: Mapped[str | None] = mapped_column(String(100))
    category: Mapped[str | None] = mapped_column(String(255))
    sector: Mapped[str | None] = mapped_column(String(255))
    hazards: Mapped[list[str]] = mapped_column(
        JSONBCompat(), nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    interventions: Mapped[list[str]] = mapped_column(
        JSONBCompat(), nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    finance_route: Mapped[str | None] = mapped_column(String(255))
    instrument_type: Mapped[str | None] = mapped_column(String(255))
    region_scope: Mapped[str | None] = mapped_column(String(255))
    min_award: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    max_award: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    award_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    currency: Mapped[str | None] = mapped_column(String(16))
    award_year: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str | None] = mapped_column(String(64))
    summary: Mapped[str | None] = mapped_column(Text)
    project_tags: Mapped[list[str]] = mapped_column(
        JSONBCompat(), nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    known_gaps: Mapped[list[str]] = mapped_column(
        JSONBCompat(), nullable=False, default=list, server_default=text("'[]'::jsonb")
    )

    __table_args__ = (
        UniqueConstraint(
            "source_run_id",
            "source_record_ref",
            name="uq_funding_records_source_identity",
        ),
        Index(
            "ix_funding_records_funder_opportunity_name",
            "funder_id",
            "is_opportunity",
            "name",
        ),
    )


class CnbSourceDocument(CnbBase):
    """Immutable provenance record for reviewed funding evidence."""

    __tablename__ = "source_documents"

    source_document_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    source_type: Mapped[str] = mapped_column(String(64), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str | None] = mapped_column(Text)
    license_status: Mapped[str | None] = mapped_column(String(64))
    content_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "content_hash", "url", name="uq_source_documents_content_hash_url"
        ),
    )


class CnbFunderTemplate(CnbBase):
    """Application template associated with an opportunity record."""

    __tablename__ = "funder_templates"

    template_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    funding_record_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("funding_records.funding_record_id", ondelete="CASCADE"),
        nullable=False,
    )
    template_name: Mapped[str] = mapped_column(String(255), nullable=False)
    output_format: Mapped[str | None] = mapped_column(String(64))
    chapter_schema: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONBCompat(), nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    required_fields: Mapped[list[str]] = mapped_column(
        JSONBCompat(), nullable=False, default=list, server_default=text("'[]'::jsonb")
    )

    __table_args__ = (
        UniqueConstraint(
            "funding_record_id",
            "template_name",
            name="uq_funder_templates_record_name",
        ),
    )


class CnbFunderCriterion(CnbBase):
    """One reviewed requirement associated with an opportunity record."""

    __tablename__ = "funder_criteria"

    criterion_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    funding_record_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("funding_records.funding_record_id", ondelete="CASCADE"),
        nullable=False,
    )
    source_document_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("source_documents.source_document_id", ondelete="RESTRICT"),
    )
    criterion_type: Mapped[str] = mapped_column(String(100), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    requirement_text: Mapped[str] = mapped_column(Text, nullable=False)
    weight: Mapped[Decimal | None] = mapped_column(Numeric(8, 4))
    hard_gate: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    normalized_rule: Mapped[dict[str, Any] | list[Any] | str | None] = mapped_column(
        JSONBCompat()
    )


class CnbFundingRecordEvidence(CnbBase):
    """Source-grounded evidence retained for one funding record."""

    __tablename__ = "funding_record_evidence"

    evidence_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    funding_record_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("funding_records.funding_record_id", ondelete="CASCADE"),
        nullable=False,
    )
    source_document_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("source_documents.source_document_id", ondelete="RESTRICT"),
        nullable=False,
    )
    claim: Mapped[str] = mapped_column(Text, nullable=False)
    quote_or_summary: Mapped[str] = mapped_column(Text, nullable=False)
    source_map: Mapped[dict[str, Any]] = mapped_column(
        JSONBCompat(), nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
