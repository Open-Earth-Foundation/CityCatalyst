"""Exact-check, judge-contract, and orchestration tests; no judge calibration benchmark."""

from __future__ import annotations

import json
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import NAMESPACE_URL, uuid5

import pytest
from app.models.cnb.context_bundle import SelectedSource
from app.models.cnb.golden_set import (
    ClaimJudgment,
    CoverageJudgment,
    JudgeEvaluation,
    StageReport,
    TextReference,
    TextUnit,
)
from app.persistence.concept_notes.context_bundle import ContextBundleBuildSnapshot
from app.persistence.concept_notes.markdown import ConceptNoteUploadSnapshot
from app.services.citycatalyst_client import ConceptNoteMarkdownArtifact
from app.services.cnb.context_bundle import ContextBundleService
from app.services.cnb.golden_set import (
    LoadedFixture,
    golden_evidence_problems,
    load_drafting_input,
    load_golden_fixtures,
    score_judgment,
    source_judge_input,
    validate_judgment,
    verify_excerpts,
)
from app.services.cnb.golden_set_judge import (
    GoldenJudgeError,
    judge_output,
    judge_prompt_versions,
)
from app.services.cnb.source_analysis import source_analysis_contract_version
from app.services.cnb.visual_context import VISUAL_CONTEXT_CONTRACT_VERSION
from service.scripts import evaluate_cnb_golden_set as evaluator

from app.config import get_settings

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "cnb_golden_set"
HARBOR_POINT = "harbor-point-heat-and-stormwater-resilience-plan"


@pytest.fixture(scope="module")
def fixtures() -> dict[str, LoadedFixture]:
    """Load every checked-in fixture once through the production source contract."""
    return {
        item.fixture.fixture_id: item for item in load_golden_fixtures(FIXTURES_DIR)
    }


def selected_source(loaded: LoadedFixture, **values) -> SelectedSource:
    """Build an analysis result with the fixture's identity fields."""
    source = loaded.fixture.source
    is_pdf = source.source_format == "pdf"
    return SelectedSource.model_validate(
        {
            "upload_id": uuid5(NAMESPACE_URL, loaded.fixture.fixture_id),
            "source_label": source.source_label,
            "filename": source.filename,
            "sha256": source.sha256,
            "source_format": source.source_format,
            "page_count": len(loaded.units) if is_pdf else None,
            "block_count": None if is_pdf else len(loaded.units),
            "topics": [],
            **values,
        }
    )


def harbor_anchor(loaded: LoadedFixture, heading: str, contains: str) -> str:
    """Return the anchor of the block under a heading that contains given text."""
    return next(
        unit.anchor
        for unit in loaded.units
        if unit.anchor.startswith(f"{HARBOR_POINT}/{heading}/")
        and contains in unit.text
    )


def harbor_analysis(loaded: LoadedFixture, summary: str) -> SelectedSource:
    """Return a grounded Harbor Point analysis with the given summary wording."""
    excerpts = [
        (
            "summary",
            "The plan was adopted by the Harbor Point City Council on 14 March 2026.",
        ),
        ("summary", "Harbor Point has 182,400 residents."),
        (
            "climate-risks/extreme-heat",
            "Harbor Point recorded 23 days above 35 °C in 2025",
        ),
        (
            "climate-risks/stormwater-flooding",
            "Street flooding affects 37 intersections during a 10-year rainfall event.",
        ),
        (
            "measures/cool-corridors",
            "The plan will plant 4,800 street trees along 12 cool corridors",
        ),
        (
            "measures/green-stormwater-infrastructure",
            "The plan will build 85 bioretention cells",
        ),
        (
            "financing",
            "The total programme cost is USD 26.5 million. Harbor Point will contribute "
            "USD 7.9 million from its capital budget, and the plan seeks USD 18.6 "
            "million in external grant funding.",
        ),
    ]
    return selected_source(
        loaded,
        summary=summary,
        topics=[
            "extreme heat",
            "stormwater flooding",
            "tree canopy",
            "green infrastructure",
            "financing",
        ],
        key_excerpts=[
            {"text": text, "anchor": harbor_anchor(loaded, heading, text)}
            for heading, text in excerpts
        ],
    )


