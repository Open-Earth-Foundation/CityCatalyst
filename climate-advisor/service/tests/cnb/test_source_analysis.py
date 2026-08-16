from __future__ import annotations

import asyncio
import hashlib
import json
import re
from collections.abc import AsyncIterator
from types import SimpleNamespace
from uuid import uuid4

import pytest
import pytest_asyncio
from app.config import Settings, get_settings
from app.models.cnb.context_bundle import (
    SourceDocumentSynthesis,
    SourceExcerpt,
    SourcePartitionMap,
    SourceQuestionReading,
)
from app.services.citycatalyst_client import ConceptNoteMarkdownArtifact
from app.services.cnb.source_analysis import (
    SourceAnalysisError,
    SourcePage,
    analyze_document,
    gather_all_or_raise,
    parse_source_pages,
    partition_source_pages,
    prompt_token_count,
    query_document,
    render_partition,
    verify_source_artifact,
)
from openai import AsyncOpenAI

SEGMENT = re.compile(
    r'<segment id="([^"]+)" page="(\d+)">\n(.*?)\n</segment>',
    re.DOTALL,
)


class FakeRunner:
    """Return deterministic structured output while tracking reader fan-out."""

    def __init__(self) -> None:
        self.active = 0
        self.max_active = 0
        self.covered_ids: list[str] = []
        self.reader_tools: list[list[object]] = []

    async def run(self, agent, input_text: str):
        output_type = agent.output_type
        if output_type in (SourcePartitionMap, SourceQuestionReading):
            self.active += 1
            self.max_active = max(self.max_active, self.active)
            self.reader_tools.append(agent.tools)
            await asyncio.sleep(0.001)
            segments = SEGMENT.findall(input_text)
            ids = [segment_id for segment_id, _, _ in segments]
            self.covered_ids.extend(ids)
            excerpt = next(
                (
                    SourceExcerpt(text="Drainage upgrades", page=int(page))
                    for _, page, text in segments
                    if "Drainage upgrades" in text
                ),
                None,
            )
            self.active -= 1
            if output_type is SourcePartitionMap:
                output = SourcePartitionMap(
                    summary="Mapped source partition.",
                    topics=["drainage"],
                    excerpts=[excerpt] if excerpt else [],
                    covered_segment_ids=ids,
                )
            else:
                output = SourceQuestionReading(
                    excerpts=[excerpt] if excerpt else [],
                    caveats=[],
                    covered_segment_ids=ids,
                )
        elif output_type is SourceDocumentSynthesis:
            payload = json.loads(input_text)
            excerpts = [
                excerpt
                for item in payload["partition_maps"]
                for excerpt in item["excerpts"]
            ]
            output = SourceDocumentSynthesis(
                summary="The plan describes city drainage priorities.",
                topics=["drainage", "Drainage"],
                key_excerpts=excerpts,
            )
        else:
            raise AssertionError(f"Unexpected output type: {output_type}")
        return SimpleNamespace(final_output=output)


class IncompleteCoverageRunner(FakeRunner):
    """Claim the wrong segment identity to exercise fail-closed coverage."""

    async def run(self, agent, input_text: str):
        result = await super().run(agent, input_text)
        if isinstance(result.final_output, SourcePartitionMap):
            result.final_output = result.final_output.model_copy(
                update={"covered_segment_ids": ["wrong-segment"]}
            )
        return result


@pytest_asyncio.fixture
async def analysis_dependencies() -> AsyncIterator[tuple[Settings, AsyncOpenAI]]:
    settings = get_settings().model_copy(deep=True)
    settings.llm.generation.prompt_budget.cnb_sources.max_partition_tokens = 1000
    settings.llm.generation.prompt_budget.cnb_sources.max_concurrency = 3
    client = AsyncOpenAI(
        api_key="test",
        base_url="https://openrouter.ai/api/v1",
    )
    try:
        yield settings, client
    finally:
        await client.close()


@pytest.mark.asyncio
async def test_analysis_and_query_cover_every_page_with_exact_citations(
    analysis_dependencies,
) -> None:
    runner = FakeRunner()
    settings, client = analysis_dependencies
    pages = [
        SourcePage(
            number=page,
            text=(
                f"\n# Page {page}\n\nDrainage upgrades protect district {page}.\n"
                + ("Background evidence. " * 120)
            ),
        )
        for page in range(1, 7)
    ]
    source = await analyze_document(
        upload_id=uuid4(),
        filename="plan.pdf",
        source_label="City plan",
        sha256="a" * 64,
        pages=pages,
        settings=settings,
        client=client,
        runner=runner,
    )
    result = await query_document(
        upload_id=source.upload_id,
        source_label=source.source_label,
        question="What drainage upgrades are proposed?",
        pages=pages,
        settings=settings,
        client=client,
        runner=runner,
    )

    assert source.topics == ["drainage"]
    assert source.key_excerpts[0].text == "Drainage upgrades"
    assert result.found is True
    assert result.excerpts[0].text == "Drainage upgrades"
    assert result.pages_processed == result.pages_total == 6
    assert result.segments_processed == result.segments_total
    assert {
        int(identifier.split("-")[0][1:]) for identifier in runner.covered_ids
    } == set(range(1, 7))
    assert runner.max_active <= 4
    assert all(tools == [] for tools in runner.reader_tools)


