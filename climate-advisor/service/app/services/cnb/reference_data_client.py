"""Typed access to curated CNB reference data used by similar-project matching."""

from __future__ import annotations

from collections import defaultdict
import logging
from typing import Any, Protocol
from uuid import UUID

from app.config import get_settings
from app.models.cnb.similar_projects import (
    CnbSimilarProjectCandidate,
    CnbSimilarProjectEvidence,
)

logger = logging.getLogger(__name__)


class CnbReferenceDataClient(Protocol):
    """Read reviewed funded-project candidates from the CNB reference corpus."""

    def list_funded_project_candidates(
        self,
        *,
        funder_id: UUID | None,
    ) -> list[CnbSimilarProjectCandidate]:
        """Return reviewed candidates, optionally restricted to one funder."""


class CnbReferenceDataUnavailable(RuntimeError):
    """Raised when the managed reference database cannot serve a request."""


class PostgresCnbReferenceDataClient:
    """Read reviewed funded projects and retained evidence from PostgreSQL."""

    def __init__(self, database_url: str | None = None) -> None:
        """Accept an explicit URL for tests or resolve it from service settings."""
        self._database_url = database_url

    def list_funded_project_candidates(
        self,
        *,
        funder_id: UUID | None,
    ) -> list[CnbSimilarProjectCandidate]:
        """Return deterministic funded-project candidates with valid evidence."""
        # Step 1: resolve configuration without opening a connection at import time.
        database_url = self._database_url or get_settings().cnb_database_url
        if not database_url:
            raise CnbReferenceDataUnavailable("CNB reference data is not configured")

        # Step 2: fetch all scoped records and their evidence in two queries.
        try:
            rows, evidence_rows = self._fetch_rows(
                database_url=database_url,
                funder_id=funder_id,
            )
        except Exception as exc:
            logger.error(
                "CNB reference-data query failed (%s)",
                type(exc).__name__,
            )
            raise CnbReferenceDataUnavailable(
                "CNB reference data is unavailable"
            ) from None

        # Step 3: validate stored source maps before building typed candidates.
        evidence_by_project: dict[UUID, list[CnbSimilarProjectEvidence]] = defaultdict(
            list
        )
        skipped_evidence = 0
        for row in evidence_rows:
            source_map = row["source_map"]
            if not isinstance(source_map, dict):
                skipped_evidence += 1
                continue
            required = (
                source_map.get("evidence_ref"),
                source_map.get("source_ref"),
                source_map.get("target_path"),
            )
            if not all(isinstance(value, str) and value for value in required):
                skipped_evidence += 1
                continue
            evidence_by_project[UUID(str(row["funded_project_id"]))].append(
                CnbSimilarProjectEvidence(
                    evidence_ref=required[0],
                    source_ref=required[1],
                    target_path=required[2],
                    source_location=_optional_string(
                        source_map.get("source_location")
                    ),
                    quote_or_summary=row["quote_or_summary"],
                )
            )
        if skipped_evidence:
            logger.warning(
                "Skipped %s malformed CNB evidence rows.", skipped_evidence
            )

        return [
            self._build_candidate(
                row=row,
                evidence=evidence_by_project[UUID(str(row["funded_project_id"]))],
            )
            for row in rows
        ]

    def _fetch_rows(
        self,
        *,
        database_url: str,
        funder_id: UUID | None,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """Read all scoped funded projects and their evidence in one transaction."""
        import psycopg2
        from psycopg2.extras import RealDictCursor

        with psycopg2.connect(database_url) as connection:
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """
                    SELECT
                        fp.funded_project_id,
                        fp.funder_id,
                        f.name AS funder_name,
                        fp.name,
                        fp.applicant_name,
                        fp.applicant_type,
                        fp.city,
                        fp.state_region,
                        fp.country,
                        fp.category,
                        fp.sector,
                        fp.hazards,
                        fp.interventions,
                        fp.finance_route,
                        fp.instrument_type,
                        fp.region_scope,
                        fp.award_amount,
                        fp.currency,
                        fp.award_year,
                        fp.status,
                        fp.summary,
                        fp.project_tags,
                        fp.known_gaps
                    FROM funded_projects AS fp
                    JOIN funders AS f ON f.funder_id = fp.funder_id
                    WHERE (
                        %(funder_id)s::uuid IS NULL
                        OR fp.funder_id = %(funder_id)s::uuid
                    )
                    ORDER BY f.name, fp.name, fp.funded_project_id
                    """,
                    {
                        "funder_id": str(funder_id) if funder_id else None,
                    },
                )
                records = [dict(row) for row in cursor.fetchall()]
                if not records:
                    return [], []

                funded_project_ids = [
                    str(row["funded_project_id"]) for row in records
                ]
                cursor.execute(
                    """
                    SELECT
                        evidence.funded_project_id,
                        evidence.evidence_id,
                        evidence.quote_or_summary,
                        evidence.source_map,
                        source.source_document_id,
                        source.url AS source_url,
                        source.title AS source_title
                    FROM funding_evidence AS evidence
                    JOIN source_documents AS source
                      ON source.source_document_id = evidence.source_document_id
                    WHERE evidence.funded_project_id = ANY(
                        %(funded_project_ids)s::uuid[]
                    )
                    ORDER BY
                        evidence.funded_project_id,
                        evidence.source_map ->> 'evidence_ref',
                        evidence.evidence_id
                    """,
                    {"funded_project_ids": funded_project_ids},
                )
                evidence = [dict(row) for row in cursor.fetchall()]
        return records, evidence

    def _build_candidate(
        self,
        *,
        row: dict[str, Any],
        evidence: list[CnbSimilarProjectEvidence],
    ) -> CnbSimilarProjectCandidate:
        """Map one managed database row to the matching service contract."""
        return CnbSimilarProjectCandidate(
            funded_project_id=row["funded_project_id"],
            funder_id=row["funder_id"],
            funder_name=row["funder_name"],
            is_funded_award=True,
            award_status=row["status"],
            award_amount=row["award_amount"],
            currency=row["currency"],
            award_year=row["award_year"],
            name=row["name"],
            applicant_name=row["applicant_name"],
            applicant_type=row["applicant_type"],
            city=row["city"],
            state_region=row["state_region"],
            country=row["country"],
            category=row["category"],
            sector=row["sector"],
            hazards=_string_list(row["hazards"]),
            interventions=_string_list(row["interventions"]),
            finance_route=row["finance_route"],
            instrument_type=row["instrument_type"],
            region_scope=row["region_scope"],
            summary=row["summary"],
            project_tags=_string_list(row["project_tags"]),
            known_gaps=_string_list(row["known_gaps"]),
            evidence=evidence,
        )


class UnavailableCnbReferenceDataClient:
    """Safe default used before a production reference-data client is wired."""

    def list_funded_project_candidates(
        self,
        *,
        funder_id: UUID | None,
    ) -> list[CnbSimilarProjectCandidate]:
        """Return no candidates when reference data is not available yet."""
        scope = str(funder_id) if funder_id is not None else "all funders"
        logger.warning(
            "CNB similar-project reference data is unavailable for %s.", scope
        )
        return []


def _string_list(value: object) -> list[str]:
    """Keep only non-empty strings from a stored JSON array."""
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str) and item]


def _optional_string(value: object) -> str | None:
    """Return an optional stored string without coercing other JSON values."""
    return value if isinstance(value, str) else None