HARBOR_SUMMARY = (
    "The Harbor Point City Council adopted the Harbor Point Heat and Stormwater "
    "Resilience Plan on 14 March 2026. Harbor Point has 182,400 residents. Harbor "
    "Point recorded 23 days above 35 °C in 2025. Street flooding in Harbor Point "
    "affects 37 intersections during a 10-year rainfall event. The Harbor Point "
    "plan will plant 4,800 street trees along 12 cool corridors and build 85 "
    "bioretention cells. The Harbor Point programme costs USD 26.5 million and "
    "seeks USD 18.6 million in external grant funding."
)


def test_fixtures_preserve_exact_evidence_and_both_source_formats(fixtures):
    assert {item.fixture.source.source_format for item in fixtures.values()} == {
        "pdf",
        "markdown",
    }
    for loaded in fixtures.values():
        assert golden_evidence_problems(loaded) == []
    richfield = fixtures["richfield-flood-risk"]
    frozen = selected_source(
        richfield, **load_drafting_input(richfield).selected_source
    )
    failures, retained = verify_excerpts(richfield, frozen)
    assert failures == []
    assert len(retained) == len(frozen.key_excerpts)


def test_invalid_locators_nonexact_and_empty_quotes_are_rejected(fixtures):
    loaded = fixtures["richfield-flood-risk"]
    source = selected_source(
        loaded,
        summary="Text",
        key_excerpts=[
            {"text": "invented", "page": 999},
            {"text": "invented", "page": 30},
            {"text": " ", "page": 30},
        ],
    )
    failures, retained = verify_excerpts(loaded, source)
    assert len(failures) == 3
    assert "invalid locator" in failures[0]
    assert "non-exact" in failures[1]
    assert not retained


def test_markdown_cannot_cite_pdf_pages(fixtures):
    loaded = fixtures["harbor-point-heat-resilience"]
    source = selected_source(
        loaded,
        summary=HARBOR_SUMMARY,
        key_excerpts=[{"text": "Harbor Point", "page": 1}],
    )
    assert "invalid locator" in verify_excerpts(loaded, source)[0][0]


@pytest.fixture
def judged_case(fixtures):
    """A small mocked judge response to test plumbing, never judge accuracy."""
    loaded = fixtures["richfield-flood-risk"]
    fixture = loaded.fixture.model_copy(deep=True)
    fact = next(
        f for f in fixture.source_analysis.facts if f.id == "flood-risk-area-count"
    )
    fixture.source_analysis.facts = [fact]
    fixture.source_analysis.topics = []
    loaded = replace(loaded, fixture=fixture)
    text = fact.evidence[0].text
    source = selected_source(
        loaded, summary=text, topics=[], key_excerpts=[{"text": text, "page": 30}]
    )
    payload, failures = source_judge_input(loaded, source)
    original = next(
        u for u in payload.evidence if u.kind == "source" and text in u.text
    )
    output = TextReference(unit_id=payload.outputs[0].id, quote=text)
    judgment = JudgeEvaluation(
        facts=[
            CoverageJudgment(
                id=fact.id,
                verdict="covered",
                output_refs=[output],
                reason="Mocked semantic verdict",
            )
        ],
        topics=[],
        chapters=[],
        contradictions=[],
        claims=[
            ClaimJudgment(
                output=output,
                verdict="supported",
                evidence=[TextReference(unit_id=original.id, quote=text)],
                supplied_verdict=None,
                supplied_evidence=[],
                self_contained=True,
                reason="Mocked semantic verdict",
            )
        ],
    )
    return loaded, source, payload, judgment


