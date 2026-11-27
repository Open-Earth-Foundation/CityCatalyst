"""Regression coverage for independent review of exact, page-local citations."""

import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from app.config.settings import get_settings
from app.services.cnb.source_analysis import SourceBlock, SourcePage
from app.services.document_workspace.evidence_review import (
    EvidenceSelection,
    QuotedFinding,
    ReviewedEvidence,
    citation_context,
    keep_selections,
    review_batches,
    review_findings,
)
from app.services.document_workspace.reader_contract import point_reader_contract
from app.services.document_workspace.setup_reading import (
    candidate_signature,
    compatible_candidates,
    ordered_point_definitions,
    source_text_fingerprint,
)
from pydantic import ValidationError


def finding(page, support="full"):
    quote = f"Source row {page}"
    return QuotedFinding(
        "cost",
        support,
        75,
        {"source_label": "Plan", "page_number": page, "quote": quote},
        "District heating: " + quote,
    )


def test_review_context_keeps_exact_table_and_paragraph_boundaries():
    table = "Amount and currency\r\nStation A  |  75 PLN  |  2020\r\nStation B  |  80 PLN  |  2021"
    assert citation_context(table, table, "75 PLN") == "Station A  |  75 PLN  |  2020"
    original = "Prelude\r\n \r\nThe cost covers lighting\r\nand district heating.\r\n\r\nNext paragraph."
    assert (
        citation_context(original, "covers lighting\r\nand", "lighting")
        == "The cost covers lighting\r\nand district heating."
    )
    assert citation_context("Cost 75 or 75", "Cost 75 or 75", "75") is None


async def test_every_quotation_is_reviewed_and_only_approved_locations_are_kept():
    findings = [
        finding(8, "partial"),
        finding(6),
        finding(3),
        finding(2),
        finding(1),
        finding(2),
    ]
    checked = ReviewedEvidence(
        selections=[{"key": "cost", "direct": [2, 2, 4], "components": [0]}]
    )
    invoke = AsyncMock(return_value=checked)
    result = await review_findings(
        findings,
        [[{"key": "cost"}]],
        scope={},
        source_label="Plan",
        prompt="Review",
        model=None,
        semaphore=asyncio.Semaphore(1),
        client=None,
        runner=None,
        invoke=invoke,
    )
    batch = json.loads(invoke.await_args.kwargs["input_text"])["points"][0][
        "candidates"
    ]
    assert [item["citations"][0]["page_number"] for item in batch] == [1, 2, 3, 6, 8]
    assert batch[4]["citations"][0]["context"] == "District heating: Source row 8"
    assert [c["page_number"] for c in result["cost"][("full", 75)]] == [3]
    assert [c["page_number"] for c in result["cost"][("partial", 75)]] == [1, 8]
    assert all("context" not in c for cs in result["cost"].values() for c in cs)


@pytest.mark.parametrize("direct,components", [([-1], []), ([1], []), ([0], [0])])
def test_invalid_and_contradictory_review_indices_are_rejected(direct, components):
    only = {"cost": ({"key": "cost"}, [finding(1)])}
    with pytest.raises(ValueError):
        keep_selections(
            only, [EvidenceSelection(key="cost", direct=direct, components=components)]
        )
    with pytest.raises(ValidationError):
        EvidenceSelection(key="cost", direct=[True], components=[])


def test_review_split_keeps_every_local_index_and_is_order_independent():
    values = [finding(9), finding(2), finding(7)]

    def locations(findings):
        return [
            [item.citation["page_number"] for item in batch["cost"][1]]
            for batch in review_batches(findings, [[{"key": "cost"}]], char_budget=100)
        ]

    assert locations(values) == locations(reversed(values)) == [[2], [7], [9]]


def test_reader_cache_depends_on_effective_configuration_and_physical_text():
    settings = get_settings().model_copy(deep=True)
    models = settings.llm.models
    models.cnb_point_reader = models.cnb_source_reader.model_copy(deep=True)
    before = point_reader_contract(settings)
    models.cnb_source_reader.name = "unused-model"
    settings.llm.generation.prompt_budget.cnb_sources.max_concurrency += 1
    assert point_reader_contract(settings) == before
    settings.llm.generation.prompt_budget.cnb_sources.max_partition_tokens = 4000
    assert point_reader_contract(settings) != before
    h = source_text_fingerprint([SourcePage(1, "Town hall")])
    assert h != source_text_fingerprint([SourcePage(2, "Town hall")])
    assert h != source_text_fingerprint([SourcePage(1, "City hall")])
    assert h != source_text_fingerprint([SourceBlock("council/records", "Town hall")])


def test_duplicate_legacy_suggestion_cannot_replace_a_human_disposition():
    from app.services.document_workspace.requirements import fingerprint

    identity = {"upload_id": "example", "sha256": "x"}
    citations = [finding(8).citation, finding(2).citation]
    signature = candidate_signature(75, citations, identity, "full")
    accepted = SimpleNamespace(
        value=75,
        citations=citations,
        fingerprint=fingerprint([75, citations, identity, "full"]),
        status="accepted",
        candidate_id="earlier",
    )
    duplicate = SimpleNamespace(
        value=75,
        citations=list(reversed(citations)),
        fingerprint=signature,
        status="pending",
        candidate_id="later",
    )
    stored = {item.fingerprint: item for item in (duplicate, accepted)}
    assert compatible_candidates(stored, identity)[signature] is accepted


def test_old_point_rows_receive_pinned_section_context_and_stable_form_order():
    fields = [{"key": "z", "label": "Address"}, {"key": "a", "label": "Name"}]
    pin = {
        "id": str(uuid4()),
        "name": "Plan",
        "output_format": "markdown",
        "chapter_schema": [
            {
                "chapter_ref": "repair",
                "title": "Proposed repairs",
                "description": "Work the city will commission.",
                "required_fields": fields,
            }
        ],
    }
    points = [
        SimpleNamespace(semantic_key=k, definition={"key": k}) for k in ("x", "a", "z")
    ]
    arranged = ordered_point_definitions(points, pin)
    assert [p["key"] for p in arranged] == ["z", "a", "x"]
    assert (
        arranged[0]["section_context"][0]["description"]
        == "Work the city will commission."
    )
    assert points[-1].definition == {"key": "z"}
    assert ordered_point_definitions(points, {}) == [
        {"key": "a"},
        {"key": "x"},
        {"key": "z"},
    ]
