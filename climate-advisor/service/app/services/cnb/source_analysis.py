"""Complete PDF and native Markdown analysis for Concept Note context bundles."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from itertools import pairwise, zip_longest
from typing import Any, TypeVar, cast

from agents import (
    Agent,
    AgentOutputSchema,
    OpenAIResponsesModel,
    RunConfig,
    Runner,
)
from app.config.settings import ResearchModelConfig
from app.models.cnb.concept_note_markdown import ConceptNoteSourceFormat
from app.models.cnb.context_bundle import (
    MAX_CHAPTER_EXCERPTS,
    ChapterExcerpts,
    ChapterPartitionEvidence,
    ChapterTaggedSourceExcerpt,
    SelectedSource,
    SourceExcerpt,
    SourcePartitionMap,
    SourceQueryResult,
    SourceQuestionReading,
)
from app.models.cnb.source_prompt import (
    ChapterEvidenceReading,
    ChapterEvidenceSelection,
    DocumentMappingReading,
    DocumentSummary,
    QuestionReading,
    ReadableExcerpt,
)
from app.services.citycatalyst_client import ConceptNoteMarkdownArtifact
from app.services.cnb.source_quote_context import (
    QUOTE_CONTEXT_VERSION,
    recover_quotation_context,
)
from app.services.openrouter_client import build_openrouter_client_options
from app.utils.cnb_model_settings import cnb_model_settings
from app.utils.cnb_progress import has_cnb_progress_sink, run_with_cnb_reasoning
from app.utils.concept_note_context import (
    omit_context_identifiers,
    readable_source_heading,
)
from app.utils.prompt_budget import count_prompt_tokens
from langchain_text_splitters import RecursiveCharacterTextSplitter
from openai import AsyncOpenAI
from pydantic import BaseModel

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

PAGE_MARKER = re.compile(r"<!-- page: (\d+) -->")
PARAGRAPH_BOUNDARY = re.compile(r".*?(?:\n\s*\n|\Z)", re.DOTALL)
MARKDOWN_BLOCK_BOUNDARY = re.compile(r"\n[ \t]*\n")
MARKDOWN_HEADING = re.compile(r"^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$", re.MULTILINE)
_GLOBAL_READER_SEMAPHORE = asyncio.Semaphore(3)
MAX_QUERY_EXCERPTS = 20
MAX_QUERY_CAVEATS = 10
MAX_COVERAGE_SPLIT_DEPTH = 2
CHAPTER_READING_WINDOW_TOKENS = 8000
OutputModel = TypeVar("OutputModel", bound=BaseModel)
PartitionOutput = TypeVar(
    "PartitionOutput", SourcePartitionMap, SourceQuestionReading, ChapterPartitionEvidence
)
# The model-facing reading each partition output type is built from.
_READINGS: dict[type[BaseModel], type[BaseModel]] = {
    SourcePartitionMap: DocumentMappingReading,
    SourceQuestionReading: QuestionReading,
    ChapterPartitionEvidence: ChapterEvidenceReading,
}


class SourceAnalysisError(Exception):
    """Retryable failure to verify or completely analyze a source document."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        reason: str | None = None,
        details: dict[str, int] | None = None,
    ) -> None:
        """Keep content-free diagnostics separate from potentially private messages."""
        super().__init__(message)
        self.code = code
        self.reason = reason
        self.details = details or {}


@dataclass(frozen=True)
class SourcePage:
    """One exact page body parsed from CC-owned Markdown."""

    number: int
    text: str

    @property
    def anchor(self) -> str:
        """Return the stable locator used internally for one PDF page."""
        return f"page-{self.number}"


@dataclass(frozen=True)
class SourceBlock:
    """One native Markdown block with a deterministic heading-based anchor."""

    anchor: str
    text: str


SourceUnit = SourcePage | SourceBlock


@dataclass(frozen=True)
class SourceSegment:
    """A contiguous source slice that remains traceable to one source unit."""

    segment_id: str
    page: int | None
    text: str
    anchor: str | None = None


def source_analysis_contract_version(settings: Settings) -> str:
    """Hash every configured input that can change persisted source analysis."""
    budget = settings.llm.generation.prompt_budget.cnb_sources
    reader = settings.llm.models.cnb_source_reader
    synthesizer = settings.llm.models.cnb_source_synthesizer
    contract = {
        "quotation_context": QUOTE_CONTEXT_VERSION,
        "reader": {
            "model": reader.name,
            "reasoning_effort": reader.reasoning_effort,
            "prompt": settings.llm.prompts.get_prompt(
                "cnb_source_document_mapping"
            ),
        },
        "synthesizer": {
            "model": synthesizer.name,
            "reasoning_effort": synthesizer.reasoning_effort,
            "prompt": settings.llm.prompts.get_prompt(
                "cnb_source_summary_synthesis"
            ),
        },
        "limits": {
            "max_partition_tokens": budget.max_partition_tokens,
            "max_key_excerpts": budget.max_key_excerpts,
            "max_topics": budget.max_topics,
            "tokenizer_encoding": (
                settings.llm.generation.prompt_budget.tokenizer_encoding
            ),
        },
    }
    encoded = json.dumps(contract, sort_keys=True, ensure_ascii=False).encode()
    return hashlib.sha256(encoded).hexdigest()


def verify_source_artifact(
    *,
    artifact: ConceptNoteMarkdownArtifact,
    markdown_s3_key: str,
    sha256: str,
    source_format: ConceptNoteSourceFormat = "pdf",
    page_count: int | None,
) -> list[SourceUnit]:
    """Revalidate the immutable pointer, digest, and source-specific structure."""
    # Reject any pointer or declared metadata that changed after registration.
    if (
        artifact.markdown_s3_key != markdown_s3_key
        or artifact.sha256 != sha256
        or artifact.source_format != source_format
        or artifact.page_count != page_count
    ):
        raise SourceAnalysisError(
            "source_identity_mismatch",
            "CityCatalyst returned a different source identity",
        )
    actual_digest = hashlib.sha256(artifact.markdown.encode("utf-8")).hexdigest()
    if actual_digest != sha256:
        raise SourceAnalysisError(
            "source_digest_mismatch",
            "CityCatalyst source digest did not match the immutable pointer",
        )
    # Apply only the structural contract that belongs to this source format.
    if source_format == "pdf":
        pages = parse_source_pages(artifact.markdown)
        if len(pages) != page_count:
            raise SourceAnalysisError(
                "source_page_count_mismatch",
                "CityCatalyst source page count did not match the immutable pointer",
            )
        return pages
    return parse_markdown_blocks(artifact.markdown)