def test_valid_judgment_is_aggregated_without_lexical_matching(judged_case):
    loaded, _, payload, judgment = judged_case
    report = score_judgment(loaded, payload, judgment, [])
    assert report.passed
    assert report.metrics == {
        "required_fact_coverage": 1.0,
        "required_facts_covered": 1,
        "required_facts_partially_covered": 0,
        "required_facts_missing": 0,
        "required_facts_contradicted": 0,
        "topic_coverage": 1.0,
    }


@pytest.mark.parametrize(
    "mutation",
    [
        "missing_fact",
        "duplicate_fact",
        "invented_quote",
        "unknown_unit",
        "wrong_kind",
        "no_claims",
        "no_support",
        "topic_as_fact",
    ],
)
def test_invalid_judge_response_withholds_metrics(judged_case, mutation):
    loaded, _, payload, judgment = judged_case
    if mutation == "missing_fact":
        judgment.facts = []
    elif mutation == "duplicate_fact":
        judgment.facts.append(judgment.facts[0])
    elif mutation == "invented_quote":
        judgment.claims[0].evidence[0].quote = "This quotation is invented."
    elif mutation == "unknown_unit":
        judgment.claims[0].evidence[0].unit_id = "source/does-not-exist"
    elif mutation == "wrong_kind":
        payload.evidence[0].kind = "supplied"
        judgment.claims[0].evidence = [
            TextReference(
                unit_id=payload.evidence[0].id, quote=payload.evidence[0].text
            )
        ]
    elif mutation == "no_claims":
        judgment.claims = []
    elif mutation == "no_support":
        judgment.claims[0].evidence = []
    else:
        payload.outputs.append(payload.outputs[0].model_copy(update={"id": "topic/0"}))
        judgment.facts[0].output_refs[0].unit_id = "topic/0"
    report = score_judgment(loaded, payload, judgment, [])
    assert not report.passed
    assert report.evaluation_errors
    assert report.metrics == {}
    assert report.semantic_failures == []


@pytest.mark.parametrize(
    "summary", ["Unrelated description", "Contradictory generated assertion", ""]
)
def test_source_summary_never_enters_judge_input_or_changes_score(judged_case, summary):
    loaded, source, payload, judgment = judged_case
    source.summary = summary
    revised, failures = source_judge_input(loaded, source)
    assert revised == payload
    assert not failures
    if summary:
        assert summary not in revised.model_dump_json()
    assert [u.text for u in revised.evidence] == [u.text for u in loaded.units]
    assert score_judgment(loaded, revised, judgment, []).passed


def test_fact_only_in_summary_or_original_source_cannot_count_as_retained(judged_case):
    loaded, source, _, judgment = judged_case
    # The expected fact remains in both the summary and original document.
    source.key_excerpts = []
    payload, failures = source_judge_input(loaded, source)
    assert not payload.outputs
    assert not failures
    assert validate_judgment(payload, judgment)
    judgment.facts[0].verdict = "missing"
    judgment.facts[0].output_refs = []
    judgment.claims = []
    report = score_judgment(loaded, payload, judgment, [])
    assert not report.evaluation_errors
    assert report.metrics["required_fact_coverage"] == 0
    assert report.metrics["required_facts_missing"] == 1
    assert not report.passed


def test_source_stage_rejects_old_summary_support_assessment(judged_case):
    _, _, payload, judgment = judged_case
    judgment.claims[0].supplied_verdict = "supported"
    assert (
        "source analysis must not judge supplied-evidence support"
        in validate_judgment(payload, judgment)
    )


def test_partial_coverage_is_reported_separately(judged_case):
    loaded, _, payload, judgment = judged_case
    judgment.facts[0].verdict = "partially_covered"
    report = score_judgment(loaded, payload, judgment, [])
    assert not report.evaluation_errors
    assert report.metrics["required_fact_coverage"] == 0
    assert report.metrics["required_facts_partially_covered"] == 1
    assert report.metrics["required_facts_missing"] == 0


@pytest.mark.parametrize(
    "verdict", ["partially_supported", "unsupported", "contradicted", "uncertain"]
)
def test_non_supported_claims_fail_even_with_full_fact_coverage(judged_case, verdict):
    loaded, _, payload, judgment = judged_case
    judgment.claims[0].verdict = verdict
    report = score_judgment(loaded, payload, judgment, [])
    assert report.metrics["required_fact_coverage"] == 1
    assert not report.passed
    assert report.semantic_failures


