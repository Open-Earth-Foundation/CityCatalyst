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
    ChapterEvidenceSection,
    ChapterEvidenceSelection,
    ChapterExcerptChoice,
    ChapterTaggedExcerpt,
    ReadableExcerpt,
)
from app.persistence.concept_notes.workspace_snapshots import WorkspaceChapterSnapshot
from app.routes import concept_note_runs as runs_routes
from app.services.cnb.application_context import template_chapter_requirements
from app.services.cnb.chapter_drafting import fit_context_window
from app.services.cnb.edit_planner import build_planner_input
from app.services.cnb.source_analysis import (
    SourcePage,
    chapter_evidence_fingerprint,
    extract_chapter_evidence,
    locate_excerpt,
)
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
    """Tag cost and place sentences for the supplied chapters."""

    def __init__(self) -> None:
        self.reader_inputs: list[dict[str, Any]] = []
        self.selector_inputs: list[dict[str, Any]] = []

    async def run(self, agent: Any, input_text: str) -> Any:
        output_type = agent.output_type.output_type
        payload = json.loads(input_text)
        if output_type is ChapterEvidenceReading:
            self.reader_inputs.append(payload)
            sections = []
            for index, section in enumerate(payload["sections"]):
                excerpts = [ChapterTaggedExcerpt(text="Invented passage.", chapter_refs=["scope"])] if index == 0 else []
                if COST in section["text"]:
                    excerpts.append(ChapterTaggedExcerpt(text=COST, chapter_refs=["budget", "unknown"]))
                if PLACE in section["text"]:
                    excerpts.append(ChapterTaggedExcerpt(text=PLACE, chapter_refs=["scope", "scope"]))
                sections.append(ChapterEvidenceSection(excerpts=excerpts))
            return SimpleNamespace(final_output=ChapterEvidenceReading(sections=sections))
        assert output_type is ChapterEvidenceSelection
        self.selector_inputs.append(payload)
        return SimpleNamespace(
            final_output=ChapterEvidenceSelection(
                chapters=[
                    ChapterExcerptChoice(
                        chapter_ref="budget",
                        excerpts=[
                            ReadableExcerpt(text=COST),
                            ReadableExcerpt(text="Not a candidate."),
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


async def extract(settings, runner, *, units=None) -> Any:
    client = AsyncOpenAI(api_key="test", base_url="https://openrouter.ai/api/v1")
    try:
        return await extract_chapter_evidence(
            source_label="City plan",
            source_format="pdf",
            pages=pages() if units is None else units,
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
    assert all(payload["chapters"] == CHAPTERS for payload in runner.reader_inputs)
    assert sorted(s["page"] for p in runner.reader_inputs for s in p["sections"]) == [1, 2, 3, 4]
    by_chapter = {item.chapter_ref: item.excerpts for item in result}
    # Invented text and unknown chapters are dropped; duplicates collapse.
    assert [(e.text, e.page) for e in by_chapter["scope"]] == [(PLACE, 1)]
    assert [(e.text, e.page) for e in by_chapter["budget"]] == [(COST, 2), (COST, 3)]
    assert runner.selector_inputs == []  # every chapter is within its token budget


class ScriptedRunner(ChapterRunner):
    """Return scripted structured output while recording the input of every call."""

    def __init__(self, *readings, selection=None):
        super().__init__()
        self.readings = iter(readings)
        self.selection = selection

    async def run(self, agent: Any, input_text: str) -> Any:
        output_type = agent.output_type.output_type
        if output_type is ChapterEvidenceSelection:
            self.selector_inputs.append(json.loads(input_text))
            result = self.selection
        else:
            self.reader_inputs.append(json.loads(input_text))
            result = next(self.readings)
        assert isinstance(result, output_type)
        return SimpleNamespace(final_output=result)


def tagged(text: str, ref: str = "budget") -> ChapterTaggedExcerpt:
    return ChapterTaggedExcerpt(text=text, chapter_refs=[ref])


def reading(*excerpts: ChapterTaggedExcerpt) -> ChapterEvidenceReading:
    """One checklist entry; entry count and order never matter to locating."""
    return ChapterEvidenceReading(sections=[ChapterEvidenceSection(excerpts=list(excerpts))])


async def test_over_budget_chapter_keeps_selector_priority_then_fills_across_pages(settings):
    quotes = [f"Works cost EUR {value} million." for value in range(1, 8)]
    units = [
        SourcePage(number=1, text=" ".join([PLACE, *quotes[:3]])),
        SourcePage(number=2, text=" ".join(quotes[3:5])),
        SourcePage(number=3, text=quotes[5]),
        SourcePage(number=4, text=quotes[6]),
    ]
    generation = settings.llm.generation.prompt_budget
    budget = generation.cnb_sources
    budget.max_partition_tokens = 50000
    budget.max_chapter_excerpt_tokens = 4 * count_prompt_tokens(
        [quotes[0]], model=settings.llm.models.cnb_source_reader.name,
        fallback_encoding=generation.tokenizer_encoding,
    ).tokens
    runner = ScriptedRunner(
        reading(*[tagged(q) for q in reversed(quotes)], tagged(PLACE, "scope"), tagged("Invented passage.")),
        selection=ChapterEvidenceSelection(chapters=[
            ChapterExcerptChoice(chapter_ref="budget", excerpts=[
                ReadableExcerpt(text=q) for q in [quotes[6], quotes[5], "Not a candidate."]
            ]),
        ]),
    )
    result = await extract(settings, runner, units=units)
    [selection] = runner.selector_inputs
    assert [c["chapter_ref"] for c in selection["candidates"]] == ["budget"]
    assert "limits" not in selection
    by_chapter = {item.chapter_ref: item.excerpts for item in result}
    assert [(e.text, e.page) for e in by_chapter["budget"]] == [
        (quotes[0], 1), (quotes[3], 2), (quotes[5], 3), (quotes[6], 4),
    ]
    assert [(e.text, e.page) for e in by_chapter["scope"]] == [(PLACE, 1)]


async def test_zero_budget_keeps_verified_passages_except_same_page_containment(settings):
    budget = settings.llm.generation.prompt_budget.cnb_sources
    budget.max_chapter_excerpt_tokens = 0
    budget.max_partition_tokens = 1500
    full_cost = f"{COST} The city pays for the works."
    filler = "Background evidence. " * 120
    runner = ScriptedRunner(
        reading(tagged(COST), tagged(full_cost)),
        reading(tagged(COST)),
    )
    [chapter] = await extract(settings, runner, units=[
        SourcePage(number=1, text=f"{full_cost}\n{filler}"),
        SourcePage(number=2, text=f"{COST}\n{filler}"),
    ])
    assert [(e.text, e.page) for e in chapter.excerpts] == [(full_cost, 1), (COST, 2)]
    assert runner.selector_inputs == []


async def test_checklist_entries_are_located_by_text_regardless_of_count_or_order(settings):
    settings.llm.generation.prompt_budget.cnb_sources.max_partition_tokens = 50000
    # Two sections, one entry, page-2 quote listed first: nothing depends on position.
    runner = ScriptedRunner(reading(tagged(COST), tagged(PLACE, "scope")))
    units = [SourcePage(number=1, text=PLACE), SourcePage(number=2, text=COST)]
    result = await extract(settings, runner, units=units)

    assert len(runner.reader_inputs[0]["sections"]) == 2
    assert {c.chapter_ref: [(e.text, e.page) for e in c.excerpts] for c in result} == {
        "scope": [(PLACE, 1)], "budget": [(COST, 2)],
    }


class PunctuationRunner(ChapterRunner):
    """Return every quotation with its punctuation and spacing changed."""

    async def run(self, agent: Any, input_text: str) -> Any:
        result = await super().run(agent, input_text)
        if isinstance(result.final_output, ChapterEvidenceReading):
            result.final_output = ChapterEvidenceReading(sections=[
                ChapterEvidenceSection(excerpts=[
                    ChapterTaggedExcerpt(text=e.text.rstrip(".").replace(" is", ":  is"), chapter_refs=e.chapter_refs)
                    for e in section.excerpts
                ])
                for section in result.final_output.sections
            ])
        return result


async def test_quotations_keep_the_source_wording_and_their_real_page(settings):
    result = await extract(settings, PunctuationRunner())

    by_chapter = {item.chapter_ref: item.excerpts for item in result}
    # Located by text in the whole document; the source wording is kept, invented text dropped.
    assert [(e.text, e.page) for e in by_chapter["scope"]] == [(PLACE, 1)]
    assert {e.text for e in by_chapter["budget"]} == {COST}


def test_quotations_are_located_ignoring_punctuation_and_spacing():
    text = "Koszt: **1 275 867 730 zł**, szacunkowo; 50% z budżetu."
    units = [SourcePage(number=1, text="Wstęp."), SourcePage(number=2, text=text), SourcePage(number=3, text=text)]

    [found] = locate_excerpt("koszt 1 275 867 730 zł - szacunkowo, 50", units)
    assert (found.page, found.text) == (2, "Koszt: **1 275 867 730 zł**, szacunkowo; 50%")
    # Repeated text resolves to the partition that was read, else the first page.
    assert [e.page for e in locate_excerpt("Koszt 1 275 867 730 zł", units, prefer={"page-3"})] == [3]
    assert locate_excerpt("Koszt 1 275 867 731 zł", units) == []


def test_a_quotation_across_a_page_break_keeps_each_pages_part():
    units = [
        SourcePage(number=9, text="Zidentyfikowano ryzyka:\n\n1) brak finansowania - ryzyko poważne;\n\n9"),
        SourcePage(number=10, text="2) opóźnienia w realizacji zadań - ryzyko poważne;"),
    ]
    quote = (
        "Zidentyfikowano ryzyka:\n\n1) brak finansowania - ryzyko poważne;\n\n"
        "2) opóźnienia w realizacji zadań - ryzyko poważne;\nInvented closing line."
    )

    assert [(e.page, e.text) for e in locate_excerpt(quote, units)] == [
        (9, "Zidentyfikowano ryzyka:\n\n1) brak finansowania - ryzyko poważne;"),
        (10, "2) opóźnienia w realizacji zadań - ryzyko poważne;"),
    ]


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


@pytest.mark.parametrize(("key", "value"), [
    ("max_chapter_excerpt_tokens", 0),
    ("max_partition_tokens", 40000),
])
def test_fingerprint_follows_evidence_config(settings, key, value):
    original = chapter_evidence_fingerprint(settings, CHAPTERS)
    setattr(settings.llm.generation.prompt_budget.cnb_sources, key, value)
    assert chapter_evidence_fingerprint(settings, CHAPTERS) != original


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


def test_edit_planner_shares_every_chapters_quotations_once():
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
            # The same quotation kept for a second chapter is listed once.
            {"chapter_ref": "summary", "excerpts": [{"text": PLACE, "page": 1}]},
        ],
    }
    request = EditProposalRequest(instruction="Add the cost.", idempotency_key=uuid4())
    payload = build_planner_input(request, current, {"selected_sources": [source]})
    # A quotation kept for another chapter is evidence for this one too.
    assert payload["run_context"]["source_excerpts"] == [
        {"source_index": "1", "text": PLACE, "page": 1},
        {"source_index": "1", "text": COST, "page": None, "heading": "costs"},
    ]
    assert "source_excerpts" not in payload["chapter"]
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
