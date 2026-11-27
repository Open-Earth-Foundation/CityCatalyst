"""Exercise long-source discovery, optional providers, and preservation of source-verified evidence."""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from app.config.settings import get_settings
from app.services.cnb.source_analysis import SourceBlock, SourcePage
from app.services.document_workspace import field_search, setup_reading
from app.services.document_workspace.evidence_review import (
    ReviewedEvidence,
    SourceFindings,
)
from app.services.document_workspace.field_search import FilePlan, search_field_findings
from app.services.document_workspace.reader_contract import point_reader_contract
from app.services.document_workspace.targeted_search import SourceSearchPlan


def source_file(*units):
    return SimpleNamespace(
        source=SimpleNamespace(source_label="Council record"), units=units
    )


@pytest.mark.parametrize(
    "enabled,embedding",
    [
        (False, "available"),
        (True, "available"),
        (True, "not_served"),
        (True, "unconfigured"),
    ],
)
async def test_long_source_keeps_primary_and_independently_discovered_locations(
    monkeypatch, enabled, embedding
):
    source = source_file(
        SourcePage(4, "North district. " + "General information. " * 2000),
        SourceBlock(
            "appendix/page-31/block-41", "Nieruchomością  zarządza wydział mienia."
        ),
    )
    point = {"key": "asset", "label": "Asset manager", "answer_type": "text"}
    settings = get_settings().model_copy(deep=True)
    settings.llm.models.cnb_point_embedding_model = (
        None if embedding == "unconfigured" else "test-model"
    )
    settings.llm.generation.prompt_budget.cnb_sources.independent_field_search_enabled = enabled
    rank = AsyncMock(return_value={"asset": [1]})
    if embedding == "not_served":
        rank.side_effect = RuntimeError("provider unavailable")
    monkeypatch.setattr(field_search, "rank_units", rank)
    monkeypatch.setattr(setup_reading, "point_partition_tokens", lambda _: 3000)
    calls = []

    def output(section, value, quote):
        return SourceFindings(
            findings=[
                {
                    "key": "asset",
                    "section": section,
                    "value": value,
                    "quote": quote,
                    "support": "full",
                    "applies_to": "applicant",
                }
            ]
        )

    async def run(**args):
        calls.append(args["name"])
        payload = json.loads(args["input_text"])
        model = args["output_type"]
        if model is SourceSearchPlan:
            return model(queries=[])
        if model is FilePlan:
            return model(
                fields=[
                    {
                        "key": "asset",
                        "probes": [
                            {"kind": "role", "phrase": "zarządza wydział mienia"}
                        ],
                    }
                ]
            )
        if model is ReviewedEvidence:
            candidates = payload["points"][0]["candidates"]
            assert len(candidates) == (2 if enabled else 1)
            return model(
                selections=[
                    {
                        "key": "asset",
                        "direct": [c["index"] for c in candidates],
                        "components": [],
                    }
                ]
            )
        assert model is SourceFindings
        if payload.get("mode") == "read":
            index = next(
                s["index"] for s in payload["sections"] if "Nieruchomością" in s["text"]
            )
            return output(
                index,
                "Municipal property office",
                "Nieruchomością zarządza wydział mienia.",
            )
        for s in payload["sections"]:
            if "North district." in s["text"]:
                return output(s["index"], "North district", "North district.")
        return model(findings=[])

    monkeypatch.setattr(setup_reading, "run_agent", run)
    result = await setup_reading.read_setup_source(
        [point], source, settings=settings, client=None, runner=None
    )
    assert (
        calls.count("Plan independent field retrieval")
        == calls.count("Independently read one application field")
        == int(enabled)
    )
    assert calls.count("Review evidence for application requirements") == 1
    assert calls.count("Document setup source reader") > 1
    assert calls.count("Document requirement search terms") == 1
    assert rank.await_count == int(enabled and embedding != "unconfigured")
    assert result["asset"][("full", "North district")][0]["page_number"] == 4
    if not enabled:
        assert list(result["asset"]) == [("full", "North district")]
        return
    (citation,) = result["asset"][("full", "Municipal property office")]
    assert (citation["page_number"], citation["source_anchor"], citation["quote"]) == (
        31,
        "appendix/page-31/block-41",
        "Nieruchomością  zarządza wydział mienia.",
    )


