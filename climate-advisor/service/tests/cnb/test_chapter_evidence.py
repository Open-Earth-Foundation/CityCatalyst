"""Per-chapter source quotations and the context window; no live model calls."""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from app.models.cnb.concept_note_application_context import ApplicationContextTemplate
from app.models.cnb.concept_note_edits import EditProposalRequest
from app.models.cnb.source_prompt import (
    ChapterEvidenceReading,
    ChapterEvidenceSelection,
    ChapterExcerptChoice,
    ChapterSectionEvidence,
    ChapterTaggedExcerpt,
    ReadableExcerpt,
)
from app.persistence.concept_notes.workspace_snapshots import WorkspaceChapterSnapshot
from app.routes import concept_note_runs as runs_routes
from app.services.cnb.application_context import template_chapter_requirements
from app.services.cnb.chapter_drafting import (
    ChapterDraftingContextLimitError,
    fit_context_window,
)
from app.services.cnb.edit_planner import build_planner_input
from app.services.cnb.source_analysis import (
    SourceAnalysisError,
    SourceBlock,
    SourcePage,
    _chapter_quote,
    chapter_evidence_fingerprint,
    extract_chapter_evidence,
)
from app.utils.concept_note_context import fit_quotation_groups
from app.utils.prompt_budget import count_prompt_tokens
from openai import AsyncOpenAI

from app.config import get_settings

CHAPTERS = [
    {"chapter_ref": "scope", "title": "Scope", "description": None, "required_fields": ["location"]},
    {"chapter_ref": "budget", "title": "Budget", "description": "Costs.", "required_fields": ["total cost"]},
]
COST = "Total cost is EUR 5 million."
PLACE = "The works are located in Old Town."


class ChapterRunner:
    """Tag cost and place sentences; select the second cost passage when asked."""

    def __init__(self) -> None:
        self.reader_inputs: list[dict[str, Any]] = []
        self.selector_inputs: list[dict[str, Any]] = []

    async def run(self, agent: Any, input_text: str) -> Any:
        output_type = agent.output_type.output_type
        payload = json.loads(input_text)
        if output_type is ChapterEvidenceReading:
            self.reader_inputs.append(payload)
            sections = []
            for section in payload["sections"]:
                excerpts = [ChapterTaggedExcerpt(text="Invented passage.", chapter_refs=["scope"])]
                if COST in section["text"]:
                    excerpts.append(ChapterTaggedExcerpt(text=COST, chapter_refs=["budget", "unknown"]))
                if PLACE in section["text"]:
                    excerpts.append(ChapterTaggedExcerpt(text=PLACE, chapter_refs=["scope", "scope"]))
                sections.append(ChapterSectionEvidence(excerpts=excerpts))
            return SimpleNamespace(final_output=ChapterEvidenceReading(sections=sections))
        assert output_type is ChapterEvidenceSelection
        self.selector_inputs.append(payload)
        return SimpleNamespace(
            final_output=ChapterEvidenceSelection(
                chapters=[
                    ChapterExcerptChoice(
                        chapter_ref="budget",
                        excerpts=[
                            ReadableExcerpt(text=COST, page=3),
                            ReadableExcerpt(text="Not a candidate.", page=3),
                        ],
                    )
                ]
            )
        )


def pages() -> list[SourcePage]:
    filler = "Background evidence. " * 120
    return [
        SourcePage(number=1, text=f"Plan\n\n{PLACE}\n{filler}"),
        SourcePage(number=2, text=f"{COST}\n{filler}"),
        SourcePage(number=3, text=f"Again: {COST}\n{filler}"),
        SourcePage(number=4, text=filler),
    ]


@pytest.fixture
def settings():
    settings = get_settings().model_copy(deep=True)
    settings.llm.generation.prompt_budget.cnb_sources.max_partition_tokens = 1500
    return settings


async def extract(settings, runner) -> Any:
    client = AsyncOpenAI(api_key="test", base_url="https://openrouter.ai/api/v1")
    try:
        return await extract_chapter_evidence(
            source_label="City plan",
            source_format="pdf",
            pages=pages(),
            chapters=CHAPTERS,
            settings=settings,
            client=client,
            runner=runner,
        )
    finally:
        await client.close()