def test_empty_fixture_directory_fails(tmp_path):
    with pytest.raises(ValueError, match="No golden fixtures"):
        load_golden_fixtures(tmp_path)


def test_cli_has_no_repetition_mode():
    assert evaluator.parse_args([]).stage == "all"
    with pytest.raises(SystemExit):
        evaluator.parse_args(["--repeats", "2"])


@pytest.mark.asyncio
async def test_all_mode_reuses_one_fresh_analysis_for_end_to_end(
    fixtures, monkeypatch, tmp_path
):
    loaded = fixtures["richfield-flood-risk"]
    source = selected_source(loaded, **load_drafting_input(loaded).selected_source)
    analysis = AsyncMock(
        return_value=(StageReport(semantic_failures=["example upstream issue"]), source)
    )
    drafting = AsyncMock(return_value=StageReport())
    monkeypatch.setattr(evaluator, "_evaluate_source_analysis", analysis)
    monkeypatch.setattr(evaluator, "_evaluate_drafting", drafting)
    report = await evaluator._evaluate_fixture(loaded, get_settings(), "all", tmp_path)
    analysis.assert_awaited_once()
    assert drafting.await_count == 2
    assert len(drafting.await_args_list[0].args) == 3  # Frozen input.
    assert drafting.await_args_list[1].args[3] is source
    assert report.source_analysis.semantic_failures == ["example upstream issue"]
    assert not report.passed


@pytest.mark.asyncio
async def test_failed_analysis_blocks_end_to_end(fixtures, monkeypatch, tmp_path):
    monkeypatch.setattr(
        evaluator,
        "_evaluate_source_analysis",
        AsyncMock(
            return_value=(StageReport(evaluation_errors=["analysis failed"]), None)
        ),
    )
    drafting = AsyncMock()
    monkeypatch.setattr(evaluator, "_evaluate_drafting", drafting)
    report = await evaluator._evaluate_fixture(
        fixtures["richfield-flood-risk"], get_settings(), "end_to_end", tmp_path
    )
    drafting.assert_not_awaited()
    assert report.end_to_end.evaluation_errors


@pytest.mark.asyncio
async def test_judge_unavailable_never_becomes_product_failure(
    judged_case, monkeypatch, tmp_path
):
    loaded, _, payload, _ = judged_case
    monkeypatch.setattr(
        evaluator,
        "judge_output",
        AsyncMock(side_effect=GoldenJudgeError("judge unavailable")),
    )
    report = await evaluator._judge_stage(loaded, payload, [], get_settings(), tmp_path)
    assert report.evaluation_errors == ["judge unavailable"]
    assert not report.semantic_failures
    assert not report.passed


@pytest.mark.asyncio
async def test_source_analysis_calls_producer_once_and_saves_judgment(
    judged_case, monkeypatch, tmp_path
):
    loaded, source, _, judgment = judged_case
    producer = AsyncMock(return_value=source)
    monkeypatch.setattr(evaluator, "analyze_document", producer)
    monkeypatch.setattr(evaluator, "judge_output", AsyncMock(return_value=judgment))
    report, result = await evaluator._evaluate_source_analysis(
        loaded, get_settings(), tmp_path
    )
    producer.assert_awaited_once()
    assert result is source and report.passed
    assert (tmp_path / "analysis.json").exists()
    assert (tmp_path / "source_analysis/judgment.json").exists()


