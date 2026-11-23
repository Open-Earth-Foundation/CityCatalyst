"""Complete PDF and native Markdown analysis for Concept Note context bundles."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from collections.abc import Awaitable, Collection, Sequence
from dataclasses import dataclass
from functools import lru_cache
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
        partitions = partition_source_pages(
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
                    units=pages,
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
    """Read every partition section by section, then apply the chapter token budget.

    ``chapters`` holds each chapter's ``chapter_ref``, ``title``, ``description``,
    and ``required_fields``. One reader call per partition reviews each section in
    turn and tags exact passages with the chapters they serve; every passage is
    located by its text. Chapters whose quotations exceed
    ``max_chapter_excerpt_tokens`` go through one selector call.
    """
    if not chapters:
        return []
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
        partitions = partition_source_pages(
            pages,
            prompt=prompt,
            model=reader_model.name,
            max_tokens=budget.max_partition_tokens - context_tokens,
            fallback_encoding=tokenizer_encoding,
            source_label=source_label,
        )
        readings = await gather_all_or_raise(
            *(
                _read_partition(
                    name="Concept Note chapter evidence reader",
                    partition=partition,
                    prompt=prompt,
                    output_type=ChapterPartitionEvidence,
                    input_text=_render_with_context(partition, context),
                    settings=settings,
                    client=client,
                    runner=runner,
                    reader_limit=reader_limit,
                    units=pages,
                )
                for partition in partitions
            )
        )

        # Group verified passages by chapter before prioritizing any of them.
        unit_text = {source_unit_anchor(unit): unit.text for unit in pages}
        unit_order = {anchor: index for index, anchor in enumerate(unit_text)}
        candidates: dict[str, list[SourceExcerpt]] = {
            chapter["chapter_ref"]: [] for chapter in chapters
        }
        for reading in (reading for group in readings for reading in group):
            for excerpt in reading.excerpts:
                located = SourceExcerpt(
                    text=excerpt.text, page=excerpt.page, anchor=excerpt.anchor
                )
                for ref in excerpt.chapter_refs:
                    if ref in candidates:
                        candidates[ref].append(located)
        candidates = {
            ref: verified_excerpts(items, unit_text) for ref, items in candidates.items()
        }

        # Remove covered passages per source unit and put the rest in document order.
        candidates = {
            ref: _ordered_chapter_excerpts(items, unit_text, unit_order)
            for ref, items in candidates.items()
        }
        token_limit = budget.max_chapter_excerpt_tokens
        overfull = {}
        costs = {}
        if token_limit:
            costs = {
                quote: count_prompt_tokens(
                    [quote], model=reader_model.name, fallback_encoding=tokenizer_encoding
                ).tokens
                for quote in {item.text for items in candidates.values() for item in items}
            }
            overfull = {
                ref: items for ref, items in candidates.items()
                if sum(costs[item.text] for item in items) > token_limit
            }
        if overfull:
            chosen = await _select_chapter_excerpts(
                source_label=source_label,
                source_format=source_format,
                chapters=[c for c in chapters if c["chapter_ref"] in overfull],
                overfull=overfull,
                settings=settings,
                client=client,
                runner=runner,
            )
            for ref, items in overfull.items():
                candidates[ref] = _fill_chapter_budget(items, chosen.get(ref, []), costs, token_limit)
        return [
            ChapterExcerpts(chapter_ref=ref, excerpts=items[:MAX_CHAPTER_EXCERPTS])
            for ref, items in candidates.items()
            if items
        ]
    finally:
        if owns_client:
            await client.close()


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
        ordered.extend(sorted(maximal, key=lambda item: unit_text[anchor].index(item.text)))
    return ordered


def _fill_chapter_budget(
    items: list[SourceExcerpt], chosen: list[SourceExcerpt], costs: dict[str, int], limit: int
) -> list[SourceExcerpt]:
    """Pack selector choices first, then take one remaining excerpt per page per turn."""
    by_unit: dict[str, list[int]] = {}
    positions = {(excerpt_source_anchor(item), item.text): index for index, item in enumerate(items)}
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
) -> dict[str, list[SourceExcerpt]]:
    """Resolve each over-budget chapter's priority list to its verified candidates."""
    selection = await run_agent(
        name="Concept Note chapter evidence selector",
        prompt=settings.llm.prompts.get_prompt("cnb_source_chapter_evidence_selection"),
        model_config=settings.llm.models.cnb_source_synthesizer,
        output_type=ChapterEvidenceSelection,
        input_text=json.dumps(
            {
                "source_label": source_label,
                "source_format": source_format,
                "chapters": chapters,
                "candidates": [
                    {
                        "chapter_ref": ref,
                        "excerpts": [
                            omit_context_identifiers(e.model_dump(mode="json")) for e in items
                        ],
                    }
                    for ref, items in overfull.items()
                ],
            },
            ensure_ascii=False,
        ),
        client=client,
        runner=runner,
    )
    chosen: dict[str, list[SourceExcerpt]] = {}
    for choice in selection.chapters:
        # Match the complete quotation so a short passage cannot select a longer one on another page.
        candidates = [
            (_letters_and_digits(e.text)[0], e) for e in overfull.get(choice.chapter_ref, [])
        ]
        restored = chosen.setdefault(choice.chapter_ref, [])
        for excerpt in choice.excerpts:
            needle = _letters_and_digits(excerpt.text)[0]
            match = next(
                (e for text, e in candidates if needle and needle == text and e not in restored),
                None,
            )
            if match:
                restored.append(match)
    return chosen


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
        partitions = partition_source_pages(
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
                    units=pages,
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
    units: Sequence[SourceUnit],
) -> list[PartitionOutput]:
    """Read one partition; the model returns quotations only and code locates each one."""
    async with reader_limit, _GLOBAL_READER_SEMAPHORE:
        result = await run_agent(
            name=name,
            prompt=prompt,
            model_config=settings.llm.models.cnb_source_reader,
            output_type=_READINGS[output_type],
            input_text=input_text,
            client=client,
            runner=runner,
        )
    # Models lose count of pages on long inputs, so they never state a location:
    # each quotation is found by its text, preferring this partition's own units.
    covered = [s.segment_id for s in partition]
    own = {segment_source_anchor(segment) for segment in partition}
    # Chapter evidence is a section-by-section checklist; entry count and order are ignored.
    excerpts = (
        [excerpt for section in result.sections for excerpt in section.excerpts]
        if isinstance(result, ChapterEvidenceReading)
        else result.excerpts
    )
    located = [
        (excerpt, locate_excerpt(
            excerpt if isinstance(excerpt, str) else excerpt.text, units, prefer=own
        ))
        for excerpt in excerpts
    ]
    if output_type is ChapterPartitionEvidence:
        tagged = [
            ChapterTaggedSourceExcerpt(
                text=found.text,
                chapter_refs=excerpt.chapter_refs,
                page=found.page,
                anchor=found.anchor,
            )
            for excerpt, pieces in located
            for found in pieces
        ]
        return [ChapterPartitionEvidence(excerpts=tagged, covered_segment_ids=covered)]
    excerpts = [found for _, pieces in located for found in pieces]
    values = {"excerpts": excerpts[:20], "covered_segment_ids": covered}
    if output_type is SourcePartitionMap:
        values.update(summary=result.summary, topics=result.topics)
    else:
        values["caveats"] = deduplicate_strings(result.caveats)[:10]
    return [output_type.model_validate(values)]