async def test_optional_planning_budget_skips_external_services_for_large_forms(
    monkeypatch,
):
    source = source_file(
        SourcePage(1, "This file supplies a current maintenance requirement.")
    )
    points = [
        {
            "key": f"approval_{i}",
            "label": " ".join(["Maintenance procedure"] * 45),
            "answer_type": "text",
        }
        for i in range(250)
    ]
    plan, embeddings = AsyncMock(), AsyncMock()
    monkeypatch.setattr(field_search, "rank_units", embeddings)
    assert (
        await search_field_findings(
            points,
            source,
            scope={},
            settings=get_settings(),
            client=None,
            runner=None,
            invoke=plan,
        )
        == []
    )
    plan.assert_not_awaited()
    embeddings.assert_not_awaited()


def test_config_without_embeddings_uses_lexical_ranking_and_invalidates_old_readings():
    settings = get_settings().model_copy(deep=True)
    models = settings.llm.models
    legacy = type(models).model_validate(
        models.model_dump(exclude={"cnb_point_embedding_model"})
    )
    assert legacy.cnb_point_embedding_model is None
    models.cnb_point_embedding_model = "example/semantic"
    implicit_default = type(
        settings.llm.generation.prompt_budget.cnb_sources
    ).model_validate({})
    assert not implicit_default.independent_field_search_enabled
    assert not settings.llm.generation.prompt_budget.cnb_sources.independent_field_search_enabled
    default = point_reader_contract(settings)
    settings.llm.models = legacy
    assert point_reader_contract(settings) == default
    settings.llm.models = models
    settings.llm.generation.prompt_budget.cnb_sources.independent_field_search_enabled = True
    with_embeddings = point_reader_contract(settings)
    assert with_embeddings != default
    settings.llm.models = legacy
    assert point_reader_contract(settings) != with_embeddings


async def test_short_file_with_large_form_reads_every_field_without_optional_search(
    monkeypatch,
):
    points = [
        {
            "key": f"inspection_{n}",
            "label": f"Inspection {n}",
            "description": "Household equipment classification and inspection capacity. "
            * 14,
            "answer_type": "text",
        }
        for n in range(96)
    ]
    settings = get_settings().model_copy(deep=True)
    settings.llm.generation.prompt_budget.cnb_sources.independent_field_search_enabled = True
    source = source_file(SourcePage(1, "The agency has two inspectors."))
    monkeypatch.setattr(setup_reading, "point_partition_tokens", lambda _: 3500)
    optional = AsyncMock(
        side_effect=AssertionError("Short source should not trigger optional retrieval")
    )
    monkeypatch.setattr(setup_reading, "search_field_findings", optional)
    fields_read = []

    async def primary(**args):
        assert args["output_type"] is SourceFindings
        payload = json.loads(args["input_text"])
        batch = json.loads(payload["question"])["requirements"]
        fields_read.extend(p["key"] for p in batch)
        return SourceFindings(findings=[])

    monkeypatch.setattr(setup_reading, "run_agent", primary)
    assert (
        await setup_reading.read_setup_source(
            points, source, settings=settings, client=None, runner=None
        )
        == {}
    )
    assert sorted(fields_read) == sorted(p["key"] for p in points)
    optional.assert_not_awaited()


async def test_secondary_failure_keeps_the_completed_primary_read(monkeypatch):
    from app.services.cnb.source_analysis import SourceSegment

    source = source_file(
        SourcePage(1, "Existing team."), SourcePage(2, "Staff directory.")
    )
    partitions = [
        [SourceSegment(str(u.number), u.number, u.text)] for u in source.units
    ]
    monkeypatch.setattr(
        setup_reading, "partition_source_pages", lambda *a, **kw: partitions
    )
    optional = AsyncMock(side_effect=ValueError("unexpected source index response"))
    monkeypatch.setattr(setup_reading, "search_field_findings", optional)

    async def reader(**args):
        if args["output_type"] is SourceSearchPlan:
            raise TimeoutError()
        if args["output_type"] is ReviewedEvidence:
            raise TimeoutError()
        payload = json.loads(args["input_text"])
        if payload["sections"][0]["text"] == "Existing team.":
            return SourceFindings(
                findings=[
                    {
                        "key": "team",
                        "value": "Existing team",
                        "support": "full",
                        "applies_to": "applicant",
                        "section": 0,
                        "quote": "Existing team.",
                    }
                ]
            )
        return SourceFindings(findings=[])

    monkeypatch.setattr(setup_reading, "run_agent", reader)
    settings = get_settings().model_copy(deep=True)
    settings.llm.generation.prompt_budget.cnb_sources.independent_field_search_enabled = True
    values = await setup_reading.read_setup_source(
        [{"key": "team", "answer_type": "text"}],
        source,
        settings=settings,
        client=None,
        runner=None,
    )
    (citation,) = values["team"][("partial", "Existing team")]
    assert (citation["quote"], citation["page_number"]) == ("Existing team.", 1)
    optional.assert_awaited_once()