def test_fresh_source_replaces_frozen_source_in_drafting_workspace(fixtures):
    loaded = fixtures["richfield-flood-risk"]
    fresh = selected_source(
        loaded, summary="Fresh analysis", topics=[], key_excerpts=[]
    )
    _, frozen_context, _, _ = evaluator._drafting_workspace(loaded, get_settings())
    _, fresh_context, _, _ = evaluator._drafting_workspace(
        loaded, get_settings(), fresh
    )
    assert (
        fresh_context["context_bundle"]["selected_sources"][0]["summary"]
        == "Fresh analysis"
    )
    assert (
        frozen_context["context_bundle"]["selected_sources"][0]["summary"]
        != "Fresh analysis"
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("fresh", [False, True])
async def test_drafting_judge_receives_actual_inputs_without_previous_generated_text(
    fixtures, monkeypatch, tmp_path, fresh
):
    loaded = fixtures["richfield-flood-risk"]
    producer = AsyncMock(
        return_value=SimpleNamespace(body_markdown="GENERATED CLAIM MARKER")
    )
    monkeypatch.setattr(evaluator, "generate_chapter_draft", producer)
    judge = AsyncMock(return_value=StageReport())
    monkeypatch.setattr(evaluator, "_judge_stage", judge)
    source = (
        selected_source(loaded, **load_drafting_input(loaded).selected_source)
        if fresh
        else None
    )
    if source is not None:
        source.summary = "FRESH GENERATED SUMMARY THAT MUST NEVER REACH THE JUDGE"
    await evaluator._evaluate_drafting(loaded, get_settings(), tmp_path, source)
    payload = judge.await_args.args[1]
    assert len(payload.outputs) == 8
    assert len(payload.chapter_requirements) == 8
    assert all(unit.text == "GENERATED CLAIM MARKER" for unit in payload.outputs)
    assert not any("GENERATED CLAIM MARKER" in unit.text for unit in payload.evidence)
    assert any(unit.kind == "source" for unit in payload.evidence)
    assert any(
        unit.kind == "context" and "36994" in unit.text for unit in payload.evidence
    )
    assert any(unit.id.startswith("supplied/shared/") for unit in payload.evidence)
    source_summary = (
        source.summary
        if source is not None
        else load_drafting_input(loaded).selected_source["summary"]
    )
    assert source_summary not in payload.model_dump_json()
    assert all(not unit.id.endswith("/summary") for unit in payload.evidence)
    # Filtering judge evidence must not mutate the production inputs.
    assert (
        producer.await_args_list[0].args[0]["run_context"]["context_bundle"][
            "selected_sources"
        ][0]["summary"]
        == source_summary
    )
    assert [u.text for u in payload.evidence if u.kind == "source"] == [
        u.text for u in loaded.units
    ]


def test_prompt_format_examples_and_fingerprints():
    settings = get_settings()
    for key in ("cnb_golden_set_source_judge", "cnb_golden_set_drafting_judge"):
        prompt = settings.llm.prompts.get_prompt(key)
        positions = [
            prompt.index(f"<{section}>")
            for section in ("role", "task", "input", "output", "example_output")
        ]
        assert positions == sorted(positions)
        example = prompt.split("<example_output>")[1].split("</example_output>")[0]
        JudgeEvaluation.model_validate_json(example)
    assert all(len(digest) == 64 for digest in judge_prompt_versions(settings).values())


@pytest.mark.asyncio
async def test_judge_client_closes_and_uses_configured_model(judged_case, monkeypatch):
    _, _, payload, judgment = judged_case
    from app.services.cnb import golden_set_judge as module

    client = SimpleNamespace(close=AsyncMock())
    monkeypatch.setattr(
        module,
        "build_openrouter_client_options",
        lambda *a, **kw: SimpleNamespace(kwargs={}),
    )
    monkeypatch.setattr(module, "AsyncOpenAI", lambda **kw: client)
    runner = SimpleNamespace(
        run=AsyncMock(return_value=SimpleNamespace(final_output=judgment))
    )
    assert await judge_output(payload, get_settings(), runner=runner) == judgment
    agent, sent = runner.run.await_args.args
    assert agent.model.model == get_settings().llm.models.cnb_golden_set_judge.name
    assert json.loads(sent)["stage"] == "source_analysis"
    client.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_judge_provider_error_is_sanitized_and_client_closed(
    judged_case, monkeypatch
):
    _, _, payload, _ = judged_case
    from app.services.cnb import golden_set_judge as module

    client = SimpleNamespace(close=AsyncMock())
    monkeypatch.setattr(
        module,
        "build_openrouter_client_options",
        lambda *a, **kw: SimpleNamespace(kwargs={}),
    )
    monkeypatch.setattr(module, "AsyncOpenAI", lambda **kw: client)
    runner = SimpleNamespace(
        run=AsyncMock(side_effect=RuntimeError("private provider body"))
    )
    with pytest.raises(GoldenJudgeError, match="judge_failed: RuntimeError") as error:
        await judge_output(payload, get_settings(), runner=runner)
    assert "private" not in str(error.value)
    client.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_incremental_build_keeps_golden_analysis_byte_for_byte(
    fixtures, monkeypatch
) -> None:
    """Adding one upload analyzes only it and keeps the unchanged analysis exactly."""
    richfield = fixtures["richfield-flood-risk"]
    harbor = fixtures["harbor-point-heat-resilience"]
    run_id = uuid5(NAMESPACE_URL, "golden-incremental-run")
    now = datetime.now(UTC)

    def upload(loaded: LoadedFixture) -> ConceptNoteUploadSnapshot:
        source = loaded.fixture.source
        return ConceptNoteUploadSnapshot(
            upload_id=uuid5(NAMESPACE_URL, loaded.fixture.fixture_id),
            run_id=run_id,
            user_id="owner",
            filename=source.filename,
            source_label=source.source_label,
            markdown_s3_key=f"golden/{loaded.fixture.fixture_id}.md",
            markdown_sha256=source.sha256,
            page_count=source.page_count,
            status="ready",
            error_code=None,
            received_at=now,
            completed_at=now,
            source_format=source.source_format,
        )

    uploads = [upload(richfield), upload(harbor)]
    previous = selected_source(
        richfield,
        **load_drafting_input(richfield).selected_source,
        analysis_contract_version=source_analysis_contract_version(get_settings()),
        visual_context_contract_version=VISUAL_CONTEXT_CONTRACT_VERSION,
        visual_context=[],
    )
    previous_json = previous.model_dump_json()
    snapshot = ContextBundleBuildSnapshot(
        run_id=run_id,
        city_id=str(uuid5(NAMESPACE_URL, "golden-incremental-city")),
        build_id=uuid5(NAMESPACE_URL, "golden-incremental-build"),
        uploads=uploads,
        already_current=False,
        previous_sources=[previous],
    )
    artifacts = {
        str(item.upload_id): ConceptNoteMarkdownArtifact(
            markdown=loaded.markdown,
            markdown_s3_key=item.markdown_s3_key,
            sha256=item.markdown_sha256,
            source_format=item.source_format,
            page_count=item.page_count,
        )
        for item, loaded in zip(uploads, [richfield, harbor], strict=True)
    }
    new_analysis = harbor_analysis(harbor, HARBOR_SUMMARY)
    analyze = AsyncMock(return_value=new_analysis)
    complete_build = AsyncMock(return_value=True)
    client = SimpleNamespace(
        get_concept_note_markdown=AsyncMock(
            side_effect=lambda *, upload_id, token: artifacts[upload_id]
        ),
        close=AsyncMock(),
    )
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.load_accessible_inventory",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.begin_build",
        AsyncMock(return_value=snapshot),
    )
    monkeypatch.setattr(
        "app.services.cnb.context_bundle.complete_build", complete_build
    )
    service = ContextBundleService(
        None,  # type: ignore[arg-type]
        analyze_document_fn=analyze,
        cc_client_factory=lambda: client,
    )

    assert await service.build(user_id="owner", run_id=run_id, token="token")

    # Only the new native Markdown upload reaches the analyzer.
    analyze.assert_awaited_once()
    assert analyze.await_args.kwargs["upload_id"] == uploads[1].upload_id
    assert analyze.await_args.kwargs["pages"] == harbor.units
    selected = complete_build.await_args.kwargs["selected_sources"]
    assert selected[0].model_dump_json() == previous_json
    assert selected[1].analysis_contract_version == previous.analysis_contract_version