def _restore_readable_excerpts(
    excerpts: Sequence[ReadableExcerpt], pages: Sequence[SourceUnit]
) -> list[SourceExcerpt]:
    """Locate each quotation in the source; the model never states a location."""
    return verified_excerpts(
        [found for excerpt in excerpts for found in locate_excerpt(excerpt.text, pages)],
        {source_unit_anchor(unit): unit.text for unit in pages},
    )


@lru_cache(maxsize=4096)
def _letters_and_digits(text: str) -> tuple[str, tuple[int, ...]]:
    """Lowercase letters and digits of ``text``, with each one's index in ``text``."""
    chars: list[str] = []
    index: list[int] = []
    for i, char in enumerate(text):
        if char.isalnum():
            folded = char.lower()
            chars.append(folded)
            index.extend([i] * len(folded))
    return "".join(chars), tuple(index)


# Shorter lines ("2)", "| --- |") match almost anywhere, so they are never located alone.
MIN_LOCATED_LINE_CHARS = 8
MAX_EXCERPT_CHARS = 4000  # SourceExcerpt.text limit


def _find_in_unit(
    text: str, units: Sequence[SourceUnit], prefer: Collection[str]
) -> tuple[SourceUnit, int, int] | None:
    """Return the unit and character span holding ``text``, ignoring punctuation, spacing and case."""
    needle, _ = _letters_and_digits(text)
    if not needle:
        return None
    hits = []
    for i, unit in enumerate(units):
        haystack, index = _letters_and_digits(unit.text)
        start = haystack.find(needle)
        if start >= 0:
            hits.append((unit.anchor not in prefer, i, unit, index[start], index[start + len(needle) - 1] + 1))
    if not hits:
        return None
    _, _, unit, start, end = min(hits, key=lambda hit: hit[:2])
    # Widen to whole tokens so units, signs and markup stay attached ("50%", "**7**").
    while start > 0 and not unit.text[start - 1].isspace():
        start -= 1
    while end < len(unit.text) and not unit.text[end].isspace():
        end += 1
    return unit, start, end