async def analyze_document(
    *,
    upload_id: Any,
    filename: str,
    source_label: str | None,
    sha256: str,
    source_format: ConceptNoteSourceFormat = "pdf",
    pages: Sequence[SourceUnit],
    settings: Settings | None = None,
    client: AsyncOpenAI | None = None,
    runner: Any = Runner,
    reader_limit: asyncio.Semaphore | None = None,
) -> SelectedSource:
    """Map every source segment and synthesize one compact selected source."""
    settings = settings or get_settings()
    client, owns_client = resolve_analysis_client(settings, client)
    budget = settings.llm.generation.prompt_budget.cnb_sources
    tokenizer_encoding = settings.llm.generation.prompt_budget.tokenizer_encoding
    reader_model = settings.llm.models.cnb_source_reader
    synthesizer_model = settings.llm.models.cnb_source_synthesizer
    reader_limit = reader_limit or asyncio.Semaphore(budget.max_concurrency)
    label = source_label or filename

    try:
        # Partition and map the complete source under the configured reader limit.
        prompt = settings.llm.prompts.get_prompt("cnb_source_document_mapping")
        partitions = await asyncio.to_thread(
            partition_source_pages,
            pages,
            prompt=prompt,
            model=reader_model.name,
            max_tokens=budget.max_partition_tokens,
            fallback_encoding=tokenizer_encoding,
            source_label=label,
        )
        partition_readings = await gather_all_or_raise(
            *(
                _read_partition(
                    name="Concept Note source partition reader",
                    partition=partition,
                    prompt=prompt,
                    output_type=SourcePartitionMap,
                    input_text=render_partition(partition, source_label=label),
                    settings=settings,
                    client=client,
                    runner=runner,
                    reader_limit=reader_limit,
                )
                for partition in partitions
            )
        )

        readings = [reading for group in partition_readings for reading in group]

        # Revalidate excerpts against exact source units before synthesis.
        unit_text = {source_unit_anchor(unit): unit.text for unit in pages}
        verified_readings = [
            reading.model_copy(
                update={"excerpts": verified_excerpts(reading.excerpts, unit_text)}
            )
            for reading in readings
        ]
        synthesis = await run_agent(
            name="Concept Note source summary synthesizer",
            prompt=settings.llm.prompts.get_prompt("cnb_source_summary_synthesis"),
            model_config=synthesizer_model,
            output_type=DocumentSummary,
            input_text=json.dumps(
                {
                    "source_label": label,
                    "source_format": source_format,
                    "unit_count": len(pages),
                    "partition_maps": [
                        omit_context_identifiers(item.model_dump(mode="json"))
                        for item in verified_readings
                    ],
                    "limits": {
                        "max_topics": budget.max_topics,
                        "max_key_excerpts": budget.max_key_excerpts,
                    },
                },
                ensure_ascii=False,
            ),
            client=client,
            runner=runner,
        )

        # Return only bounded, source-verified document context.
        return SelectedSource(
            upload_id=upload_id,
            source_label=label,
            filename=filename,
            sha256=sha256,
            source_format=source_format,
            page_count=len(pages) if source_format == "pdf" else None,
            block_count=len(pages) if source_format == "markdown" else None,
            summary=synthesis.summary,
            topics=deduplicate_strings(synthesis.topics)[: budget.max_topics],
            key_excerpts=_restore_readable_excerpts(synthesis.key_excerpts, pages)[
                : budget.max_key_excerpts
            ],
        )
    finally:
        if owns_client:
            await client.close()


def chapter_evidence_fingerprint(
    settings: Settings, chapters: Sequence[dict[str, Any]]
) -> str:
    """Hash the template requirements and every setting that shapes chapter evidence."""
    budget = settings.llm.generation.prompt_budget.cnb_sources
    reader = settings.llm.models.cnb_source_reader
    selector = settings.llm.models.cnb_source_synthesizer
    prompts = settings.llm.prompts
    contract = {
        "quotation_context": QUOTE_CONTEXT_VERSION,
        "chapters": list(chapters),
        "reader": {
            "model": reader.name,
            "reasoning_effort": reader.reasoning_effort,
            "prompt": prompts.get_prompt("cnb_source_chapter_evidence"),
        },
        "selector": {
            "model": selector.name,
            "reasoning_effort": selector.reasoning_effort,
            "prompt": prompts.get_prompt("cnb_source_chapter_evidence_selection"),
        },
        "limits": {
            "max_partition_tokens": budget.max_partition_tokens,
            "max_chapter_excerpt_tokens": budget.max_chapter_excerpt_tokens,
            "max_chapter_excerpts": MAX_CHAPTER_EXCERPTS,
            "chapter_reading_window_tokens": CHAPTER_READING_WINDOW_TOKENS,
            "tokenizer_encoding": settings.llm.generation.prompt_budget.tokenizer_encoding,
        },
    }
    encoded = json.dumps(contract, sort_keys=True, ensure_ascii=False).encode()
    return hashlib.sha256(encoded).hexdigest()


