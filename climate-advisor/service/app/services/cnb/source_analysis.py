"""Page-complete PDF source analysis for Concept Note context bundles."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from collections.abc import Awaitable, Sequence
from dataclasses import dataclass
from typing import Any, TypeVar, cast
from urllib.parse import urlparse

from agents import Agent, ModelSettings, OpenAIChatCompletionsModel, Runner
from app.config import Settings, get_settings
from app.models.cnb.context_bundle import (
    SelectedSource,
    SourceDocumentSynthesis,
    SourceExcerpt,
    SourcePartitionMap,
    SourceQueryResult,
    SourceQuestionReading,
    SourceQuestionSynthesis,
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
_GLOBAL_READER_SEMAPHORE = asyncio.Semaphore(4)
OutputModel = TypeVar("OutputModel", bound=BaseModel)


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


@dataclass(frozen=True)
class SourceSegment:
    """A contiguous page slice that remains traceable to one source page."""

    segment_id: str
    page: int
    text: str


class SourceAnalysisService:
    """Run bounded reader fan-out and grounded document synthesis."""

    def __init__(
        self,
        *,
        settings: Settings | None = None,
        client: AsyncOpenAI | None = None,
        runner: Any = Runner,
    ) -> None:
        """Initialize configured source reader and synthesizer roles."""
        self.settings = settings or get_settings()
        self.runner = runner
        self._owns_client = client is None
        if client is None:
            try:
                options = build_openrouter_client_options(
                    self.settings,
                    missing_api_key_message=(
                        "OpenRouter API key is required for Concept Note source analysis"
                    ),
                )
            except ValueError as exc:
                raise SourceAnalysisError(
                    "source_analysis_unavailable",
                    str(exc),
                ) from exc
            client = AsyncOpenAI(**options.kwargs)
        self.client = client
        self.budget = self.settings.llm.generation.prompt_budget.cnb_sources
        self.tokenizer_encoding = (
            self.settings.llm.generation.prompt_budget.tokenizer_encoding
        )
        self.reader_model = self.settings.llm.models.cnb_source_reader
        self.synthesizer_model = self.settings.llm.models.cnb_source_synthesizer
        self._reader_limit = asyncio.Semaphore(self.budget.max_concurrency)

    async def close(self) -> None:
        """Close the analysis client when this service created it."""
        if self._owns_client:
            await self.client.close()

    def verify_artifact(
        self,
        *,
        artifact: ConceptNoteMarkdownArtifact,
        markdown_s3_key: str,
        sha256: str,
        page_count: int,
    ) -> list[SourcePage]:
        """Revalidate the immutable pointer, digest, and complete page sequence."""
        if (
            artifact.markdown_s3_key != markdown_s3_key
            or artifact.sha256 != sha256
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
        pages = parse_source_pages(artifact.markdown)
        if len(pages) != page_count:
            raise SourceAnalysisError(
                "source_page_count_mismatch",
                "CityCatalyst source page count did not match the immutable pointer",
            )
        return pages

    async def analyze_document(
        self,
        *,
        upload_id: Any,
        filename: str,
        source_label: str | None,
        sha256: str,
        pages: Sequence[SourcePage],
    ) -> SelectedSource:
        """Map every source segment and synthesize one compact selected source."""
        label = source_label or filename
        prompt = self.settings.llm.prompts.get_prompt("cnb_source_document_mapping")
        partitions = partition_source_pages(
            pages,
            prompt=prompt,
            model=self.reader_model.name,
            max_tokens=self.budget.max_partition_tokens,
            fallback_encoding=self.tokenizer_encoding,
            source_label=label,
        )
        readings = await gather_all_or_raise(
            *(
                self._map_partition(
                    label=label,
                    partition=partition,
                    prompt=prompt,
                )
                for partition in partitions
            )
        )
        page_text = {page.number: page.text for page in pages}
        verified_readings = [
            reading.model_copy(
                update={
                    "excerpts": verified_excerpts(reading.excerpts, page_text),
                }
            )
            for reading in readings
        ]

        synthesis_prompt = self.settings.llm.prompts.get_prompt(
            "cnb_source_summary_synthesis"
        )
        synthesis = await self._run_agent(
            name="Concept Note source summary synthesizer",
            prompt=synthesis_prompt,
            model_name=self.synthesizer_model.name,
            output_type=SourceDocumentSynthesis,
            input_text=json.dumps(
                {
                    "source_label": label,
                    "page_count": len(pages),
                    "partition_maps": [
                        item.model_dump(mode="json") for item in verified_readings
                    ],
                    "limits": {
                        "max_topics": self.budget.max_topics,
                        "max_key_excerpts": self.budget.max_key_excerpts,
                    },
                },
                ensure_ascii=False,
            ),
        )
        return SelectedSource(
            upload_id=upload_id,
            source_label=label,
            filename=filename,
            sha256=sha256,
            page_count=len(pages),
            summary=synthesis.summary,
            topics=deduplicate_strings(synthesis.topics)[: self.budget.max_topics],
            key_excerpts=verified_excerpts(
                synthesis.key_excerpts,
                page_text,
            )[: self.budget.max_key_excerpts],
        )

    async def query_document(
        self,
        *,
        upload_id: Any,
        source_label: str,
        question: str,
        pages: Sequence[SourcePage],
    ) -> SourceQueryResult:
        """Read every page for one question and synthesize only after full coverage."""
        normalized_question = question.strip()
        if not normalized_question:
            raise SourceAnalysisError("invalid_source_question", "Question is required")
        if len(normalized_question) > self.budget.max_question_chars:
            raise SourceAnalysisError(
                "source_question_too_long",
                "Question exceeds the configured source-query limit",
            )

        prompt = self.settings.llm.prompts.get_prompt("cnb_source_question_reading")
        partitions = partition_source_pages(
            pages,
            prompt=prompt,
            model=self.reader_model.name,
            max_tokens=self.budget.max_partition_tokens,
            fallback_encoding=self.tokenizer_encoding,
            question=normalized_question,
        )
        readings = await gather_all_or_raise(
            *(
                self._read_partition_for_question(
                    question=normalized_question,
                    partition=partition,
                    prompt=prompt,
                )
                for partition in partitions
            )
        )
        page_text = {page.number: page.text for page in pages}
        evidence: list[SourceExcerpt] = []
        caveats: list[str] = []
        for reading in readings:
            evidence.extend(verified_excerpts(reading.excerpts, page_text))
            caveats.extend(reading.caveats)

        synthesis = await self._run_agent(
            name="Concept Note grounded source answer synthesizer",
            prompt=self.settings.llm.prompts.get_prompt(
                "cnb_source_grounded_synthesis"
            ),
            model_name=self.synthesizer_model.name,
            output_type=SourceQuestionSynthesis,
            input_text=json.dumps(
                {
                    "question": normalized_question,
                    "source_label": source_label,
                    "pages_processed": len(
                        {segment.page for part in partitions for segment in part}
                    ),
                    "pages_total": len(pages),
                    "segments_processed": sum(len(part) for part in partitions),
                    "validated_excerpts": [
                        item.model_dump(mode="json") for item in evidence
                    ],
                    "reader_caveats": deduplicate_strings(caveats),
                },
                ensure_ascii=False,
            ),
        )
        final_excerpts = verified_excerpts(synthesis.excerpts, page_text)
        if synthesis.found and not final_excerpts:
            raise SourceAnalysisError(
                "unverifiable_source_answer",
                "Source answer did not retain verifiable evidence",
            )
        return SourceQueryResult(
            found=synthesis.found,
            upload_id=upload_id,
            source_label=source_label,
            answer=synthesis.answer,
            excerpts=final_excerpts,
            pages_processed=len(
                {segment.page for part in partitions for segment in part}
            ),
            pages_total=len(pages),
            segments_processed=sum(len(partition) for partition in partitions),
            segments_total=sum(len(partition) for partition in partitions),
            caveats=synthesis.caveats,
        )

    async def _map_partition(
        self,
        *,
        label: str,
        partition: Sequence[SourceSegment],
        prompt: str,
    ) -> SourcePartitionMap:
        """Map one partition and require exact segment coverage acknowledgement."""
        result = await self._run_reader(
            name="Concept Note source partition reader",
            prompt=prompt,
            output_type=SourcePartitionMap,
            input_text=render_partition(partition, source_label=label),
        )
        require_partition_coverage(partition, result.covered_segment_ids)
        return result

    async def _read_partition_for_question(
        self,
        *,
        question: str,
        partition: Sequence[SourceSegment],
        prompt: str,
    ) -> SourceQuestionReading:
        """Read one complete partition for question-focused evidence."""
        result = await self._run_reader(
            name="Concept Note question-focused source reader",
            prompt=prompt,
            output_type=SourceQuestionReading,
            input_text=render_partition(partition, question=question),
        )
        require_partition_coverage(partition, result.covered_segment_ids)
        return result

    async def _run_reader(
        self,
        *,
        name: str,
        prompt: str,
        output_type: type[OutputModel],
        input_text: str,
    ) -> OutputModel:
        """Run one tool-free mini reader under local and process-wide limits."""
        async with self._reader_limit, _GLOBAL_READER_SEMAPHORE:
            return await self._run_agent(
                name=name,
                prompt=prompt,
                model_name=self.reader_model.name,
                output_type=output_type,
                input_text=input_text,
            )

    async def _run_agent(
        self,
        *,
        name: str,
        prompt: str,
        model_name: str,
        output_type: type[OutputModel],
        input_text: str,
    ) -> OutputModel:
        """Run one deterministic, tool-free Agents SDK worker."""
        agent = Agent(
            name=name,
            instructions=prompt,
            model=OpenAIChatCompletionsModel(
                model=resolve_model_name(model_name, self.client),
                openai_client=self.client,
            ),
            model_settings=ModelSettings(
                temperature=0.0,
                include_usage=True,
                reasoning={
                    "effort": (
                        self.reader_model.reasoning_effort
                        if model_name == self.reader_model.name
                        else self.synthesizer_model.reasoning_effort
                    )
                },
            ),
            output_type=output_type,
            tools=[],
        )
        try:
            run_result = await self.runner.run(agent, input_text)
            return output_type.model_validate(run_result.final_output)
        except SourceAnalysisError:
            raise
        except Exception as exc:
            logger.exception("Concept Note source agent failed: %s", name)
            raise SourceAnalysisError(
                "source_analysis_failed",
                f"{name} failed",
            ) from exc


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


def partition_source_pages(
    pages: Sequence[SourcePage],
    *,
    prompt: str,
    model: str,
    max_tokens: int,
    fallback_encoding: str,
    question: str | None = None,
    source_label: str | None = None,
) -> list[list[SourceSegment]]:
    """Create ordered partitions without dropping or reordering page text."""
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
                f"Page {page.number} could not be partitioned without loss",
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
            "Source document did not contain any pages",
        )
    return partitions


def split_page(
    page: SourcePage,
    *,
    prompt: str,
    model: str,
    max_tokens: int,
    fallback_encoding: str,
    question: str | None,
    source_label: str | None = None,
) -> list[SourceSegment]:
    """Split one oversized page at paragraph boundaries, then exact text offsets."""
    whole = SourceSegment(
        segment_id=f"p{page.number}-s1", page=page.number, text=page.text
    )
    if (
        prompt_token_count(
            prompt,
            render_partition(
                [whole],
                source_label=source_label,
                question=question,
            ),
            model=model,
            fallback_encoding=fallback_encoding,
        )
        <= max_tokens
    ):
        return [whole]

    paragraphs = [match.group(0) for match in PARAGRAPH_BOUNDARY.finditer(page.text)]
    chunks: list[str] = []
    pending = ""
    for paragraph in paragraphs:
        candidate = pending + paragraph
        probe = SourceSegment("probe", page.number, candidate)
        if (
            prompt_token_count(
                prompt,
                render_partition(
                    [probe],
                    source_label=source_label,
                    question=question,
                ),
                model=model,
                fallback_encoding=fallback_encoding,
            )
            <= max_tokens
        ):
            pending = candidate
            continue
        if pending:
            chunks.append(pending)
            pending = ""
        chunks.extend(
            split_exact_text(
                paragraph,
                page=page.number,
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
        SourceSegment(f"p{page.number}-s{index}", page.number, text)
        for index, text in enumerate(chunks, start=1)
    ]


def split_exact_text(
    text: str,
    *,
    page: int,
    prompt: str,
    model: str,
    max_tokens: int,
    fallback_encoding: str,
    question: str | None,
    source_label: str | None = None,
    segment_offset: int = 0,
) -> list[str]:
    """Split a large paragraph with a token-aware text-splitting library."""
    empty_probe = SourceSegment("probe", page, "")
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
                f"Page {page} could not be tokenized without loss",
            )

        overflow = 0
        for index, chunk in enumerate(chunks, start=1):
            segment = SourceSegment(
                f"p{page}-s{segment_offset + index}",
                page,
                chunk,
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
        prefix.append(
            f'<segment id="{segment.segment_id}" page="{segment.page}">\n'
            f"{segment.text}\n"
            "</segment>"
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
    page_text: dict[int, str],
) -> list[SourceExcerpt]:
    """Discard citations whose exact text is absent from the claimed page."""
    verified: list[SourceExcerpt] = []
    seen: set[tuple[int, str]] = set()
    for excerpt in excerpts:
        key = (excerpt.page, excerpt.text)
        if key in seen:
            continue
        if excerpt.text not in page_text.get(excerpt.page, ""):
            logger.warning(
                "Discarded unverifiable Concept Note excerpt for page=%s",
                excerpt.page,
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


def resolve_model_name(model_name: str, client: AsyncOpenAI) -> str:
    """Strip the OpenRouter provider prefix only for the OpenAI endpoint."""
    base_url = str(client.base_url or "")
    hostname = (urlparse(base_url).hostname or "").lower()
    if hostname == "api.openai.com" and model_name.startswith("openai/"):
        return model_name.split("/", 1)[1]
    return model_name