def locate_excerpt(
    text: str, units: Sequence[SourceUnit], *, prefer: Collection[str] = ()
) -> list[SourceExcerpt]:
    """Find a quotation anywhere in the source, ignoring punctuation, spacing and case.

    Returns the source's own wording at its real location. A quotation that is
    not one stretch of the source (joined across a page break, or from table rows
    that are not adjacent) is located line by line; consecutive lines on the same
    unit become one span of source text. Only text absent from the document is dropped.
    Repeated text resolves to the first unit in ``prefer`` (the partition read), else the first.
    """
    whole = _find_in_unit(text, units, prefer)
    if whole:
        spans = [whole]
    else:
        spans = []
        for line in text.splitlines():
            if len(_letters_and_digits(line)[0]) < MIN_LOCATED_LINE_CHARS:
                continue
            found = _find_in_unit(line, units, prefer)
            if not found:
                continue
            unit, start, end = found
            last = spans[-1] if spans else None
            if last and last[0] is unit and last[1] <= start and end <= last[2]:
                continue  # already inside the previous span
            # Keep one span per unit, including rows the model skipped between its lines.
            if last and last[0] is unit and last[2] <= start and end - last[1] <= MAX_EXCERPT_CHARS:
                spans[-1] = (unit, last[1], end)
            else:
                spans.append(found)
    if not spans:
        logger.warning("Discarded Concept Note excerpt not found in the source")
    return [
        SourceExcerpt(
            text=unit.text[start:end],
            page=source_unit_page(unit),
            anchor=unit.anchor if isinstance(unit, SourceBlock) else None,
        )
        for unit, start, end in spans
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
) -> OutputModel:
    """Run one tool-free worker with its configured model and reasoning effort."""
    output_schema = AgentOutputSchema(output_type)
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

    partitions: list[list[SourceSegment]] = []
    current: list[SourceSegment] = []
    for segment in segments:
        candidate = [*current, segment]
        input_text = render_partition(
            candidate,
            source_label=source_label,
            question=question,
        )
        if (
            prompt_token_count(
                prompt,
                input_text,
                model=model,
                fallback_encoding=fallback_encoding,
            )
            <= max_tokens
        ):
            current = candidate
            continue
        if not current:
            raise SourceAnalysisError(
                "source_partition_too_large",
                f"Source segment {segment.segment_id} exceeds the token limit",
            )
        partitions.append(current)
        current = [segment]
    if current:
        partitions.append(current)
    if not partitions:
        raise SourceAnalysisError(
            "empty_source_document",
            "Source document did not contain any analyzable units",
        )
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
        return (
            prompt_token_count(
                prompt,
                render_partition(
                    [segment],
                    source_label=source_label,
                    question=question,
                ),
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
