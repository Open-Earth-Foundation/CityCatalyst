"""Validate reviewed CNB research pairs and import funded-project references."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation
import logging
import re
from typing import Literal, Protocol
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, JsonValue, model_validator

from app.models.cnb.research import (
    FieldEvidence,
    FundedProjectDraft,
    FunderCriterionDraft,
    FunderDraft,
    FunderTemplateDraft,
    FundingOpportunityDraft,
    FundingOpportunityResearchBundle,
    ResearchModel,
    ReviewState,
    SourceDocumentDraft,
)
from app.services.cnb.project_tag_normalizer import normalize_project_tags

logger = logging.getLogger(__name__)
_PATH_TOKEN_PATTERN = re.compile(r"[^.\[\]]+|\[[^\]]*\]")
_STABLE_ID_FIELDS = (
    "funding_opportunity_ref",
    "funded_project_ref",
    "template_ref",
    "criterion_ref",
    "chapter_ref",
)
_RESEARCH_OWNED_PROJECT_FIELDS = {
    "funded_project_ref",
    "funder_ref",
    "candidate_funders",
}


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
    funding_opportunities: list[FundingOpportunityDraft]
    funded_projects: list[FundedProjectDraft]
    funder_templates: list[FunderTemplateDraft] = Field(default_factory=list)
    funder_criteria: list[FunderCriterionDraft] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_reference_identities(self) -> "ReviewedReferenceData":
        """Keep reviewed reference identities aligned with schema 3.0."""
        opportunity_refs = [
            item.funding_opportunity_ref for item in self.funding_opportunities
        ]
        project_refs = [item.funded_project_ref for item in self.funded_projects]
        if len(set(opportunity_refs)) != len(opportunity_refs):
            raise ValueError(
                "reviewed funding_opportunity_ref values must be unique"
            )
        if len(set(project_refs)) != len(project_refs):
            raise ValueError("reviewed funded_project_ref values must be unique")
        if len(opportunity_refs) != 1:
            raise ValueError(
                "reviewed funding_opportunities must contain exactly one opportunity"
            )
        if any(
            item.funder_ref != self.funder.funder_ref
            for item in [*self.funding_opportunities, *self.funded_projects]
        ):
            raise ValueError(
                "reviewed funding references must use the dossier funder_ref"
            )
        opportunity_ref_set = set(opportunity_refs)
        if any(
            item.funding_opportunity_ref not in opportunity_ref_set
            for item in [*self.funder_templates, *self.funder_criteria]
        ):
            raise ValueError(
                "reviewed templates and criteria must reference the opportunity"
            )
        return self


class ReviewedReferenceDataArtifact(ResearchModel):
    """Human-reviewed partner for one ``<run_id>.research.json`` artifact."""

    schema_version: Literal["3.0"]
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

    record: FundedProjectDraft
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
        """Idempotently persist reviewed projects, sources, and evidence."""


def selected_funder_ids(review: ReviewedReferenceDataArtifact) -> set[UUID]:
    """Return all non-null reviewer selections on funded-project records."""
    return {
        project.selected_funder_id
        for project in review.reviewed_reference_data.funded_projects
        if project.selected_funder_id is not None
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


def _raw_path_tokens(path: str) -> list[str]:
    """Split a review target path without altering stable record identifiers."""
    return [
        (part[1:-1] if part.startswith("[") else part).strip()
        for part in _PATH_TOKEN_PATTERN.findall(path)
    ]


def _resolve_reviewed_value(reviewed_data: ReviewedReferenceData, path: str) -> object:
    """Resolve one stable review path against the typed reviewed payload."""
    current: object = reviewed_data
    for token in _raw_path_tokens(path):
        if isinstance(current, BaseModel):
            if token not in type(current).model_fields:
                raise ValueError(f"unknown model field {token}")
            current = getattr(current, token)
            continue
        if isinstance(current, dict):
            if token not in current:
                raise ValueError(f"unknown object key {token}")
            current = current[token]
            continue
        if isinstance(current, list):
            matches = [
                item
                for item in current
                if isinstance(item, BaseModel)
                and any(
                    str(getattr(item, field_name, "")) == token
                    for field_name in _STABLE_ID_FIELDS
                )
            ]
            if len(matches) == 1:
                current = matches[0]
                continue
            if len(matches) > 1:
                raise ValueError(f"stable record identifier is not unique: {token}")
            if token.isdecimal():
                index = int(token)
                if index < len(current):
                    current = current[index]
                    continue
                raise ValueError(f"array index is out of range: {token}")
            raise ValueError(f"unknown stable record identifier: {token}")
        raise ValueError(f"path continues beyond a scalar at {token}")
    return current


def _review_values_equal(actual: object, reviewed: JsonValue) -> bool:
    """Compare typed reviewed fields with their JSON decision representation."""
    if isinstance(actual, UUID):
        return str(actual) == str(reviewed)
    if isinstance(actual, Decimal):
        if isinstance(reviewed, bool) or reviewed is None:
            return False
        try:
            return actual == Decimal(str(reviewed))
        except (InvalidOperation, ValueError):
            return False
    if isinstance(actual, list) and isinstance(reviewed, list):
        return len(actual) == len(reviewed) and all(
            _review_values_equal(actual_item, reviewed_item)
            for actual_item, reviewed_item in zip(actual, reviewed, strict=True)
        )
    if isinstance(actual, dict) and isinstance(reviewed, dict):
        return actual.keys() == reviewed.keys() and all(
            _review_values_equal(actual[key], reviewed[key]) for key in actual
        )
    return actual == reviewed


def _review_value_is_empty(value: object) -> bool:
    """Return whether an unselected field has its schema-default empty value."""
    return value is None or value == [] or value == {}


def _validate_review_decision_values(review: ReviewedReferenceDataArtifact) -> None:
    """Require imported fields to agree with selected and excluded decisions."""
    for decision in review.decisions:
        try:
            actual_value = _resolve_reviewed_value(
                review.reviewed_reference_data,
                decision.target_path,
            )
        except ValueError as error:
            if not decision.selected:
                continue
            raise ValueError(
                f"selected review decision does not resolve in "
                f"reviewed_reference_data: {decision.target_path}"
            ) from error
        if decision.selected and not _review_values_equal(
            actual_value,
            decision.reviewed_value,
        ):
            raise ValueError(
                "reviewed_reference_data does not match selected decision: "
                f"{decision.target_path}"
            )
        if not decision.selected and not _review_value_is_empty(actual_value):
            raise ValueError(
                "reviewed_reference_data includes an unselected decision: "
                f"{decision.target_path}"
            )

    # Every populated database-bound project field must have an affirmative decision.
    selected_paths = {
        decision.target_path for decision in review.decisions if decision.selected
    }
    for project in review.reviewed_reference_data.funded_projects:
        row_path = f"funded_projects[{project.funded_project_ref}]"
        for field_name in type(project).model_fields:
            if field_name in _RESEARCH_OWNED_PROJECT_FIELDS:
                continue
            value = getattr(project, field_name)
            if _review_value_is_empty(value):
                continue
            field_path = f"{row_path}.{field_name}"
            if field_path not in selected_paths:
                raise ValueError(
                    "reviewed_reference_data field has no selected decision: "
                    f"{field_path}"
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
    _validate_review_decision_values(review)

    # Step 2: retain research-owned identities, funder proposals, and provenance.
    research_projects = {
        project.funded_project_ref: project for project in research.funded_projects
    }
    research_project_refs = set(research_projects)
    reviewed_projects = review.reviewed_reference_data.funded_projects
    reviewed_project_refs = {
        project.funded_project_ref for project in reviewed_projects
    }
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

    evidence_by_project: dict[str, list[ReviewedProjectEvidence]] = {}
    for evidence in research.evidence:
        if evidence.funded_project_ref not in research_project_refs:
            continue
        if evidence.evidence_ref not in selected_evidence_refs:
            continue
        source = sources.get(evidence.source_ref)
        if source is None:
            raise ValueError(
                f"evidence {evidence.evidence_ref} references an unknown source"
            )
        assert evidence.funded_project_ref is not None
        evidence_by_project.setdefault(evidence.funded_project_ref, []).append(
            ReviewedProjectEvidence(evidence=evidence, source=source)
        )

    # Step 3: validate the human funder choice and normalize only reviewed tags.
    projects: list[ReviewedFundedProjectImport] = []
    for reviewed_project in reviewed_projects:
        research_project = research_projects[reviewed_project.funded_project_ref]
        selected_id = reviewed_project.selected_funder_id
        if selected_id is None:
            raise ValueError(
                f"funded project {reviewed_project.funded_project_ref} requires "
                "selected_funder_id"
            )
        proposed_ids = {
            candidate.funder_id for candidate in research_project.candidate_funders
        }
        if selected_id not in proposed_ids:
            raise ValueError(
                f"selected_funder_id for {reviewed_project.funded_project_ref} "
                "was not proposed by the funder scan"
            )
        if selected_id not in known_funder_ids:
            raise ValueError(f"selected funder does not exist: {selected_id}")

        retained_evidence = evidence_by_project.get(
            reviewed_project.funded_project_ref, []
        )
        if not retained_evidence:
            raise ValueError(
                f"funded project {reviewed_project.funded_project_ref} requires "
                "retained evidence"
            )
        normalized_project = reviewed_project.model_copy(
            update={
                "candidate_funders": research_project.candidate_funders,
                "project_tags": normalize_project_tags(reviewed_project.project_tags),
            }
        )
        projects.append(
            ReviewedFundedProjectImport(
                record=normalized_project,
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
        """Insert new reviewed records or reuse IDs from the same research run."""
        from psycopg2.extras import Json

        imported_ids: list[UUID] = []
        inserted_count = 0
        reused_count = 0
        with self._connect() as connection, connection.cursor() as cursor:
            # Resolve immutable sources lazily so a replay performs no source writes.
            source_ids: dict[str, UUID] = {}

            # Insert each stable run/record identity once and reuse it on retries.
            for project in payload.projects:
                record = project.record
                new_funded_project_id = uuid4()
                cursor.execute(
                    "INSERT INTO funded_projects "
                    "(funded_project_id, source_run_id, source_record_ref, funder_id, "
                    "name, applicant_name, applicant_type, city, state_region, "
                    "country, category, sector, hazards, interventions, finance_route, "
                    "instrument_type, region_scope, award_amount, currency, "
                    "award_year, status, summary, "
                    "project_tags, known_gaps) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, "
                    "%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
                    "ON CONFLICT (source_run_id, source_record_ref) DO NOTHING "
                    "RETURNING funded_project_id",
                    (
                        str(new_funded_project_id),
                        payload.run_id,
                        record.funded_project_ref,
                        str(record.selected_funder_id),
                        record.name,
                        record.applicant_name,
                        record.applicant_type,
                        record.city,
                        record.state_region,
                        record.country,
                        record.category,
                        record.sector,
                        Json(record.hazards),
                        Json(record.interventions),
                        record.finance_route,
                        record.instrument_type,
                        record.region_scope,
                        record.award_amount,
                        record.currency,
                        record.award_year,
                        record.status,
                        record.summary,
                        Json(record.project_tags),
                        Json(record.known_gaps),
                    ),
                )
                row = cursor.fetchone()
                if row is None:
                    cursor.execute(
                        "SELECT funded_project_id FROM funded_projects "
                        "WHERE source_run_id = %s AND source_record_ref = %s",
                        (payload.run_id, record.funded_project_ref),
                    )
                    row = cursor.fetchone()
                    if row is None:
                        raise RuntimeError(
                            "funded-project conflict did not resolve to an existing ID"
                        )
                    imported_ids.append(UUID(str(row[0])))
                    reused_count += 1
                    continue

                funded_project_id = UUID(str(row[0]))
                imported_ids.append(funded_project_id)
                inserted_count += 1

                # Persist evidence only for a newly inserted project record.
                for retained in project.evidence:
                    evidence = retained.evidence
                    source = retained.source
                    if source.source_ref not in source_ids:
                        new_source_document_id = uuid4()
                        cursor.execute(
                            "INSERT INTO source_documents "
                            "(source_document_id, source_type, url, title, "
                            "license_status, content_hash, fetched_at) "
                            "VALUES (%s, %s, %s, %s, %s, %s, %s) "
                            "ON CONFLICT (content_hash, url) DO UPDATE "
                            "SET content_hash = EXCLUDED.content_hash "
                            "RETURNING source_document_id",
                            (
                                str(new_source_document_id),
                                source.source_type,
                                str(source.url),
                                source.title,
                                source.license_status,
                                source.content_hash,
                                source.fetched_at,
                            ),
                        )
                        source_row = cursor.fetchone()
                        if source_row is None:
                            raise RuntimeError("source upsert did not return an ID")
                        source_ids[source.source_ref] = UUID(str(source_row[0]))

                    evidence_id = uuid4()
                    cursor.execute(
                        "INSERT INTO funding_evidence "
                        "(evidence_id, funded_project_id, source_document_id, claim, "
                        "quote_or_summary, source_map) "
                        "VALUES (%s, %s, %s, %s, %s, %s)",
                        (
                            str(evidence_id),
                            str(funded_project_id),
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
            "Prepared %s reviewed funded projects for research run %s: "
            "%s inserted, %s already present",
            len(imported_ids),
            payload.run_id,
            inserted_count,
            reused_count,
        )
        return imported_ids
