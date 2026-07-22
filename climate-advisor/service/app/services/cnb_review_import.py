"""Validate reviewed CNB research pairs and import funded-project references."""

from __future__ import annotations

from datetime import datetime
import logging
import re
from typing import Literal, Protocol
from uuid import UUID

from pydantic import Field, JsonValue, model_validator

from app.models.cnb_research import (
    FieldEvidence,
    FunderCriterionDraft,
    FunderDraft,
    FunderTemplateDraft,
    FundingOpportunityResearchBundle,
    FundingRecordDraft,
    ResearchModel,
    ReviewState,
    SourceDocumentDraft,
)
from app.services.cnb_project_tag_normalizer import normalize_project_tags

logger = logging.getLogger(__name__)
_PATH_TOKEN_PATTERN = re.compile(r"[^.\[\]]+|\[[^\]]*\]")


class ReviewFieldDecision(ResearchModel):
    """One reviewer decision retained for audit without controlling pairing."""

    target_path: str
    selected: bool
    original_value: JsonValue
    reviewed_value: JsonValue
    evidence_refs: list[str] = Field(default_factory=list)


class ReviewedReferenceData(ResearchModel):
    """Reference-table fields selected and edited in the static review page."""

    funder: FunderDraft
    funding_records: list[FundingRecordDraft]
    funder_templates: list[FunderTemplateDraft] = Field(default_factory=list)
    funder_criteria: list[FunderCriterionDraft] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_one_opportunity(self) -> "ReviewedReferenceData":
        """Keep reviewed funding-record identities aligned with schema 2.0."""
        record_refs = [record.funding_record_ref for record in self.funding_records]
        if len(set(record_refs)) != len(record_refs):
            raise ValueError("reviewed funding_record_ref values must be unique")
        opportunities = [
            record for record in self.funding_records if record.is_opportunity
        ]
        if len(opportunities) != 1:
            raise ValueError(
                "reviewed funding_records must contain exactly one opportunity"
            )
        return self


class ReviewedReferenceDataArtifact(ResearchModel):
    """Human-reviewed partner for one ``<run_id>.research.json`` artifact."""

    schema_version: Literal["2.0"]
    update_type: Literal["cnb_reference_data_review"]
    run_id: str
    saved_at: datetime
    review: ReviewState
    decisions: list[ReviewFieldDecision] = Field(default_factory=list)
    reviewed_reference_data: ReviewedReferenceData

    @model_validator(mode="after")
    def validate_unique_decision_paths(self) -> "ReviewedReferenceDataArtifact":
        """Keep each reviewed field decision unambiguous for evidence selection."""
        paths = [decision.target_path for decision in self.decisions]
        if len(set(paths)) != len(paths):
            raise ValueError("review decision target_path values must be unique")
        return self


class ReviewedProjectEvidence(ResearchModel):
    """One retained project claim joined to its immutable source metadata."""

    evidence: FieldEvidence
    source: SourceDocumentDraft


class ReviewedFundedProjectImport(ResearchModel):
    """One approved funded project ready for database-assigned UUID persistence."""

    record: FundingRecordDraft
    evidence: list[ReviewedProjectEvidence]


class ReviewedReferenceImport(ResearchModel):
    """Validated, normalized import payload for one paired research run."""

    run_id: str
    projects: list[ReviewedFundedProjectImport]


class ReviewedReferenceDataWriter(Protocol):
    """Write boundary for the datateam-managed CNB reference database."""

    def find_existing_funder_ids(self, funder_ids: set[UUID]) -> set[UUID]:
        """Return the requested IDs that exist in the canonical funder table."""

    def import_projects(self, payload: ReviewedReferenceImport) -> list[UUID]:
        """Atomically persist reviewed projects, sources, and evidence."""


def selected_funder_ids(review: ReviewedReferenceDataArtifact) -> set[UUID]:
    """Return all non-null reviewer selections on funded-project records."""
    return {
        record.selected_funder_id
        for record in review.reviewed_reference_data.funding_records
        if not record.is_opportunity and record.selected_funder_id is not None
    }


def _path_tokens(path: str) -> list[str]:
    """Normalize review target paths using the same rules as the static UI."""
    tokens: list[str] = []
    for part in _PATH_TOKEN_PATTERN.findall(path):
        value = part[1:-1] if part.startswith("[") else part
        stripped = value.strip()
        if stripped == "*":
            tokens.append(stripped)
            continue
        tokens.append(re.sub(r"[^a-z0-9]+", "_", stripped.casefold()))
    return tokens