async def extract_chapter_evidence(
    *,
    source_label: str,
    source_format: ConceptNoteSourceFormat,
    pages: Sequence[SourceUnit],
    chapters: Sequence[dict[str, Any]],
    settings: Settings | None = None,
    client: AsyncOpenAI | None = None,
    runner: Any = Runner,
    reader_limit: asyncio.Semaphore | None = None,
) -> list[ChapterExcerpts]:
    """Read the whole source for each template chapter and keep a quota per chapter.

    ``chapters`` holds each chapter's ``chapter_ref``, ``title``,
    ``description``, and ``required_fields``. Every partition is read against the
    full template. Sparse chapters receive one focused reread, preserving all
    previously verified evidence for those chapters.
    """
    if not chapters:
        return []
    if not any(unit.text.strip() for unit in pages):
        raise SourceAnalysisError(
            "empty_source_document", "Chapter reading requires source text"
        )
    settings = settings or get_settings()
    budget = settings.llm.generation.prompt_budget.cnb_sources
    tokenizer_encoding = settings.llm.generation.prompt_budget.tokenizer_encoding
    reader_model = settings.llm.models.cnb_source_reader
    client, owns_client = resolve_analysis_client(settings, client)
    reader_limit = reader_limit or asyncio.Semaphore(budget.max_concurrency)
    context = {"source_label": source_label, "chapters": list(chapters)}
    try:
        # The chapter list travels with every partition, so it shares the budget.
        prompt = settings.llm.prompts.get_prompt("cnb_source_chapter_evidence")
        context_tokens = count_prompt_tokens(
            [context], model=reader_model.name, fallback_encoding=tokenizer_encoding
        ).tokens
        # Compact templates retain the same reading windows. Larger templates
        # get space for their requirements plus a bounded window of source text.
        request_limit = min(
            budget.max_partition_tokens,
            CHAPTER_READING_WINDOW_TOKENS
            + max(0, context_tokens - CHAPTER_READING_WINDOW_TOKENS // 4),
        )
        available_tokens = request_limit - context_tokens
        if available_tokens <= 0:
            raise SourceAnalysisError(
                "source_partition_too_large",
                "Chapter requirements exceed the source input limit",
            )
        partitions = await asyncio.to_thread(
            partition_source_pages,
            pages,
            prompt=prompt,
            model=reader_model.name,
            max_tokens=available_tokens,
            fallback_encoding=tokenizer_encoding,
            source_label=source_label,
        )

        async def read(
            partition: list[SourceSegment], requested: Sequence[dict[str, Any]]
        ):
            payload = _render_with_context(
                partition, {"source_label": source_label, "chapters": requested}
            )
            if (
                await asyncio.to_thread(
                    prompt_token_count,
                    prompt,
                    payload,
                    model=reader_model.name,
                    fallback_encoding=tokenizer_encoding,
                )
                > request_limit
            ):
                raise SourceAnalysisError(
                    "source_partition_too_large",
                    "Chapter request exceeds the source input limit",
                )
            return await _read_partition(
                name="Concept Note chapter evidence reader",
                partition=partition,
                prompt=prompt,
                output_type=ChapterPartitionEvidence,
                input_text=payload,
                settings=settings,
                client=client,
                runner=runner,
                reader_limit=reader_limit,
            )

        candidates = await _read_chapter_windows(partitions, chapters, read)
        unit_text = {source_unit_anchor(unit): unit.text for unit in pages}
        candidates = await asyncio.to_thread(
            lambda: {
                ref: contextualize_source_excerpts(items, unit_text)
                for ref, items in candidates.items()
            }
        )

        unit_order = {anchor: index for index, anchor in enumerate(unit_text)}
        candidates = {
            ref: _ordered_chapter_excerpts(items, unit_text, unit_order)
            for ref, items in candidates.items()
        }
        token_limit = budget.max_chapter_excerpt_tokens

        def quote_costs():
            return {
                text: count_prompt_tokens(
                    [text],
                    model=reader_model.name,
                    fallback_encoding=tokenizer_encoding,
                ).tokens
                for text in {
                    item.text for items in candidates.values() for item in items
                }
            }

        costs = await asyncio.to_thread(quote_costs)
        overfull = {
            ref: items
            for ref, items in candidates.items()
            if (token_limit and sum(costs[item.text] for item in items) > token_limit)
            or len(items) > MAX_CHAPTER_EXCERPTS
        }
        if overfull:
            chosen, ambiguous = await _select_chapter_excerpts(
                source_label=source_label,
                source_format=source_format,
                chapters=[c for c in chapters if c["chapter_ref"] in overfull],
                overfull=overfull,
                settings=settings,
                client=client,
                runner=runner,
            )
            for ref, items in overfull.items():
                priorities = chosen.get(ref, [])
                blocked = ambiguous.get(ref, set())
                eligible = [
                    item
                    for item in items
                    if (excerpt_source_anchor(item), item.text) not in blocked
                ]
                candidates[ref] = _fill_chapter_budget(
                    eligible,
                    priorities,
                    costs,
                    token_limit or sum(costs[item.text] for item in eligible),
                )
        return [
            ChapterExcerpts(chapter_ref=ref, excerpts=items)
            for ref, items in candidates.items()
            if items
        ]
    finally:
        if owns_client:
            await client.close()


def _group_chapter_quotes(
    readings: list[ChapterPartitionEvidence],
) -> dict[str, list[SourceExcerpt]]:
    by_ref: dict[str, list[SourceExcerpt]] = {}
    for reading in readings:
        for excerpt in reading.excerpts:
            quote = SourceExcerpt(
                text=excerpt.text, page=excerpt.page, anchor=excerpt.anchor
            )
            for ref in set(excerpt.chapter_refs):
                by_ref.setdefault(ref, []).append(quote)
    return by_ref


def _chapter_focus_windows(
    partitions: list[list[SourceSegment]],
    discoveries: list[dict[str, list[SourceExcerpt]]],
    chapters: Sequence[dict[str, Any]],
) -> list[int]:
    """Prefer verified semantic hits, using chapter vocabulary to break ties."""
    texts = [
        " ".join(segment.text for segment in partition).casefold()
        for partition in partitions
    ]
    indices = []
    for chapter in chapters:
        ref = chapter["chapter_ref"]
        description = json.dumps(
            [chapter.get(key) for key in ("title", "description", "required_fields")],
            ensure_ascii=False,
        )
        terms = set(re.findall(r"\w{4,}", description.casefold()))
        scores = [
            (
                len({quote.text for quote in discovery.get(ref, [])}),
                sum(term in text for term in terms),
            )
            for discovery, text in zip(discoveries, texts, strict=True)
        ]
        indices.append(max(range(len(scores)), key=scores.__getitem__))
    return indices


async def _read_chapter_windows(
    partitions: list[list[SourceSegment]],
    chapters: Sequence[dict[str, Any]],
    read: Callable[
        [list[SourceSegment], Sequence[dict[str, Any]]],
        Awaitable[list[ChapterPartitionEvidence]],
    ],
) -> dict[str, list[SourceExcerpt]]:
    """Discover across every source partition and reread one focused window per chapter."""
    if not partitions:
        raise SourceAnalysisError(
            "empty_source_document", "Chapter reading requires a source partition"
        )
    broader = await gather_all_or_raise(
        *(read(partition, chapters) for partition in partitions)
    )
    discoveries = [_group_chapter_quotes(group) for group in broader]
    # Some evidence meets several chapter requirements. Keep those connections
    # even if a subsequent focused pass happens to select different passages.
    sparse = [
        chapter
        for chapter in chapters
        if len(chapters) > 1
        and len(
            {
                q.text
                for found in discoveries
                for q in found.get(chapter["chapter_ref"], [])
            }
        )
        < max(2, len(chapter.get("required_fields") or []))
    ]
    indices = await asyncio.to_thread(
        _chapter_focus_windows, partitions, discoveries, sparse
    )
    selected = list(zip(sparse, indices, strict=True))
    focused = await gather_all_or_raise(
        *(read(partitions[index], [chapter]) for chapter, index in selected)
    )
    for (chapter, index), readings in zip(selected, focused, strict=True):
        ref = chapter["chapter_ref"]
        discoveries[index].setdefault(ref, []).extend(
            _group_chapter_quotes(readings).get(ref, [])
        )
    return {
        ref: [quote for discovery in discoveries for quote in discovery.get(ref, [])]
        for ref in (chapter["chapter_ref"] for chapter in chapters)
    }


def _ordered_chapter_excerpts(
    items: list[SourceExcerpt], unit_text: dict[str, str], unit_order: dict[str, int]
) -> list[SourceExcerpt]:
    """Keep maximal passages within each page or Markdown block, in source order."""
    by_unit: dict[str, list[SourceExcerpt]] = {}
    for item in items:
        by_unit.setdefault(excerpt_source_anchor(item), []).append(item)

    ordered = []
    for anchor in sorted(by_unit, key=unit_order.__getitem__):
        maximal: list[SourceExcerpt] = []
        for item in sorted(by_unit[anchor], key=lambda item: -len(item.text)):
            if not any(item.text in longer.text for longer in maximal):
                maximal.append(item)
        ordered.extend(
            sorted(maximal, key=lambda item: unit_text[anchor].index(item.text))
        )
    return ordered


def _fill_chapter_budget(
    items: list[SourceExcerpt],
    chosen: list[SourceExcerpt],
    costs: dict[str, int],
    limit: int,
) -> list[SourceExcerpt]:
    """Pack selector choices first, then take one remaining excerpt per page per turn."""
    by_unit: dict[str, list[int]] = {}
    positions = {
        (excerpt_source_anchor(item), item.text): index
        for index, item in enumerate(items)
    }
    priority = [positions[excerpt_source_anchor(item), item.text] for item in chosen]
    chosen_positions = set(priority)
    for index, item in enumerate(items):
        if index not in chosen_positions:
            by_unit.setdefault(excerpt_source_anchor(item), []).append(index)
    for turn in zip_longest(*by_unit.values()):
        priority.extend(index for index in turn if index is not None)

    retained = []
    for index in priority:
        cost = costs[items[index].text]
        if cost <= limit:
            retained.append(index)
            limit -= cost
        if len(retained) == MAX_CHAPTER_EXCERPTS:
            break
    return [items[index] for index in sorted(retained)]


async def _select_chapter_excerpts(
    *,
    source_label: str,
    source_format: ConceptNoteSourceFormat,
    chapters: list[dict[str, Any]],
    overfull: dict[str, list[SourceExcerpt]],
    settings: Settings,
    client: AsyncOpenAI,
    runner: Any,
) -> tuple[dict[str, list[SourceExcerpt]], dict[str, set[tuple[str, str]]]]:
    """Resolve selector priorities and exclude candidates whose location was ambiguous.

    A chapter whose choice cannot be matched to its own candidates keeps its
    candidates in document order.
    """
    budget = settings.llm.generation.prompt_budget
    quota = MAX_CHAPTER_EXCERPTS
    model = settings.llm.models.cnb_source_synthesizer
    prompt = settings.llm.prompts.get_prompt("cnb_source_chapter_evidence_selection")
    payload = json.dumps(
        {
            "source_label": source_label,
            "source_format": source_format,
            "chapters": chapters,
            "candidates": [
                {
                    "chapter_ref": ref,
                    "excerpts": [
                        omit_context_identifiers(e.model_dump(mode="json"))
                        for e in items
                    ],
                }
                for ref, items in overfull.items()
            ],
            "limits": {
                "max_excerpt_tokens_per_chapter": budget.cnb_sources.max_chapter_excerpt_tokens
            },
        },
        ensure_ascii=False,
    )
    if (
        await asyncio.to_thread(
            prompt_token_count,
            prompt,
            payload,
            model=model.name,
            fallback_encoding=budget.tokenizer_encoding,
        )
        > budget.cnb_sources.max_partition_tokens
    ):
        # Tiny custom limits and long sources can exceed the selector budget.
        # The caller retains its already verified candidates in source order.
        return {}, {}
    selection = await run_agent(
        name="Concept Note chapter evidence selector",
        prompt=prompt,
        model_config=model,
        output_type=ChapterEvidenceSelection,
        input_text=payload,
        client=client,
        runner=runner,
    )
    chosen: dict[str, list[SourceExcerpt]] = {}
    ambiguous: dict[str, set[tuple[str, str]]] = {}
    for choice in selection.chapters:
        restored = []
        available = overfull.get(choice.chapter_ref, [])
        for requested in choice.excerpts:
            matches = _matching_chapter_quotes(requested, available)
            if len(matches) > 1:
                # Identical text under the same readable heading can originate
                # from two distinct Markdown blocks. Never attach either anchor.
                ambiguous.setdefault(choice.chapter_ref, set()).update(
                    (excerpt_source_anchor(item), item.text) for item in matches
                )
            elif matches and matches[0] not in restored:
                restored.append(matches[0])
        if restored:
            chosen[choice.chapter_ref] = restored[:quota]
    for ref, priorities in chosen.items():
        ambiguous.get(ref, set()).difference_update(
            (excerpt_source_anchor(item), item.text) for item in priorities
        )
    return chosen, ambiguous


def _matching_chapter_quotes(
    requested: ReadableExcerpt, available: Sequence[SourceExcerpt]
) -> list[SourceExcerpt]:
    normalized = " ".join(requested.text.split())
    matches = [
        quote
        for quote in available
        if quote.page == requested.page
        and (readable_source_heading(quote.anchor) if quote.anchor else None)
        == requested.heading
        and " ".join(quote.text.split()) == normalized
    ]
    return [quote for quote in matches if quote.text == requested.text] or matches


async def query_document(
    *,
    upload_id: Any,
    source_label: str,
    question: str,
    source_format: ConceptNoteSourceFormat = "pdf",
    pages: Sequence[SourceUnit],
    settings: Settings | None = None,
    client: AsyncOpenAI | None = None,
    runner: Any = Runner,
    reader_limit: asyncio.Semaphore | None = None,
) -> SourceQueryResult:
    """Read every source unit and return verified evidence for one question."""
    settings = settings or get_settings()
    budget = settings.llm.generation.prompt_budget.cnb_sources
    normalized_question = question.strip()
    if not normalized_question:
        raise SourceAnalysisError("invalid_source_question", "Question is required")
    if len(normalized_question) > budget.max_question_chars:
        raise SourceAnalysisError(
            "source_question_too_long",
            "Question exceeds the configured source-query limit",
        )

    client, owns_client = resolve_analysis_client(settings, client)
    tokenizer_encoding = settings.llm.generation.prompt_budget.tokenizer_encoding
    reader_model = settings.llm.models.cnb_source_reader
    reader_limit = reader_limit or asyncio.Semaphore(budget.max_concurrency)

    try:
        # Partition and search the entire source for the bounded question.
        prompt = settings.llm.prompts.get_prompt("cnb_source_question_reading")
        partitions = await asyncio.to_thread(
            partition_source_pages,
            pages,
            prompt=prompt,
            model=reader_model.name,
            max_tokens=budget.max_partition_tokens,
            fallback_encoding=tokenizer_encoding,
            question=normalized_question,
        )
        partition_readings = await gather_all_or_raise(
            *(
                _read_partition(
                    name="Concept Note question-focused source reader",
                    partition=partition,
                    prompt=prompt,
                    output_type=SourceQuestionReading,
                    input_text=render_partition(
                        partition,
                        question=normalized_question,
                    ),
                    settings=settings,
                    client=client,
                    runner=runner,
                    reader_limit=reader_limit,
                )
                for partition in partitions
            )
        )

        readings = [reading for group in partition_readings for reading in group]

        # Validate and bound all evidence before returning it to the caller.
        unit_text = {source_unit_anchor(unit): unit.text for unit in pages}
        evidence: list[SourceExcerpt] = []
        caveats: list[str] = []
        for reading in readings:
            evidence.extend(reading.excerpts)
            caveats.extend(reading.caveats)
        units_processed = len(
            {
                segment_source_anchor(segment)
                for partition in partitions
                for segment in partition
            }
        )
        segments_processed = sum(len(partition) for partition in partitions)
        final_excerpts = verified_excerpts(evidence, unit_text)[:MAX_QUERY_EXCERPTS]
        final_caveats = deduplicate_strings(caveats)[:MAX_QUERY_CAVEATS]

        # Preserve coverage counts so the main agent can distinguish absence from omission.
        return SourceQueryResult(
            found=bool(final_excerpts),
            upload_id=upload_id,
            source_label=source_label,
            source_format=source_format,
            excerpts=final_excerpts,
            units_processed=units_processed,
            units_total=len(pages),
            segments_processed=segments_processed,
            segments_total=segments_processed,
            caveats=final_caveats,
        )
    finally:
        if owns_client:
            await client.close()


def resolve_analysis_client(
    settings: Settings,
    client: AsyncOpenAI | None,
) -> tuple[AsyncOpenAI, bool]:
    """Return an injected client or create one that the caller must close."""
    if client is not None:
        return client, False
    try:
        options = build_openrouter_client_options(
            settings,
            missing_api_key_message=(
                "OpenRouter API key is required for Concept Note source analysis"
            ),
        )
    except ValueError as exc:
        raise SourceAnalysisError("source_analysis_unavailable", str(exc)) from exc
    return AsyncOpenAI(**options.kwargs), True


async def _read_partition(
    *,
    name: str,
    partition: Sequence[SourceSegment],
    prompt: str,
    output_type: type[PartitionOutput],
    input_text: str,
    settings: Settings,
    client: AsyncOpenAI,
    runner: Any,
    reader_limit: asyncio.Semaphore,
    split_depth: int = 0,
) -> list[PartitionOutput]:
    """Read all sections, bisecting incomplete groups at most twice before failing."""
    async with reader_limit, _GLOBAL_READER_SEMAPHORE:
        result = await run_agent(
            name=name,
            prompt=prompt,
            model_config=settings.llm.models.cnb_source_reader,
            output_type=_READINGS[output_type],
            input_text=input_text,
            client=client,
            runner=runner,
            expected_sections=None
            if output_type is ChapterPartitionEvidence
            else len(partition),
        )
    if output_type is ChapterPartitionEvidence:
        # The position of a checklist entry cannot establish a page or heading.
        # Locate every quote against the exact partition the reader received.
        tagged = await asyncio.to_thread(_locate_chapter_quotes, partition, result)
        return [
            ChapterPartitionEvidence(
                excerpts=tagged, covered_segment_ids=[s.segment_id for s in partition]
            )
        ]
    if len(result.sections) != len(partition):
        # Never guess which section was skipped: discard the incomplete response
        # and reread both halves. Release reader permits before scheduling children.
        if len(partition) > 1 and split_depth < MAX_COVERAGE_SPLIT_DEPTH:
            logger.warning(
                "Retrying incomplete source coverage expected_sections=%s returned_sections=%s split_depth=%s",
                len(partition),
                len(result.sections),
                split_depth,
            )
            payload = json.loads(input_text)
            midpoint = len(partition) // 2
            groups = await gather_all_or_raise(
                *(
                    _read_partition(
                        name=name,
                        partition=group,
                        prompt=prompt,
                        output_type=output_type,
                        input_text=_render_with_context(group, payload),
                        settings=settings,
                        client=client,
                        runner=runner,
                        reader_limit=reader_limit,
                        split_depth=split_depth + 1,
                    )
                    for group in (partition[:midpoint], partition[midpoint:])
                )
            )
            return [reading for group in groups for reading in group]
        raise SourceAnalysisError(
            "incomplete_source_coverage",
            "Reader must return every supplied section in order",
            reason="reader_section_count_mismatch",
            details={
                "expected_sections": len(partition),
                "returned_sections": len(result.sections),
            },
        )
    # Match evidence to the exact section; the model never chooses an internal locator.
    covered = [s.segment_id for s in partition]
    excerpts = []
    caveats = []
    for segment, reading in zip(partition, result.sections, strict=True):
        excerpts.extend(
            SourceExcerpt(text=text, page=segment.page, anchor=segment.anchor)
            for text in reading.excerpts
            if text and text in segment.text
        )
        caveats.extend(reading.caveats)
    values = {"excerpts": excerpts[:20], "covered_segment_ids": covered}
    if output_type is SourcePartitionMap:
        values.update(summary=result.summary, topics=result.topics)
    else:
        values["caveats"] = deduplicate_strings(caveats)[:10]
    return [output_type.model_validate(values)]


def _chapter_layout_text(text: str) -> tuple[str, list[int]]:
    """Ignore layout punctuation while keeping the meaning of signed numeric values."""
    letters = []
    offsets = []
    for i, char in enumerate(text):
        numeric_separator = (
            char in ".,"
            and 0 < i < len(text) - 1
            and text[i - 1].isdigit()
            and text[i + 1].isdigit()
        )
        signed_number = char in "+-−" and i + 1 < len(text) and text[i + 1].isdigit()
        if char.isalnum() or char in "%‰±" or numeric_separator or signed_number:
            folded = char.casefold()
            letters.append(folded)
            offsets.extend([i] * len(folded))
    return "".join(letters), offsets


def _matching_section_texts(
    quote: str,
    indexed: Sequence[tuple[SourceSegment, tuple[str, list[int]]]],
) -> list[tuple[SourceSegment, str]]:
    """Restore the quotation where it really occurs; tolerate uniquely locatable OCR layout."""
    strict = [
        (s, original) for s, _ in indexed if (original := _chapter_quote(s.text, quote))
    ]
    if strict:
        return strict
    needle, _ = _chapter_layout_text(quote)
    if len(needle) < 8:
        return []
    recovered = []
    for section, (haystack, positions) in indexed:
        index = haystack.find(needle)
        if index < 0:
            continue
        start, end = positions[index], positions[index + len(needle) - 1] + 1
        # Reject a partial word or number (e.g. 5 as a substring of 15).
        if (start and section.text[start - 1].isalnum()) or (
            end < len(section.text) and section.text[end].isalnum()
        ):
            continue
        while end < len(section.text) and not section.text[end].isspace():
            end += 1
        original = _chapter_quote(section.text, section.text[start:end])
        if original:
            recovered.append((section, original))
    # Distinct source locations cannot be inferred from a tolerant match.
    return recovered if len(recovered) == 1 else []


def _locate_chapter_quotes(
    partition: Sequence[SourceSegment], reading: ChapterEvidenceReading
) -> list[ChapterTaggedSourceExcerpt]:
    indexed = [(section, _chapter_layout_text(section.text)) for section in partition]

    tagged = []
    for group in reading.sections:
        for excerpt in group.excerpts:
            found = _matching_section_texts(excerpt.text, indexed)
            if not found:
                # Preserve individually locatable table rows/qualifiers from a
                # cross-page quote. Never manufacture a single combined citation.
                lines = excerpt.text.splitlines()
                if len(lines) > 1:
                    found = [
                        item
                        for line in lines
                        if len(_chapter_layout_text(line)[0]) >= 8
                        for item in _matching_section_texts(line, indexed)
                    ]
            for section, original in found:
                tagged.append(
                    ChapterTaggedSourceExcerpt(
                        text=original,
                        chapter_refs=excerpt.chapter_refs,
                        page=section.page,
                        anchor=section.anchor,
                    )
                )
    return tagged


def _chapter_quote(section: str, quote: str) -> str | None:
    """Recover exact source whitespace and the labels governing a quoted table value."""
    quote = quote.strip()
    if not quote:
        return None
    start = section.find(quote)
    ends_word = (
        start >= 0
        and start + len(quote) < len(section)
        and section[start + len(quote)].isalnum()
        and quote[-1].isalnum()
    )
    starts_word = start > 0 and section[start - 1].isalnum() and quote[0].isalnum()
    if start < 0 or starts_word or ends_word:
        pattern = r"\s+".join(re.escape(word) for word in quote.split())
        if quote[0].isalnum():
            pattern = r"(?<!\w)" + pattern
        if quote[-1].isalnum():
            pattern += r"(?!\w)"
        match = re.search(pattern, section)
        if match is None:
            return None
        start, quote = match.start(), match.group()
    if len(quote) > 4000:
        return None
    if not any(ch.isdigit() for ch in quote):
        return quote
    return _table_quote(section, start, quote)


def _table_quote(section: str, start: int, quote: str) -> str:
    """Expand numeric cells to interpretable labels within the original source."""
    end = start + len(quote)
    # A numeric cell is not interpretable without its row and column labels.
    # Keep a compact *contiguous* source table, in the original page or block.
    first = section.rfind("\n", 0, start) + 1
    line_end = section.find("\n", end)
    last = len(section) if line_end < 0 else line_end

    def is_table_line(line: str) -> bool:
        line = line.strip()
        return (
            line.count("|") >= 2
            or "\t" in line
            or re.search(r"\S {2,}\S", line) is not None
        )

    if not is_table_line(section[first:last]):
        return quote
    row = section[first:last].strip()
    row_fallback = row if len(row) <= 4000 else quote
    while first > 0:
        previous = section.rfind("\n", 0, first - 1) + 1
        if not is_table_line(section[previous : first - 1]):
            break
        first = previous
        if last - first > 4000:
            return row_fallback
    while last < len(section):
        following = section.find("\n", last + 1)
        following = len(section) if following < 0 else following
        if not is_table_line(section[last + 1 : following]):
            break
        last = following
        if last - first > 4000:
            return row_fallback
    table = section[first:last].strip()
    if len(table) <= 4000:
        return table
    return row_fallback


def _restore_readable_excerpts(
    excerpts: Sequence[ReadableExcerpt], pages: Sequence[SourceUnit]
) -> list[SourceExcerpt]:
    """Resolve readable citations to verified backend locations without guessing."""
    restored = []
    for excerpt in excerpts:
        matches = []
        for unit in pages:
            matches_location = (
                isinstance(unit, SourcePage)
                and excerpt.page == unit.number
                and excerpt.heading is None
            ) or (
                isinstance(unit, SourceBlock)
                and excerpt.page is None
                and excerpt.heading == readable_source_heading(unit.anchor)
            )
            if matches_location and excerpt.text in unit.text:
                matches.append(unit)
        if len(matches) == 1:
            unit = matches[0]
            restored.append(
                SourceExcerpt(
                    text=excerpt.text,
                    page=source_unit_page(unit),
                    anchor=unit.anchor if isinstance(unit, SourceBlock) else None,
                )
            )
    return contextualize_source_excerpts(
        restored, {source_unit_anchor(unit): unit.text for unit in pages}
    )


def contextualize_source_excerpts(
    excerpts: Sequence[SourceExcerpt], unit_text: dict[str, str]
) -> list[SourceExcerpt]:
    """Normalize selected quotations on their original page or Markdown block.

    Saved readings can use the same SourceExcerpt model and mapping from
    source_unit_anchor to the original unit text, without invoking a model.
    """
    contextual = []
    for item in verified_excerpts(excerpts, unit_text):
        section = unit_text[excerpt_source_anchor(item)]
        quote = recover_quotation_context(section, item.text)
        contextual.append(
            item.model_copy(update={"text": quote}) if quote != item.text else item
        )
    # Preserve the model's priority order for key excerpts. Several fragments
    # of a sentence can become the same evidence after their context is restored.
    contextual = verified_excerpts(contextual, unit_text)
    by_unit: dict[str, list[str]] = {}
    for item in contextual:
        by_unit.setdefault(excerpt_source_anchor(item), []).append(item.text)
    return [
        item
        for item in contextual
        if not any(
            len(other) > len(item.text) and item.text in other
            for other in by_unit[excerpt_source_anchor(item)]
        )
    ]


async def run_agent(
    *,
    name: str,
    prompt: str,
    model_config: ResearchModelConfig,
    output_type: type[OutputModel],
    input_text: str,
    client: AsyncOpenAI,
    runner: Any,
    expected_sections: int | None = None,
) -> OutputModel:
    """Run one tool-free worker with its configured model and reasoning effort."""
    # Constrain the provider's array length as well as checking coverage in code.
    # Local validation keeps the base model so count errors retain our diagnostic
    # and bounded recovery path even if a provider ignores the schema constraint.
    output_schema = AgentOutputSchema(output_type)
    if expected_sections is not None:
        output_schema.json_schema()["properties"]["sections"].update(
            minItems=expected_sections,
            maxItems=expected_sections,
        )
    # Select reasoning by worker role even when both roles share one model.
    agent = Agent(
        name=name,
        instructions=prompt,
        model=OpenAIResponsesModel(
            model=model_config.name,
            openai_client=client,
        ),
        model_settings=cnb_model_settings(model_config.reasoning_effort),
        output_type=output_schema,
        tools=[],
    )
    try:
        if has_cnb_progress_sink():
            run_result = await run_with_cnb_reasoning(
                runner,
                agent,
                input_text,
                run_config=RunConfig(
                    tracing_disabled=True, trace_include_sensitive_data=False
                ),
                stage="reading",
            )
            return output_type.model_validate(run_result.final_output)
        try:
            run_result = await runner.run(
                agent,
                input_text,
                run_config=RunConfig(
                    tracing_disabled=True, trace_include_sensitive_data=False
                ),
            )
        except TypeError as exc:
            # Test and adapter runners may deliberately expose only the stable
            # two-argument Runner surface. They remain responsible for their
            # own tracing policy when they do not accept a RunConfig.
            if "unexpected keyword argument 'run_config'" not in str(exc):
                raise
            run_result = await runner.run(agent, input_text)
        return output_type.model_validate(run_result.final_output)
    except SourceAnalysisError:
        raise
    except Exception as exc:
        logger.warning("Concept Note source agent failed: %s", name)
        raise SourceAnalysisError("source_analysis_failed", f"{name} failed") from exc


def parse_source_pages(markdown: str) -> list[SourcePage]:
    """Parse a complete, contiguous one-based page-marker sequence."""
    matches = list(PAGE_MARKER.finditer(markdown))
    if not matches or markdown[: matches[0].start()].strip():
        raise SourceAnalysisError(
            "invalid_source_pages",
            "Source Markdown must start with page marker 1",
        )
    pages: list[SourcePage] = []
    for index, marker in enumerate(matches, start=1):
        if int(marker.group(1)) != index:
            raise SourceAnalysisError(
                "invalid_source_pages",
                "Source Markdown page markers must be contiguous",
            )
        end = matches[index].start() if index < len(matches) else len(markdown)
        pages.append(SourcePage(number=index, text=markdown[marker.end() : end]))
    return pages


def render_source_text(units: Sequence[SourceUnit]) -> str:
    """Rebuild verified source text, restoring PDF page markers for citation."""
    return "".join(
        f"<!-- page: {unit.number} -->{unit.text}"
        if isinstance(unit, SourcePage)
        else unit.text
        for unit in units
    )


def parse_markdown_blocks(markdown: str) -> list[SourceBlock]:
    """Split native Markdown losslessly into deterministically anchored blocks."""
    if not markdown.strip():
        raise SourceAnalysisError(
            "empty_source_document",
            "Native Markdown source did not contain any text",
        )

    # Split at headings and paragraph ends while preserving every source byte.
    cuts = {0, len(markdown)}
    cuts.update(match.end() for match in MARKDOWN_BLOCK_BOUNDARY.finditer(markdown))
    cuts.update(match.start() for match in MARKDOWN_HEADING.finditer(markdown))
    ordered_cuts = sorted(cuts)
    raw_blocks = [
        markdown[start:end] for start, end in pairwise(ordered_cuts) if start < end
    ]

    # Attach whitespace-only slices so block text still reconstructs the source.
    block_texts: list[str] = []
    pending_prefix = ""
    for raw_block in raw_blocks:
        if not raw_block.strip():
            pending_prefix += raw_block
            continue
        if pending_prefix:
            if block_texts:
                block_texts[-1] += pending_prefix
            else:
                raw_block = pending_prefix + raw_block
            pending_prefix = ""
        block_texts.append(raw_block)
    if pending_prefix and block_texts:
        block_texts[-1] += pending_prefix
    if not block_texts or "".join(block_texts) != markdown:
        raise SourceAnalysisError(
            "incomplete_source_coverage",
            "Native Markdown could not be partitioned without loss",
            reason="markdown_partition_text_loss",
        )

    # Build anchors from the active heading path plus an immutable block digest.
    heading_path: list[str] = []
    anchor_counts: dict[str, int] = {}
    blocks: list[SourceBlock] = []
    for block_text in block_texts:
        for heading in MARKDOWN_HEADING.finditer(block_text):
            level = len(heading.group(1))
            slug = markdown_heading_slug(heading.group(2))
            heading_path = [*heading_path[: level - 1], slug]
        heading_anchor = "/".join(heading_path) or "document"
        digest = hashlib.sha256(block_text.encode("utf-8")).hexdigest()[:12]
        base_anchor = f"{heading_anchor[:200]}/block-{digest}"
        occurrence = anchor_counts.get(base_anchor, 0) + 1
        anchor_counts[base_anchor] = occurrence
        anchor = base_anchor if occurrence == 1 else f"{base_anchor}-{occurrence}"
        blocks.append(SourceBlock(anchor=anchor, text=block_text))
    return blocks


def markdown_heading_slug(value: str) -> str:
    """Return a readable deterministic slug for one Markdown heading."""
    normalized = re.sub(r"[^\w]+", "-", value.casefold(), flags=re.UNICODE)
    return normalized.strip("-")[:64] or "section"


def source_unit_anchor(unit: SourceUnit) -> str:
    """Return the exact lookup anchor for a PDF page or Markdown block."""
    return unit.anchor


def source_unit_page(unit: SourceUnit) -> int | None:
    """Return a PDF page number, or None for native Markdown."""
    return unit.number if isinstance(unit, SourcePage) else None


def segment_source_anchor(segment: SourceSegment) -> str:
    """Return the lookup anchor retained by a partition segment."""
    return segment.anchor or f"page-{segment.page}"


def excerpt_source_anchor(excerpt: SourceExcerpt) -> str:
    """Return the lookup anchor declared by an analyzed excerpt."""
    return excerpt.anchor or f"page-{excerpt.page}"


def partition_source_pages(
    pages: Sequence[SourceUnit],
    *,
    prompt: str,
    model: str,
    max_tokens: int,
    fallback_encoding: str,
    question: str | None = None,
    source_label: str | None = None,
) -> list[list[SourceSegment]]:
    """Create ordered partitions without dropping or reordering source text."""
    segments: list[SourceSegment] = []
    for page in pages:
        page_segments = split_page(
            page,
            prompt=prompt,
            model=model,
            max_tokens=max_tokens,
            fallback_encoding=fallback_encoding,
            question=question,
            source_label=source_label,
        )
        if "".join(segment.text for segment in page_segments) != page.text:
            raise SourceAnalysisError(
                "incomplete_source_coverage",
                f"Source unit {source_unit_anchor(page)} could not be partitioned without loss",
                reason="source_partition_text_loss",
            )
        segments.extend(page_segments)

    if not segments:
        raise SourceAnalysisError(
            "empty_source_document",
            "Source document did not contain any analyzable units",
        )

    def fits(start: int, end: int) -> bool:
        """Check the exact serialized request with the configured model tokenizer."""
        text = render_partition(
            segments[start:end], source_label=source_label, question=question
        )
        return prompt_token_count(
            prompt, text, model=model, fallback_encoding=fallback_encoding
        ) <= max_tokens

    # Each additional JSON section adds its own heading or page and text. Locate the
    # first full partition without re-encoding every progressively longer prefix.
    partitions: list[list[SourceSegment]] = []
    start = 0
    while start < len(segments):
        end = start + 1
        if not fits(start, end):
            raise SourceAnalysisError(
                "source_partition_too_large",
                f"Source segment {segments[start].segment_id} exceeds the token limit",
            )
        while end < len(segments):
            probe = min(len(segments), start + 2 * (end - start))
            if fits(start, probe):
                end = probe
                continue
            # The last passing boundary is end. Probe only complete source sections.
            high = probe
            while end + 1 < high:
                middle = (end + high) // 2
                if fits(start, middle):
                    end = middle
                else:
                    high = middle
            break
        partitions.append(segments[start:end])
        start = end
    return partitions


def split_page(
    page: SourceUnit,
    *,
    prompt: str,
    model: str,
    max_tokens: int,
    fallback_encoding: str,
    question: str | None,
    source_label: str | None = None,
) -> list[SourceSegment]:
    """Split one oversized source unit at paragraph boundaries, then offsets."""

    def fits_budget(segment: SourceSegment) -> bool:
        text = render_partition(
            [segment], source_label=source_label, question=question
        )
        # A byte-pair token consumes at least one UTF-8 byte. Most individual
        # Markdown paragraphs are short enough to guarantee a fit without encoding.
        if len(prompt.encode("utf-8")) + 1 + len(text.encode("utf-8")) <= max_tokens:
            return True
        return (
            prompt_token_count(
                prompt,
                text,
                model=model,
                fallback_encoding=fallback_encoding,
            )
            <= max_tokens
        )

    page_number = source_unit_page(page)
    anchor = None if page_number is not None else source_unit_anchor(page)
    segment_prefix = f"p{page_number}" if page_number is not None else anchor
    whole = SourceSegment(
        segment_id=f"{segment_prefix}-s1",
        page=page_number,
        text=page.text,
        anchor=anchor,
    )
    if fits_budget(whole):
        return [whole]

    chunks: list[str] = []
    pending = ""
    for match in PARAGRAPH_BOUNDARY.finditer(page.text):
        paragraph = match.group(0)
        candidate = pending + paragraph
        probe = SourceSegment("probe", page_number, candidate, anchor)
        if fits_budget(probe):
            pending = candidate
            continue
        if pending:
            chunks.append(pending)
            pending = ""
        chunks.extend(
            split_exact_text(
                paragraph,
                page=page_number,
                anchor=anchor,
                segment_prefix=segment_prefix,
                prompt=prompt,
                model=model,
                max_tokens=max_tokens,
                fallback_encoding=fallback_encoding,
                question=question,
                source_label=source_label,
                segment_offset=len(chunks),
            )
        )
    if pending or not chunks:
        chunks.append(pending)
    return [
        SourceSegment(
            f"{segment_prefix}-s{index}",
            page_number,
            text,
            anchor,
        )
        for index, text in enumerate(chunks, start=1)
    ]


def split_exact_text(
    text: str,
    *,
    page: int | None,
    anchor: str | None,
    segment_prefix: str,
    prompt: str,
    model: str,
    max_tokens: int,
    fallback_encoding: str,
    question: str | None,
    source_label: str | None = None,
    segment_offset: int = 0,
) -> list[str]:
    """Split a large paragraph with a token-aware text-splitting library."""
    empty_probe = SourceSegment("probe", page, "", anchor)
    framing = count_prompt_tokens(
        [
            prompt,
            render_partition(
                [empty_probe],
                source_label=source_label,
                question=question,
            ),
        ],
        model=model,
        fallback_encoding=fallback_encoding,
    )
    content_token_limit = max_tokens - framing.tokens
    if content_token_limit < 1:
        raise SourceAnalysisError(
            "source_partition_limit_too_small",
            "Configured partition limit cannot fit source framing",
        )

    while content_token_limit > 0:
        splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
            encoding_name=framing.tokenizer,
            chunk_size=content_token_limit,
            chunk_overlap=0,
            keep_separator=True,
            strip_whitespace=False,
        )
        chunks = splitter.split_text(text)
        if "".join(chunks) != text:
            raise SourceAnalysisError(
                "incomplete_source_coverage",
                f"Source unit {anchor or page} could not be tokenized without loss",
                reason="source_tokenization_text_loss",
            )

        overflow = 0
        for index, chunk in enumerate(chunks, start=1):
            segment = SourceSegment(
                f"{segment_prefix}-s{segment_offset + index}",
                page,
                chunk,
                anchor,
            )
            segment_tokens = prompt_token_count(
                prompt,
                render_partition(
                    [segment],
                    source_label=source_label,
                    question=question,
                ),
                model=model,
                fallback_encoding=fallback_encoding,
            )
            overflow = max(overflow, segment_tokens - max_tokens)
        if overflow <= 0:
            return chunks
        content_token_limit -= overflow

    raise SourceAnalysisError(
        "source_partition_limit_too_small",
        "Configured partition limit cannot fit source framing",
    )