async def test_every_page_is_read_with_the_chapter_requirements(settings):
    runner = ChapterRunner()
    result = await extract(settings, runner)

    assert len(runner.reader_inputs) > 1  # several partitions
    discovery = [p for p in runner.reader_inputs if p["chapters"] == CHAPTERS]
    assert {s["page"] for p in discovery for s in p["sections"]} == {1, 2, 3, 4}
    focused = [p for p in runner.reader_inputs if len(p["chapters"]) == 1]
    assert sorted(p["chapters"][0]["chapter_ref"] for p in focused) == [
        "budget",
        "scope",
    ]
    by_chapter = {item.chapter_ref: item.excerpts for item in result}
    # Invented text and unknown chapters are dropped; duplicates collapse.
    assert [(e.text, e.page) for e in by_chapter["scope"]] == [(PLACE, 1)]
    assert [(e.text, e.page) for e in by_chapter["budget"]] == [(COST, 2), (COST, 3)]
    assert runner.selector_inputs == []  # every chapter is within its quota


async def test_short_document_retains_joint_discovery_and_focuses_sparse_chapters(
    settings,
):
    runner = ChapterRunner()
    settings.llm.generation.prompt_budget.cnb_sources.max_partition_tokens = 12000
    result = await extract(settings, runner)
    assert runner.reader_inputs[0]["chapters"] == CHAPTERS
    assert sorted(
        p["chapters"][0]["chapter_ref"] for p in runner.reader_inputs[1:]
    ) == ["budget", "scope"]
    assert all(
        [s["page"] for s in p["sections"]] == [1, 2, 3, 4] for p in runner.reader_inputs
    )
    assert [(c.chapter_ref, [e.text for e in c.excerpts]) for c in result] == [
        ("scope", [PLACE]),
        ("budget", [COST, COST]),
    ]


async def test_verified_quotes_survive_reordered_checklist_and_route_to_each_relevant_chapter(
    settings,
):
    records = [f"Depot {index:02} has a wave-height sensor." for index in range(12)]

    class ReorderedChecklist:
        async def run(self, agent, input_text):
            payload = json.loads(input_text)
            assert agent.output_type.output_type is ChapterEvidenceReading
            passages = [
                ChapterTaggedExcerpt(text=s["text"], chapter_refs=["scope", "budget"])
                for s in reversed(payload["sections"])
            ]
            return SimpleNamespace(
                final_output=ChapterEvidenceReading(
                    sections=[ChapterSectionEvidence(excerpts=passages)]
                )
            )

    async with AsyncOpenAI(api_key="test") as client:
        result = await extract_chapter_evidence(
            source_label="Coastal survey",
            source_format="pdf",
            chapters=CHAPTERS,
            pages=[SourcePage(i + 1, text) for i, text in enumerate(records)],
            settings=settings,
            client=client,
            runner=ReorderedChecklist(),
        )
    for chapter in result:
        assert [(e.page, e.text) for e in chapter.excerpts] == list(
            enumerate(records, 1)
        )
    assert [c.chapter_ref for c in result] == ["scope", "budget"]


def test_table_preserves_physical_labels_and_both_measurements_from_normalized_reader_quote():
    table = "Indicator     Baseline 2017     Target 2028\nFlow (m³/h)   4.2               6.5"
    section = "The following measures were adopted.\n" + table + "\nEnd of table."
    assert _chapter_quote(section, "Flow (m³/h) 4.2 6.5") == table
    assert _chapter_quote(section, "Flow (m³/h) 4.2 8.5") is None
    assert (
        _chapter_quote(section, "The following measures were adopted.")
        == section.splitlines()[0]
    )


async def test_selector_does_not_guess_between_identical_quotes_under_one_readable_heading(
    settings,
):
    class AmbiguousRunner(ChapterRunner):
        async def run(self, agent, input_text):
            if agent.output_type.output_type is ChapterEvidenceSelection:
                return SimpleNamespace(
                    final_output=ChapterEvidenceSelection(
                        chapters=[
                            ChapterExcerptChoice(
                                chapter_ref="scope",
                                excerpts=[
                                    ReadableExcerpt(text=PLACE, heading="location")
                                ],
                            )
                        ]
                    )
                )
            return await super().run(agent, input_text)

    settings.llm.generation.prompt_budget.cnb_sources.max_chapter_excerpt_tokens = (
        count_prompt_tokens(
            [PLACE],
            model=settings.llm.models.cnb_source_reader.name,
            fallback_encoding=settings.llm.generation.prompt_budget.tokenizer_encoding,
        ).tokens
    )
    async with AsyncOpenAI(api_key="test") as client:
        result = await extract_chapter_evidence(
            source_label="Plan",
            source_format="markdown",
            chapters=CHAPTERS[:1],
            pages=[
                SourceBlock("location/block-ab12", PLACE),
                SourceBlock("location/block-cd34", PLACE),
            ],
            settings=settings,
            client=client,
            runner=AmbiguousRunner(),
        )
    assert result == []