def _paths_related(left: str, right: str) -> bool:
    """Return whether two field paths share a wildcard-aware prefix."""
    left_tokens = _path_tokens(left)
    right_tokens = _path_tokens(right)
    shared_length = min(len(left_tokens), len(right_tokens))
    if shared_length == 0:
        return False
    return all(
        left_token == "*"
        or right_token == "*"
        or left_token == right_token
        for left_token, right_token in zip(
            left_tokens[:shared_length],
            right_tokens[:shared_length],
            strict=True,
        )
    )


def prepare_reviewed_reference_import(
    *,
    research: FundingOpportunityResearchBundle,
    review: ReviewedReferenceDataArtifact,
    known_funder_ids: set[UUID],
) -> ReviewedReferenceImport:
    """Pair by run ID and validate approved, source-grounded funded projects."""
    # Step 1: enforce the explicit run-ID pairing and approval boundary.
    validate_review_pair(research=research, review=review)

    # Step 2: retain research-owned identities, funder proposals, and provenance.
    research_records = {
        record.funding_record_ref: record for record in research.funding_records
    }
    research_project_refs = {
        record.funding_record_ref
        for record in research.funding_records
        if not record.is_opportunity
    }
    reviewed_projects = [
        record
        for record in review.reviewed_reference_data.funding_records
        if not record.is_opportunity
    ]
    reviewed_project_refs = {record.funding_record_ref for record in reviewed_projects}
    if reviewed_project_refs != research_project_refs:
        raise ValueError("review must retain exactly the researched funded projects")

    sources = {source.source_ref: source for source in research.sources}
    research_evidence = {item.evidence_ref: item for item in research.evidence}
    selected_evidence_refs: set[str] = set()
    for decision in review.decisions:
        if not decision.selected:
            continue
        for evidence_ref in decision.evidence_refs:
            evidence = research_evidence.get(evidence_ref)
            if evidence is not None and not _paths_related(
                decision.target_path,
                evidence.target_path,
            ):
                raise ValueError(
                    f"review decision {decision.target_path} references unrelated "
                    f"evidence: {evidence_ref}"
                )
            selected_evidence_refs.add(evidence_ref)
    unknown_evidence_refs = selected_evidence_refs - set(research_evidence)
    if unknown_evidence_refs:
        raise ValueError(
            "review decisions reference unknown evidence: "
            + ", ".join(sorted(unknown_evidence_refs))
        )

    evidence_by_record: dict[str, list[ReviewedProjectEvidence]] = {}
    for evidence in research.evidence:
        if evidence.funding_record_ref not in research_project_refs:
            continue
        if evidence.evidence_ref not in selected_evidence_refs:
            continue
        source = sources.get(evidence.source_ref)
        if source is None:
            raise ValueError(
                f"evidence {evidence.evidence_ref} references an unknown source"
            )
        evidence_by_record.setdefault(evidence.funding_record_ref, []).append(
            ReviewedProjectEvidence(evidence=evidence, source=source)
        )

    # Step 3: validate the human funder choice and normalize only reviewed tags.
    projects: list[ReviewedFundedProjectImport] = []
    for reviewed_record in reviewed_projects:
        research_record = research_records[reviewed_record.funding_record_ref]
        selected_id = reviewed_record.selected_funder_id
        if selected_id is None:
            raise ValueError(
                f"funded project {reviewed_record.funding_record_ref} requires "
                "selected_funder_id"
            )
        proposed_ids = {
            candidate.funder_id for candidate in research_record.candidate_funders
        }
        if selected_id not in proposed_ids:
            raise ValueError(
                f"selected_funder_id for {reviewed_record.funding_record_ref} "
                "was not proposed by the funder scan"
            )
        if selected_id not in known_funder_ids:
            raise ValueError(f"selected funder does not exist: {selected_id}")

        retained_evidence = evidence_by_record.get(
            reviewed_record.funding_record_ref, []
        )
        if not retained_evidence:
            raise ValueError(
                f"funded project {reviewed_record.funding_record_ref} requires "
                "retained evidence"
            )
        normalized_record = reviewed_record.model_copy(
            update={
                "candidate_funders": research_record.candidate_funders,
                "project_tags": normalize_project_tags(reviewed_record.project_tags),
            }
        )
        projects.append(
            ReviewedFundedProjectImport(
                record=normalized_record,
                evidence=retained_evidence,
            )
        )

    if not projects:
        raise ValueError("review contains no funded projects to import")
    return ReviewedReferenceImport(run_id=research.run_id, projects=projects)


def validate_review_pair(
    *,
    research: FundingOpportunityResearchBundle,
    review: ReviewedReferenceDataArtifact,
) -> None:
    """Validate local pair identity and approval before any external read."""
    if research.run_id != review.run_id:
        raise ValueError("research.run_id must equal review.run_id")
    if review.review.status != "approved":
        raise ValueError("review status must be approved before import")