def render_partition(
    segments: Sequence[SourceSegment],
    *,
    source_label: str | None = None,
    question: str | None = None,
) -> str:
    """Render ordered source sections without generated identifiers or hashes."""
    payload: dict[str, Any] = {}
    if source_label is not None:
        payload["source_label"] = source_label
    if question is not None:
        payload["question"] = question
    payload["sections"] = [
        {
            **(
                {"page": segment.page}
                if segment.page is not None
                else {"heading": readable_source_heading(segment.anchor or "")}
            ),
            "text": segment.text,
        }
        for segment in segments
    ]
    return json.dumps(payload, ensure_ascii=False)


def _render_with_context(
    segments: Sequence[SourceSegment], context: dict[str, Any]
) -> str:
    """Render sections after the same non-section inputs as their parent partition."""
    sections = json.loads(render_partition(segments))["sections"]
    inputs = {key: value for key, value in context.items() if key != "sections"}
    return json.dumps({**inputs, "sections": sections}, ensure_ascii=False)


def verified_excerpts(
    excerpts: Sequence[SourceExcerpt],
    unit_text: dict[str, str],
) -> list[SourceExcerpt]:
    """Discard citations whose exact text is absent from the claimed unit."""
    verified: list[SourceExcerpt] = []
    seen: set[tuple[str, str]] = set()
    for excerpt in excerpts:
        anchor = excerpt_source_anchor(excerpt)
        key = (anchor, excerpt.text)
        if key in seen:
            continue
        if excerpt.text not in unit_text.get(anchor, ""):
            logger.warning(
                "Discarded unverifiable Concept Note excerpt for anchor=%s",
                anchor,
            )
            continue
        seen.add(key)
        verified.append(excerpt)
    return verified


def deduplicate_strings(values: Sequence[str]) -> list[str]:
    """Deduplicate non-empty strings while preserving model order."""
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = value.strip()
        key = normalized.casefold()
        if not normalized or key in seen:
            continue
        seen.add(key)
        result.append(normalized)
    return result


def prompt_token_count(
    prompt: str,
    input_text: str,
    *,
    model: str,
    fallback_encoding: str,
) -> int:
    """Count the complete reader input, including its system instructions."""
    return count_prompt_tokens(
        [prompt, input_text],
        model=model,
        fallback_encoding=fallback_encoding,
    ).tokens


async def gather_all_or_raise(*awaitables: Awaitable[OutputModel]) -> list[OutputModel]:
    """Await every concurrent worker before re-raising the first failure."""
    results = await asyncio.gather(*awaitables, return_exceptions=True)
    for result in results:
        if isinstance(result, BaseException):
            raise result
    return cast(list[OutputModel], results)