@pytest.mark.parametrize(
    "source",
    [[], [SourcePage(number=1, text="  \n")], [SourcePage(number=1, text=PLACE)]],
)
async def test_empty_source_or_empty_partitioning_is_a_controlled_source_error(
    settings, monkeypatch, source
):
    monkeypatch.setattr(
        "app.services.cnb.source_analysis.partition_source_pages", lambda *a, **kw: []
    )
    runner = ChapterRunner()
    async with AsyncOpenAI(api_key="test") as client:
        with pytest.raises(SourceAnalysisError) as error:
            await extract_chapter_evidence(
                source_label="Plan",
                source_format="pdf",
                chapters=CHAPTERS,
                pages=source,
                settings=settings,
                client=client,
                runner=runner,
            )
    assert error.value.code == "empty_source_document"
    assert runner.reader_inputs == []


async def test_oversized_chapter_request_stops_before_a_provider_call(settings):
    runner = ChapterRunner()
    chapters = [{**CHAPTERS[0], "required_fields": ["scope " * 3000]}]
    async with AsyncOpenAI(api_key="test") as client:
        with pytest.raises(SourceAnalysisError) as error:
            await extract_chapter_evidence(
                source_label="Plan",
                source_format="pdf",
                pages=pages(),
                chapters=chapters,
                settings=settings,
                client=client,
                runner=runner,
            )
    assert error.value.code == "source_partition_too_large"
    assert runner.reader_inputs == []


async def test_large_template_uses_configured_input_capacity_above_the_source_window(
    settings,
):
    runner = ChapterRunner()
    settings.llm.generation.prompt_budget.cnb_sources.max_partition_tokens = 16000
    chapter = {**CHAPTERS[0], "description": "municipal scope " * 4500}
    async with AsyncOpenAI(api_key="test") as client:
        result = await extract_chapter_evidence(
            source_label="Plan",
            source_format="pdf",
            pages=[SourcePage(1, PLACE)],
            chapters=[chapter],
            settings=settings,
            client=client,
            runner=runner,
        )
    assert result[0].excerpts[0].text == PLACE
    assert runner.reader_inputs[0]["chapters"] == [chapter]


def test_summary_only_draft_compacts_300_real_locations_without_modifying_stored_quotes(
    settings,
):
    quotes = [
        {"text": f"Source statement for location {i}. " * 12, "page": i}
        for i in range(1, 301)
    ]
    payload = {
        "run_context": {
            "source_text": {"mode": "summary"},
            "context_bundle": {"selected_sources": [{"chapter_excerpts": quotes}]},
        },
        "chapter": {"title": "Funding"},
        "source_documents": [],
    }
    settings.llm.generation.prompt_budget.cnb_sources.context_window_tokens = 4500
    fitted = fit_context_window(payload, settings)
    retained = fitted["run_context"]["context_bundle"]["selected_sources"][0][
        "chapter_excerpts"
    ]
    assert 0 < len(retained) < 300
    assert len(quotes) == 300
    assert all(q == quotes[q["page"] - 1] for q in retained)
    assert fit_context_window(fitted, settings) is fitted
    settings.llm.generation.prompt_budget.cnb_sources.context_window_tokens = 1
    with pytest.raises(ChapterDraftingContextLimitError):
        fit_context_window(payload, settings)
    assert len(quotes) == 300


def test_model_quote_budget_shares_capacity_across_groups_without_discarding_other_edit_content():
    groups = [[{"text": str(i)} for i in range(6)] for _ in range(2)]
    assert fit_quotation_groups(groups, lambda: 3 + sum(map(len, groups)), limit=7)
    assert [len(group) for group in groups] == [2, 2]
    assert not fit_quotation_groups(groups, lambda: 8 + sum(map(len, groups)), limit=7)
    assert groups == [[], []]


