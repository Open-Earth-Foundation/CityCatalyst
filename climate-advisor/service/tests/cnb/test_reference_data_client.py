"""Tests for PostgreSQL-backed CNB similar-project candidate reads."""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Self
from uuid import UUID

import psycopg2
import pytest
from app.services.cnb import reference_data_client
from app.services.cnb.reference_data_client import (
    CnbReferenceDataUnavailable,
    PostgresCnbReferenceDataClient,
)

FUNDER_ID = UUID("11111111-1111-4111-8111-111111111111")
PROJECT_ID = UUID("22222222-2222-4222-8222-222222222222")


def _record_row() -> dict[str, object]:
    """Return one complete funded-project database row."""
    return {
        "funded_project_id": PROJECT_ID,
        "funder_id": FUNDER_ID,
        "funder_name": "Example Funder",
        "name": "Resilient district",
        "applicant_name": "Example City",
        "applicant_type": "municipality",
        "city": "Example City",
        "state_region": "Example Region",
        "country": "Example Country",
        "category": "adaptation",
        "sector": "buildings",
        "hazards": ["heat", 12, ""],
        "interventions": ["retrofit"],
        "finance_route": "grant",
        "instrument_type": "grant",
        "region_scope": "regional",
        "award_amount": Decimal("100000.00"),
        "currency": "USD",
        "award_year": 2025,
        "status": "awarded",
        "summary": "A reviewed funded project.",
        "project_tags": ["buildings"],
        "known_gaps": ["No implementation date"],
    }


def test_candidate_read_fetches_full_scope_and_keeps_only_valid_evidence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Map valid rows without truncating the scoped reference corpus."""
    client = PostgresCnbReferenceDataClient("postgresql://configured")
    observed: dict[str, object] = {}

    def fetch_rows(
        **kwargs: object,
    ) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
        observed.update(kwargs)
        return [_record_row()], [
            {
                "funded_project_id": PROJECT_ID,
                "quote_or_summary": "Supported by the retained source.",
                "source_map": {
                    "evidence_ref": "evidence-1",
                    "source_ref": "source-1",
                    "target_path": "funded_projects[project-1].name",
                    "source_location": "page 2",
                },
            },
            {
                "funded_project_id": PROJECT_ID,
                "quote_or_summary": "Malformed and ignored.",
                "source_map": {"evidence_ref": "missing-required-fields"},
            },
        ]

    monkeypatch.setattr(client, "_fetch_rows", fetch_rows)

    candidates = client.list_funded_project_candidates(funder_id=FUNDER_ID)

    assert observed == {
        "database_url": "postgresql://configured",
        "funder_id": FUNDER_ID,
    }
    assert len(candidates) == 1
    candidate = candidates[0]
    assert candidate.funded_project_id == PROJECT_ID
    assert candidate.is_funded_award is True
    assert candidate.award_status == "awarded"
    assert candidate.hazards == ["heat"]
    assert [item.evidence_ref for item in candidate.evidence] == ["evidence-1"]


def test_cross_funder_empty_corpus_is_not_reported_as_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Keep an empty corpus distinct from a failed database query."""
    client = PostgresCnbReferenceDataClient("postgresql://configured")
    monkeypatch.setattr(client, "_fetch_rows", lambda **_kwargs: ([], []))

    assert client.list_funded_project_candidates(funder_id=None) == []


def test_postgres_queries_apply_scope_order_and_source_join(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Keep same-funder/cross-funder reads deterministic and source-grounded."""
    queries: list[tuple[str, dict[str, object]]] = []
    responses = [[_record_row()], []]

    class FakeCursor:
        def __enter__(self) -> Self:
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def execute(self, query: str, parameters: dict[str, object]) -> None:
            queries.append((" ".join(query.split()), parameters))

        def fetchall(self) -> list[dict[str, object]]:
            return responses.pop(0)

    class FakeConnection:
        def __enter__(self) -> Self:
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def cursor(self, **_kwargs: object) -> FakeCursor:
            return FakeCursor()

    monkeypatch.setattr(psycopg2, "connect", lambda _url: FakeConnection())
    client = PostgresCnbReferenceDataClient("postgresql://configured")

    records, evidence = client._fetch_rows(
        database_url="postgresql://configured",
        funder_id=FUNDER_ID,
    )

    assert records == [_record_row()]
    assert evidence == []
    record_query, record_parameters = queries[0]
    evidence_query, evidence_parameters = queries[1]
    assert "FROM funded_projects AS fp" in record_query
    assert "fp.funder_id = %(funder_id)s::uuid" in record_query
    assert "ORDER BY f.name, fp.name, fp.funded_project_id" in record_query
    assert "LIMIT" not in record_query
    assert record_parameters == {"funder_id": str(FUNDER_ID)}
    assert "JOIN source_documents AS source" in evidence_query
    assert "source.url AS source_url" in evidence_query
    assert evidence_parameters == {"funded_project_ids": [str(PROJECT_ID)]}


def test_database_failure_never_exposes_connection_details(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Return a stable error and log only the exception class."""
    password = "do-not-log-this-password"
    database_url = f"postgresql://cnb:{password}@database.invalid/cnb"
    client = PostgresCnbReferenceDataClient(database_url)

    def fail(
        **_kwargs: object,
    ) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
        raise RuntimeError(f"could not connect to {database_url}")

    monkeypatch.setattr(client, "_fetch_rows", fail)

    with (
        caplog.at_level(logging.ERROR),
        pytest.raises(
            CnbReferenceDataUnavailable,
            match="CNB reference data is unavailable",
        ) as error,
    ):
        client.list_funded_project_candidates(funder_id=None)

    combined_output = f"{error.value}\n{caplog.text}"
    assert password not in combined_output
    assert database_url not in combined_output


def test_missing_configuration_has_a_distinct_safe_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Fail before connecting when no CNB database has been configured."""
    client = PostgresCnbReferenceDataClient()
    monkeypatch.setattr(
        reference_data_client,
        "get_settings",
        lambda: type("Settings", (), {"cnb_database_url": None})(),
    )

    with pytest.raises(
        CnbReferenceDataUnavailable,
        match="CNB reference data is not configured",
    ):
        client.list_funded_project_candidates(funder_id=None)