@pytest.mark.asyncio
async def test_query_returns_explicit_not_found_after_full_coverage(
    analysis_dependencies,
) -> None:
    runner = FakeRunner()
    settings, client = analysis_dependencies
    pages = [SourcePage(number=1, text="\nNo financial figures are stated.")]
    result = await query_document(
        upload_id=uuid4(),
        source_label="Plan",
        question="What drainage upgrades are proposed?",
        pages=pages,
        settings=settings,
        client=client,
        runner=runner,
    )
    assert result.found is False
    assert result.excerpts == []
    assert result.pages_processed == 1


def test_oversized_page_partition_preserves_text_within_token_budget() -> None:
    settings = get_settings()
    page = SourcePage(
        number=1,
        text="# Heading\n\n" + ("Evidence: Zażółć gęślą jaźń 🧠. " * 1200),
    )
    prompt = settings.llm.prompts.get_prompt("cnb_source_document_mapping")
    partitions = partition_source_pages(
        [page],
        prompt=prompt,
        model=settings.llm.models.cnb_source_reader.name,
        max_tokens=1000,
        fallback_encoding="o200k_base",
    )
    segments = [segment for partition in partitions for segment in partition]
    assert len(segments) > 1
    assert "".join(segment.text for segment in segments) == page.text
    assert all(segment.page == 1 for segment in segments)
    assert all(
        prompt_token_count(
            prompt,
            render_partition(partition),
            model=settings.llm.models.cnb_source_reader.name,
            fallback_encoding="o200k_base",
        )
        <= 1000
        for partition in partitions
    )


def test_artifact_pointer_digest_and_page_sequence_are_reverified() -> None:
    markdown = "<!-- page: 1 -->\nOne\n<!-- page: 2 -->\nTwo"
    digest = hashlib.sha256(markdown.encode()).hexdigest()
    artifact = ConceptNoteMarkdownArtifact(
        markdown=markdown,
        markdown_s3_key="result.md",
        sha256=digest,
        page_count=2,
    )
    pages = verify_source_artifact(
        artifact=artifact,
        markdown_s3_key="result.md",
        sha256=digest,
        page_count=2,
    )
    assert [page.number for page in pages] == [1, 2]
    assert parse_source_pages(markdown)[1].text == "\nTwo"
    with pytest.raises(SourceAnalysisError) as mismatch:
        verify_source_artifact(
            artifact=artifact,
            markdown_s3_key="result.md",
            sha256="0" * 64,
            page_count=2,
        )
    assert mismatch.value.code == "source_identity_mismatch"


@pytest.mark.asyncio
async def test_incomplete_reader_coverage_fails_the_document(
    analysis_dependencies,
) -> None:
    settings, client = analysis_dependencies
    with pytest.raises(SourceAnalysisError) as failure:
        await analyze_document(
            upload_id=uuid4(),
            filename="plan.pdf",
            source_label=None,
            sha256="a" * 64,
            pages=[SourcePage(number=1, text="\nDrainage upgrades")],
            settings=settings,
            client=client,
            runner=IncompleteCoverageRunner(),
        )
    assert failure.value.code == "incomplete_source_coverage"


@pytest.mark.asyncio
async def test_query_question_is_bounded_before_reader_fan_out(
    analysis_dependencies,
) -> None:
    runner = FakeRunner()
    settings, client = analysis_dependencies
    with pytest.raises(SourceAnalysisError) as failure:
        await query_document(
            upload_id=uuid4(),
            source_label="Plan",
            question="q" * 2001,
            pages=[SourcePage(number=1, text="Evidence")],
            settings=settings,
            client=client,
            runner=runner,
        )
    assert failure.value.code == "source_question_too_long"
    assert runner.covered_ids == []


@pytest.mark.asyncio
async def test_parallel_workers_are_all_awaited_before_a_failure_is_raised() -> None:
    completed = asyncio.Event()

    async def fail() -> str:
        raise SourceAnalysisError("reader_failed", "Reader failed")

    async def finish() -> str:
        await asyncio.sleep(0.001)
        completed.set()
        return "done"

    with pytest.raises(SourceAnalysisError):
        await gather_all_or_raise(fail(), finish())
    assert completed.is_set()
