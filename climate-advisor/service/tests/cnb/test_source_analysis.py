from __future__ import annotations

import asyncio
import hashlib
import json
from collections.abc import AsyncIterator
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
import pytest_asyncio
from agents import RunConfig, Runner
from app.config import Settings, get_settings
from app.models.cnb.source_prompt import (
    DocumentMappingReading,
    DocumentSummary,
    QuestionReading,
    SectionEvidence,
)
from app.services.citycatalyst_client import ConceptNoteMarkdownArtifact
from app.services.cnb.source_analysis import (
    SourceAnalysisError,
    SourceBlock,
    SourcePage,
    _run_agent,
    analyze_document,
    gather_all_or_raise,
    parse_markdown_blocks,
    parse_source_pages,
    partition_source_pages,
    prompt_token_count,
    query_document,
    render_partition,
    source_analysis_contract_version,
    verify_source_artifact,
)
from openai import AsyncOpenAI


class FakeRunner:
    """Return deterministic structured output while tracking reader fan-out."""

    def __init__(self) -> None:
        self.active = 0
        self.max_active = 0
        self.covered_pages: list[int] = []
        self.reader_tools: list[list[object]] = []

    async def run(self, agent, input_text: str):
        output_type = agent.output_type
        payload = json.loads(input_text)
        if output_type in (DocumentMappingReading, QuestionReading):
            self.active += 1
            self.max_active = max(self.max_active, self.active)
            self.reader_tools.append(agent.tools)
            await asyncio.sleep(0.001)
            self.covered_pages.extend(section.get("page", 0) for section in payload["sections"])
            sections = [
                SectionEvidence(excerpts=["Drainage upgrades"] if "Drainage upgrades" in section["text"] else [], caveats=[])
                for section in payload["sections"]
            ]
            self.active -= 1
            output = (
                DocumentMappingReading(summary="Mapped source partition.", topics=["drainage"], sections=sections)
                if output_type is DocumentMappingReading else QuestionReading(sections=sections)
            )
        elif output_type is DocumentSummary:
            output = DocumentSummary(
                summary="The plan describes city drainage priorities.",
                topics=["drainage", "Drainage"],
                key_excerpts=[excerpt for item in payload["partition_maps"] for excerpt in item["excerpts"]],
            )
        else:
            raise AssertionError(f"Unexpected output type: {output_type}")
        return SimpleNamespace(final_output=output)


class IncompleteCoverageRunner(FakeRunner):
    """Claim the wrong segment identity to exercise fail-closed coverage."""

    async def run(self, agent, input_text: str):
        result = await super().run(agent, input_text)
        if isinstance(result.final_output, DocumentMappingReading):
            result.final_output = result.final_output.model_copy(
                update={"sections": []}
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
    assert result.units_processed == result.units_total == 6
    assert result.segments_processed == result.segments_total
    assert set(runner.covered_pages) == set(range(1, 7))
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
    assert result.units_processed == 1


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
async def test_native_markdown_uses_stable_block_anchors_without_pages(
    analysis_dependencies,
) -> None:
    markdown = "# Priorities\n\nDrainage upgrades\n\n## Transit\n\nBus lanes"
    digest = hashlib.sha256(markdown.encode()).hexdigest()
    artifact = ConceptNoteMarkdownArtifact(
        markdown=markdown,
        markdown_s3_key="result.md",
        sha256=digest,
        source_format="markdown",
        page_count=None,
    )
    first = verify_source_artifact(
        artifact=artifact,
        markdown_s3_key="result.md",
        sha256=digest,
        source_format="markdown",
        page_count=None,
    )
    second = parse_markdown_blocks(markdown)

    assert all(isinstance(unit, SourceBlock) for unit in first)
    assert [unit.anchor for unit in first] == [unit.anchor for unit in second]
    assert "".join(unit.text for unit in first) == markdown
    assert all("/block-" in unit.anchor for unit in first)

    settings, client = analysis_dependencies
    runner = FakeRunner()
    source = await analyze_document(
        upload_id=uuid4(),
        filename="plan.md",
        source_label="Plan",
        sha256=digest,
        source_format="markdown",
        pages=first,
        settings=settings,
        client=client,
        runner=runner,
    )

    assert source.source_format == "markdown"
    assert source.page_count is None
    assert source.block_count == len(first)
    assert source.key_excerpts[0].page is None
    assert source.key_excerpts[0].anchor is not None


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
    assert runner.covered_pages == []


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


@pytest.mark.parametrize(
    ("role", "model_name", "effort", "output_type", "output"),
    [
        (
            "cnb_source_reader",
            "openai/gpt-5.6-terra",
            "medium",
            QuestionReading,
            {"sections": [{"excerpts": [], "caveats": []}]},
        ),
        (
            "cnb_source_synthesizer",
            "openai/gpt-5.6-sol",
            "medium",
            DocumentSummary,
            {
                "summary": "No budget is stated.",
                "topics": ["budget"],
                "key_excerpts": [],
            },
        ),
    ],
)
@pytest.mark.asyncio
async def test_source_worker_serializes_sol_terra_requests_without_temperature(
    role,
    model_name,
    effort,
    output_type,
    output,
) -> None:
    """Exercise the real Agents/OpenAI adapters without sending network requests."""
    settings = get_settings().model_copy(deep=True)
    captured = []

    def respond(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "https://openrouter.ai/api/v1/chat/completions"
        payload = json.loads(request.content)
        captured.append(payload)
        return httpx.Response(
            200,
            json={
                "id": "chatcmpl-local-test",
                "object": "chat.completion",
                "created": 0,
                "model": payload["model"],
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": json.dumps(output)},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {
                    "prompt_tokens": 10,
                    "completion_tokens": 10,
                    "total_tokens": 20,
                },
            },
        )

    class LocalRunner:
        @staticmethod
        async def run(agent, input_text):
            return await Runner.run(
                agent, input_text, run_config=RunConfig(tracing_disabled=True)
            )

    async with AsyncOpenAI(
        api_key="local-test-only",
        base_url="https://openrouter.ai/api/v1",
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond)),
    ) as client:
        result = await _run_agent(
            name="Source model compatibility test",
            prompt=settings.llm.prompts.get_prompt(
                "cnb_source_question_reading"
                if role == "cnb_source_reader"
                else "cnb_source_summary_synthesis"
            ),
            model_name=getattr(settings.llm.models, role).name,
            output_type=output_type,
            input_text="No budget is stated.",
            settings=settings,
            client=client,
            runner=LocalRunner,
        )

    assert result == output_type.model_validate(output)
    assert len(captured) == 1
    request = captured[0]
    assert request["model"] == model_name
    assert request["reasoning_effort"] == effort
    assert "temperature" not in request
    assert not request.get("tools")
    assert request["response_format"]["type"] == "json_schema"
    assert request["response_format"]["json_schema"]["strict"] is True


@pytest.mark.parametrize("role", ["cnb_source_reader", "cnb_source_synthesizer"])
def test_source_model_change_invalidates_analysis_reuse_contract(role) -> None:
    settings = get_settings().model_copy(deep=True)
    current_contract = source_analysis_contract_version(settings)
    getattr(settings.llm.models, role).name = "previous-model"
    assert source_analysis_contract_version(settings) != current_contract
