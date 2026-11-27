"""Prove that partial evidence retains its original words, page and disposition."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.config.settings import get_settings
from app.services.cnb.source_analysis import SourceBlock, SourceSegment
from app.services.document_workspace.evidence_review import ReviewedEvidence
from app.services.document_workspace.setup_reading import (
    SourceFindings,
    read_setup_source,
)
from app.services.document_workspace.targeted_search import (
    SourceSearchPlan,
    targeted_passages,
)


async def test_verified_native_markdown_keeps_the_physical_page_and_excludes_invented_quotes(
    monkeypatch,
):
    results = SourceFindings(
        findings=[
            {
                "key": "people",
                "support": "partial",
                "applies_to": "applicant",
                "section": 0,
                "value": "Historical population only.",
                "quote": "46 291 mieszkańców",
            },
            {
                "key": "people",
                "support": "full",
                "applies_to": "applicant",
                "section": 0,
                "value": 46291,
                "quote": "Krosno miało 46 291 mieszkańców obecnie.",
            },
            {
                "key": "people",
                "support": "full",
                "applies_to": "applicant",
                "section": 3,
                "value": 46291,
                "quote": "46 291 mieszkańców",
            },
            {
                "key": "people",
                "support": "full",
                "applies_to": "other_or_unknown",
                "section": 0,
                "value": 46291,
                "quote": "46 291 mieszkańców",
            },
        ]
    )
    reviewed = ReviewedEvidence(
        selections=[{"key": "people", "direct": [], "components": [0]}]
    )
    run = AsyncMock(side_effect=[results, reviewed])
    monkeypatch.setattr("app.services.document_workspace.setup_reading.run_agent", run)
    source = SimpleNamespace(
        source=SimpleNamespace(source_label="Development plan"),
        units=[
            SourceBlock(
                anchor="page-1/page-7/block-abc",
                text="Miasto miało 46   291\nmieszkańców w 2019 r.",
            )
        ],
    )
    values = await read_setup_source(
        [
            {
                "key": "people",
                "answer_type": "number",
                "label": "Population",
                "description": "Resident population",
            }
        ],
        source,
        scope={"municipality": {"name": "Krosno"}},
        settings=get_settings(),
        client=None,
        runner=None,
    )
    assert list(values["people"]) == [("partial", "Historical population only.")]
    (citation,) = values["people"][("partial", "Historical population only.")]
    assert (
        citation["page_number"] == 7
        and citation["source_anchor"] == "page-1/page-7/block-abc"
    )
    assert citation["quote"] == "46   291\nmieszkańców"
    assert '"index": 0' in run.await_args_list[0].kwargs["input_text"]
    assert "Krosno" in run.await_args.kwargs["input_text"]


async def test_normal_reader_keeps_profile_metadata_for_complete_local_name_repeats(
    monkeypatch,
):
    line = "Podmiot realizujący działanie: Gmina Miasto Brzozów"
    results = SourceFindings(
        findings=[
            {
                "key": "authority",
                "support": "full",
                "applies_to": "applicant",
                "section": 0,
                "value": "Gmina Miasto Brzozów",
                "quote": line,
            }
        ]
    )
    reviewed = ReviewedEvidence(
        selections=[{"key": "authority", "direct": [0], "components": []}]
    )
    invoke = AsyncMock(side_effect=[results, reviewed])
    monkeypatch.setattr(
        "app.services.document_workspace.setup_reading.run_agent", invoke
    )
    source = SimpleNamespace(
        source=SimpleNamespace(source_label="Official plan"),
        units=[
            SourceBlock(
                "page-1/page-4/block-a",
                f"Official register\n{line}\n{line}\nNext records.",
            ),
            SourceBlock(
                "page-1/page-6/block-b", f"Official register\n{line}\nNext records."
            ),
        ],
    )
    found = await read_setup_source(
        [
            {
                "key": "authority",
                "kind": "fact",
                "answer_type": "text",
                "city_field": "city.name",
                "label": "Municipality",
                "description": "Official local authority name",
            }
        ],
        source,
        scope={"municipality": {"name": "Brzozów"}},
        settings=get_settings(),
        client=None,
        runner=None,
    )
    citations = found["authority"][("full", "Gmina Miasto Brzozów")]
    assert [c["page_number"] for c in citations] == [4, 6]
    assert not citations[0].get("repeated_from_anchor")
    assert citations[1]["repeated_from_anchor"] == "page-1/page-4/block-a"
    assert invoke.await_count == 2


def test_bilingual_terms_retrieve_the_original_table_from_a_long_polish_source():
    segments = [
        SourceSegment(str(i), i, "Spis zadań i opis budżetu.") for i in range(1, 30)
    ]
    segments[24] = SourceSegment(
        "data", 25, "Właścicielem nieruchomości jest samorząd miasta."
    )
    reqs = [{"key": "ownership"}]
    plan = SourceSearchPlan(
        queries=[{"key": "ownership", "terms": ["właściciel nieruchomości"]}]
    )
    batches = targeted_passages([segments[:10], segments[10:]], reqs, plan)
    assert batches[0][0] == reqs
    assert segments[24] in batches[0][1]
    assert len(batches[0][1]) <= 2