def test_shared_input_deduplication_preserves_chapter_specific_values():
    units = [
        TextUnit(
            id="supplied/a/source/text",
            text="Common source",
            kind="supplied",
            chapter_ref="a",
        ),
        TextUnit(
            id="supplied/b/source/text",
            text="Common source",
            kind="supplied",
            chapter_ref="b",
        ),
        TextUnit(
            id="supplied/a/resolved/cost", text="120", kind="supplied", chapter_ref="a"
        ),
        TextUnit(
            id="supplied/b/resolved/cost", text="150", kind="supplied", chapter_ref="b"
        ),
    ]
    result = evaluator._share_common_inputs(units, {"a", "b"})
    assert len(result) == 3
    common = next(unit for unit in result if unit.text == "Common source")
    assert common.id == "supplied/shared/source/text" and common.chapter_ref is None
    assert next(unit for unit in result if unit.text == "120").chapter_ref == "a"
    assert next(unit for unit in result if unit.text == "150").chapter_ref == "b"


def test_judge_cannot_cite_another_chapters_input(judged_case):
    _, _, payload, judgment = judged_case
    payload.stage = "drafting"
    payload.outputs[0].chapter_ref = "a"
    original = payload.evidence[0]
    supplied = TextUnit(
        id="supplied/b/source", text=original.text, kind="supplied", chapter_ref="b"
    )
    payload.evidence.append(supplied)
    judgment.claims[0].supplied_verdict = "supported"
    judgment.claims[0].supplied_evidence = [
        TextReference(unit_id=supplied.id, quote=supplied.text)
    ]
    assert any(
        "different chapter" in error for error in validate_judgment(payload, judgment)
    )


