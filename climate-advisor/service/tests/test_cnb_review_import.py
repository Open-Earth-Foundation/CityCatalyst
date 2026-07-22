"""Tests for reviewed CNB reference-data import."""

from uuid import UUID

import pytest

from app.models.cnb_research import ReviewState
from app.services.cnb_review_import import (
    PostgresReviewedReferenceDataWriter,
    prepare_reviewed_reference_import,
)
from tests.cnb_research_helpers import TEST_FUNDER_ID, build_review_pair


def test_import_builds_one_normalized_funded_project() -> None:
    research, review = build_review_pair()

    payload = prepare_reviewed_reference_import(
        research=research,
        review=review,
        known_funder_ids={TEST_FUNDER_ID},
    )

    assert payload.run_id == research.run_id
    assert len(payload.projects) == 1
    assert payload.projects[0].record.project_tags == ["flood-risk", "city-led"]
    assert payload.projects[0].evidence[0].evidence.evidence_ref == "evidence-001"


@pytest.mark.parametrize(
    ("case", "message"),
    [
        ("different_run", "research.run_id must equal review.run_id"),
        ("pending", "must be approved"),
        ("unknown_funder", "selected funder does not exist"),
        ("no_evidence", "requires retained evidence"),
    ],
)
def test_import_rejects_unreviewed_or_untrusted_data(
    case: str,
    message: str,
) -> None:
    research, review = build_review_pair()
    known_funders = {TEST_FUNDER_ID}

    if case == "different_run":
        review = review.model_copy(update={"run_id": "different-run"})
    elif case == "pending":
        review = review.model_copy(update={"review": ReviewState(status="pending_review")})
    elif case == "unknown_funder":
        known_funders = set()
    else:
        research = research.model_copy(update={"evidence": []})
        review = review.model_copy(
            update={
                "decisions": [
                    review.decisions[0].model_copy(update={"evidence_refs": []})
                ]
            }
        )

    with pytest.raises(ValueError, match=message):
        prepare_reviewed_reference_import(
            research=research,
            review=review,
            known_funder_ids=known_funders,
        )


def test_postgres_funder_lookup_uses_uuid_parameters(monkeypatch) -> None:
    class FakeCursor:
        def __init__(self) -> None:
            self.query = ""
            self.parameters: tuple[list[str]] | None = None

        def __enter__(self) -> "FakeCursor":
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def execute(self, query: str, parameters: tuple[list[str]]) -> None:
            self.query = query
            self.parameters = parameters

        def fetchall(self) -> list[tuple[UUID]]:
            return [(TEST_FUNDER_ID,)]

    class FakeConnection:
        def __init__(self, cursor: FakeCursor) -> None:
            self.cursor_instance = cursor

        def __enter__(self) -> "FakeConnection":
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def cursor(self) -> FakeCursor:
            return self.cursor_instance

    cursor = FakeCursor()
    writer = PostgresReviewedReferenceDataWriter("postgresql://unused")
    monkeypatch.setattr(writer, "_connect", lambda: FakeConnection(cursor))

    assert writer.find_existing_funder_ids({TEST_FUNDER_ID}) == {TEST_FUNDER_ID}
    assert "ANY(%s::uuid[])" in cursor.query
    assert cursor.parameters == ([str(TEST_FUNDER_ID)],)
