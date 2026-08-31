"""Complete PDF and native Markdown analysis for Concept Note context bundles."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from collections.abc import Awaitable, Sequence
from dataclasses import dataclass
from itertools import pairwise
from typing import Any, TypeVar, cast

from agents import Agent, ModelSettings, OpenAIChatCompletionsModel, Runner
from app.config import Settings, get_settings
from app.models.cnb.concept_note_markdown import ConceptNoteSourceFormat
from app.models.cnb.context_bundle import (
    SelectedSource,
    SourceDocumentSynthesis,
    SourceExcerpt,
    SourcePartitionMap,
    SourceQueryResult,
    SourceQuestionReading,
)
from app.services.citycatalyst_client import ConceptNoteMarkdownArtifact
from app.services.openrouter_client import build_openrouter_client_options
from app.utils.prompt_budget import count_prompt_tokens
from langchain_text_splitters import RecursiveCharacterTextSplitter
from openai import AsyncOpenAI
from pydantic import BaseModel

logger = logging.getLogger(__name__)

PAGE_MARKER = re.compile(r"<!-- page: (\d+) -->")
PARAGRAPH_BOUNDARY = re.compile(r".*?(?:\n\s*\n|\Z)", re.DOTALL)
MARKDOWN_BLOCK_BOUNDARY = re.compile(r"\n[ \t]*\n")
MARKDOWN_HEADING = re.compile(r"^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$", re.MULTILINE)
_GLOBAL_READER_SEMAPHORE = asyncio.Semaphore(3)
MAX_QUERY_EXCERPTS = 20
MAX_QUERY_CAVEATS = 10
OutputModel = TypeVar("OutputModel", bound=BaseModel)
PartitionOutput = TypeVar("PartitionOutput", SourcePartitionMap, SourceQuestionReading)


class SourceAnalysisError(Exception):
    """Retryable failure to verify or completely analyze a source document."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


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
    client, owns_client = _resolve_analysis_client(settings, client)
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
        readings = await gather_all_or_raise(
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

        # Revalidate excerpts against exact source units before synthesis.
        unit_text = {source_unit_anchor(unit): unit.text for unit in pages}
        verified_readings = [
            reading.model_copy(
                update={"excerpts": verified_excerpts(reading.excerpts, unit_text)}
            )
            for reading in readings
        ]
        synthesis = await _run_agent(
            name="Concept Note source summary synthesizer",
            prompt=settings.llm.prompts.get_prompt("cnb_source_summary_synthesis"),
            model_name=synthesizer_model.name,
            output_type=SourceDocumentSynthesis,
            input_text=json.dumps(
                {
                    "source_label": label,
                    "source_format": source_format,
                    "unit_count": len(pages),
                    "partition_maps": [
                        item.model_dump(mode="json") for item in verified_readings
                    ],
                    "limits": {
                        "max_topics": budget.max_topics,
                        "max_key_excerpts": budget.max_key_excerpts,
                    },
                },
                ensure_ascii=False,
            ),
            settings=settings,
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
            key_excerpts=verified_excerpts(synthesis.key_excerpts, unit_text)[
                : budget.max_key_excerpts
            ],
        )
    finally:
        if owns_client:
            await client.close()


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

    client, owns_client = _resolve_analysis_client(settings, client)
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
        readings = await gather_all_or_raise(
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


def _resolve_analysis_client(
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
) -> PartitionOutput:
    """Run one bounded partition reader and require exact segment coverage."""
    async with reader_limit, _GLOBAL_READER_SEMAPHORE:
        result = await _run_agent(
            name=name,
            prompt=prompt,
            model_name=settings.llm.models.cnb_source_reader.name,
            output_type=output_type,
            input_text=input_text,
            settings=settings,
            client=client,
            runner=runner,
        )
    require_partition_coverage(partition, result.covered_segment_ids)
    return result


async def _run_agent(
    *,
    name: str,
    prompt: str,
    model_name: str,
    output_type: type[OutputModel],
    input_text: str,
    settings: Settings,
    client: AsyncOpenAI,
    runner: Any,
) -> OutputModel:
    """Run one tool-free worker with its configured model and reasoning effort."""
    model_config = (
        settings.llm.models.cnb_source_reader
        if model_name == settings.llm.models.cnb_source_reader.name
        else settings.llm.models.cnb_source_synthesizer
    )
    agent = Agent(
        name=name,
        instructions=prompt,
        model=OpenAIChatCompletionsModel(
            model=model_name,
            openai_client=client,
        ),
        model_settings=ModelSettings(
            # Sol/Luna reasoning requests omit unsupported sampling controls.
            include_usage=True,
            reasoning={"effort": model_config.reasoning_effort},
        ),
        output_type=output_type,
        tools=[],
    )
    try:
        run_result = await runner.run(agent, input_text)
        return output_type.model_validate(run_result.final_output)
    except SourceAnalysisError:
        raise
    except Exception as exc:
        logger.exception("Concept Note source agent failed: %s", name)
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
    """Render immutable segment framing without altering source text."""
    prefix: list[str] = []
    if source_label is not None:
        prefix.append(f"<source_label>{source_label}</source_label>")
    if question is not None:
        prefix.append(f"<question>{question}</question>")
    for segment in segments:
        locator = (
            f' page="{segment.page}"'
            if segment.page is not None
            else f' anchor="{segment.anchor}"'
        )
        prefix.append(
            f'<segment id="{segment.segment_id}"{locator}>\n{segment.text}\n</segment>'
        )
    return "\n".join(prefix)


def require_partition_coverage(
    partition: Sequence[SourceSegment],
    covered_segment_ids: Sequence[str],
) -> None:
    """Fail unless the reader explicitly acknowledges every segment exactly once."""
    expected = [segment.segment_id for segment in partition]
    if list(covered_segment_ids) != expected:
        raise SourceAnalysisError(
            "incomplete_source_coverage",
            "Source reader did not confirm every partition segment",
        )


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