def test_judge_cannot_cover_fact_in_disallowed_chapter(judged_case):
    _, _, payload, judgment = judged_case
    payload.stage = "drafting"
    payload.expected_facts[0].chapters = ["funding"]
    payload.outputs[0].chapter_ref = "activities"
    assert any(
        "outside allowed chapters" in error
        for error in validate_judgment(payload, judgment)
    )


@pytest.mark.parametrize("invalid", [False, True])
def test_markdown_identifies_scope_counts_and_invalid_judgments(judged_case, invalid):
    from app.models.cnb.golden_set import FixtureReport, GoldenSetReport

    loaded, _, payload, judgment = judged_case
    judgment.facts[0].verdict = "partially_covered"
    if invalid:
        judgment.claims[0].evidence[0].quote = "Invented evidence"
    stage = score_judgment(loaded, payload, judgment, [])
    report = GoldenSetReport(
        generated_at="test",
        analysis_contract_version="test",
        judge_prompt_versions={},
        models={},
        fixtures=[
            FixtureReport(
                fixture_id="test",
                source_sha256="test",
                source_format="pdf",
                source_analysis=stage,
            )
        ],
    )
    markdown = evaluator.render_markdown(report)
    assert "retained source quotations" in markdown
    assert "generated source summaries are excluded" in markdown
    if invalid:
        assert "Evaluation error" in markdown
        assert "metrics withheld" in markdown
        assert "untrusted" in markdown
    else:
        assert (
            "0 fully covered · 1 partially covered · 0 missing · 0 contradicted"
            in markdown
        )
        assert "Fully covered required facts: 0.0%" in markdown
    assert "CNB golden set: FAIL" in markdown


def test_draft_with_covered_facts_requires_claim_assessment(judged_case):
    _, _, payload, judgment = judged_case
    payload.stage = "drafting"
    judgment.claims = []
    assert "covered factual output has no claim judgments" in validate_judgment(
        payload, judgment
    )


def test_drafting_requires_supplied_evidence_assessment(judged_case):
    _, _, payload, judgment = judged_case
    payload.stage = "drafting"
    assert any(
        "missing supplied-evidence verdict" in e
        for e in validate_judgment(payload, judgment)
    )