class PostgresReviewedReferenceDataWriter:
    """Transactional writer for the externally managed logical CNB table contract."""

    def __init__(self, database_url: str) -> None:
        """Store the connection URL without opening a connection at import time."""
        if not database_url.strip():
            raise ValueError("CNB database URL must not be empty")
        self._database_url = database_url

    def _connect(self):
        """Open a psycopg connection only when the local importer runs."""
        import psycopg2

        return psycopg2.connect(self._database_url)

    def find_existing_funder_ids(self, funder_ids: set[UUID]) -> set[UUID]:
        """Read canonical funder identities from the managed reference table."""
        if not funder_ids:
            return set()
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                "SELECT funder_id FROM funders WHERE funder_id = ANY(%s::uuid[])",
                ([str(funder_id) for funder_id in funder_ids],),
            )
            return {UUID(str(row[0])) for row in cursor.fetchall()}

    def import_projects(self, payload: ReviewedReferenceImport) -> list[UUID]:
        """Insert all reviewed records and evidence in one database transaction."""
        from psycopg2.extras import Json

        imported_ids: list[UUID] = []
        with self._connect() as connection, connection.cursor() as cursor:
            # Resolve each immutable source once for the whole paired run.
            source_ids: dict[str, UUID] = {}
            for project in payload.projects:
                for retained in project.evidence:
                    source = retained.source
                    if source.source_ref in source_ids:
                        continue
                    cursor.execute(
                        "SELECT source_document_id FROM source_documents "
                        "WHERE content_hash = %s AND url = %s LIMIT 1",
                        (source.content_hash, str(source.url)),
                    )
                    row = cursor.fetchone()
                    if row is None:
                        cursor.execute(
                            "INSERT INTO source_documents "
                            "(source_type, url, title, license_status, "
                            "content_hash, fetched_at) "
                            "VALUES (%s, %s, %s, %s, %s, %s) "
                            "RETURNING source_document_id",
                            (
                                source.source_type,
                                str(source.url),
                                source.title,
                                source.license_status,
                                source.content_hash,
                                source.fetched_at,
                            ),
                        )
                        row = cursor.fetchone()
                    if row is None:
                        raise RuntimeError("source insert did not return an ID")
                    source_ids[source.source_ref] = UUID(str(row[0]))

            # Insert reviewed funded-project rows and their source-grounded claims.
            for project in payload.projects:
                record = project.record
                cursor.execute(
                    "INSERT INTO funding_records "
                    "(funder_id, is_opportunity, name, applicant_name, city, "
                    "state_region, country, category, hazards, interventions, "
                    "finance_route, instrument_type, region_scope, min_award, "
                    "max_award, award_amount, currency, award_year, status, "
                    "summary, project_tags) "
                    "VALUES (%s, FALSE, %s, %s, %s, %s, %s, %s, %s, %s, %s, "
                    "%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
                    "RETURNING funding_record_id",
                    (
                        str(record.selected_funder_id),
                        record.name,
                        record.applicant_name,
                        record.city,
                        record.state_region,
                        record.country,
                        record.category,
                        Json(record.hazards),
                        Json(record.interventions),
                        record.finance_route,
                        record.instrument_type,
                        record.region_scope,
                        record.min_award,
                        record.max_award,
                        record.award_amount,
                        record.currency,
                        record.award_year,
                        record.status,
                        record.summary,
                        Json(record.project_tags),
                    ),
                )
                row = cursor.fetchone()
                if row is None:
                    raise RuntimeError("funding-record insert did not return an ID")
                funding_record_id = UUID(str(row[0]))
                imported_ids.append(funding_record_id)

                for retained in project.evidence:
                    evidence = retained.evidence
                    cursor.execute(
                        "INSERT INTO funding_record_evidence "
                        "(funding_record_id, source_document_id, claim, "
                        "quote_or_summary, source_map) VALUES (%s, %s, %s, %s, %s)",
                        (
                            str(funding_record_id),
                            str(source_ids[evidence.source_ref]),
                            evidence.quote_or_summary,
                            evidence.quote_or_summary,
                            Json(
                                {
                                    "evidence_ref": evidence.evidence_ref,
                                    "source_ref": evidence.source_ref,
                                    "target_path": evidence.target_path,
                                    "source_location": evidence.source_location,
                                }
                            ),
                        ),
                    )

        logger.info(
            "Imported %s reviewed funded projects for research run %s",
            len(imported_ids),
            payload.run_id,
        )
        return imported_ids