async def test_overfull_chapters_keep_the_selectors_choice(settings):
    token_limit = max(
        count_prompt_tokens(
            [quote],
            model=settings.llm.models.cnb_source_reader.name,
            fallback_encoding=settings.llm.generation.prompt_budget.tokenizer_encoding,
        ).tokens
        for quote in [COST, PLACE]
    )
    settings.llm.generation.prompt_budget.cnb_sources.max_chapter_excerpt_tokens = (
        token_limit
    )
    runner = ChapterRunner()
    result = await extract(settings, runner)

    [selection] = runner.selector_inputs
    assert [c["chapter_ref"] for c in selection["candidates"]] == ["budget"]
    assert selection["limits"] == {"max_excerpt_tokens_per_chapter": token_limit}
    by_chapter = {item.chapter_ref: item.excerpts for item in result}
    assert [(e.text, e.page) for e in by_chapter["budget"]] == [(COST, 3)]
    assert [(e.text, e.page) for e in by_chapter["scope"]] == [(PLACE, 1)]


def test_fingerprint_follows_template_requirements(settings):
    template = ApplicationContextTemplate(
        id=uuid4(),
        name="Template",
        chapter_schema=[
            {"chapter_ref": "scope", "title": "Scope", "required_fields": ["location"]},
            {"chapter_ref": "budget", "title": "Budget", "description": "Costs.", "required_fields": ["total cost"]},
        ],
    )
    assert template_chapter_requirements(template) == CHAPTERS
    changed = [*CHAPTERS[:1], {**CHAPTERS[1], "required_fields": ["total cost", "co-financing"]}]
    assert chapter_evidence_fingerprint(settings, CHAPTERS) != chapter_evidence_fingerprint(settings, changed)


def test_chapter_requests_over_the_window_fall_back_to_summaries(settings, monkeypatch):
    payload = {
        "run_context": {"source_text": {"mode": "full_text", "token_count": 10, "max_tokens": 350000}},
        "chapter": {"title": "Budget"},
        "source_documents": [{"source_label": "Plan", "filename": "plan.pdf", "source_format": "pdf", "text": "Long text. " * 200}],
    }
    assert fit_context_window(payload, settings) is payload
    budget = settings.llm.generation.prompt_budget.cnb_sources
    monkeypatch.setattr(budget, "context_window_tokens", 500)
    fitted = fit_context_window(payload, settings)
    assert fitted["source_documents"] == []
    assert fitted["run_context"]["source_text"]["mode"] == "summary"
    assert payload["source_documents"]  # the caller's payload is unchanged


def test_edit_planner_reads_each_chapters_own_quotations():
    current = WorkspaceChapterSnapshot(
        chapter_id=uuid4(),
        chapter_ref="budget",
        title="Budget",
        position=1,
        status="draft",
        required=True,
        user_locked=False,
        body_markdown="Body.",
        revision_number=1,
    )
    source = {
        "upload_id": str(uuid4()),
        "sha256": "a" * 64,
        "source_label": "plan.pdf",
        "summary": "Summary.",
        "topics": [],
        "key_excerpts": [],
        "chapter_excerpts": [
            {"chapter_ref": "scope", "excerpts": [{"text": PLACE, "page": 1}]},
            {"chapter_ref": "budget", "excerpts": [{"text": COST, "page": None, "anchor": "costs/block-ab12"}]},
        ],
    }
    request = EditProposalRequest(instruction="Add the cost.", idempotency_key=uuid4())
    payload = build_planner_input(request, current, {"selected_sources": [source]})
    assert payload["chapter"]["source_excerpts"] == [
        {"source_index": "1", "text": COST, "page": None, "heading": "costs"}
    ]
    assert "chapter_excerpts" not in json.dumps(payload["run_context"])


async def test_funding_change_refreshes_the_bundle(monkeypatch):
    run_id = UUID("10000000-0000-4000-8000-000000000001")
    run = SimpleNamespace(run_id=run_id)
    monkeypatch.setattr(
        runs_routes.ConceptNoteRunService, "get_authorized_run", AsyncMock(return_value=run)
    )
    monkeypatch.setattr(runs_routes, "save_funding_selection", AsyncMock(return_value="saved"))
    service = SimpleNamespace(refresh_if_stale=AsyncMock(side_effect=RuntimeError("down")))

    response = await runs_routes.update_concept_note_application_context(
        run_id=run_id,
        payload=SimpleNamespace(),
        context_bundle_service=service,
        user_id="owner",
        authorization="Bearer token-1",
        session=SimpleNamespace(),
    )

    assert response == "saved"  # a failed refresh never undoes the save
    service.refresh_if_stale.assert_awaited_once_with(user_id="owner", run_id=run_id, token="token-1")
