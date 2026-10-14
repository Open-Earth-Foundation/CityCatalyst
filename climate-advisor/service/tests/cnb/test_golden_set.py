"""Fixture, extraction-stage, judge-contract, and orchestration tests.

No model calls and no judge calibration benchmark: these tests check exact
contracts, prompt structure, and plumbing. Later stages have their own files.
"""

from __future__ import annotations

import json
import re
from dataclasses import replace
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import NAMESPACE_URL, uuid5

import pytest
from app.models.cnb.golden_set import (
    ClaimJudgment,
    CoverageJudgment,
    FixtureReport,
    GoldenSetReport,
    JudgeEvaluation,
    StageReport,
    TextReference,
)
from app.persistence.concept_notes.context_bundle import ContextBundleBuildSnapshot
from app.persistence.concept_notes.markdown import ConceptNoteUploadSnapshot
from app.services.citycatalyst_client import ConceptNoteMarkdownArtifact
from app.services.cnb.context_bundle import ContextBundleService
from app.services.cnb.golden_set import (
    LoadedFixture,
    extraction_judge_input,
    fixture_problems,
    load_golden_fixtures,
    marker_parity_problems,
    score_extraction,
    verify_excerpts,
)
from app.services.cnb.golden_set_judge import (
    OUTPUT_TYPES,
    PROMPT_KEYS,
    GoldenJudgeError,
    judge_output,
    judge_prompt_versions,
)
from app.services.cnb.source_analysis import source_analysis_contract_version
from app.services.cnb.visual_context import VISUAL_CONTEXT_CONTRACT_VERSION
from service.scripts import evaluate_cnb_golden_set as evaluator

from app.config import get_settings

from tests.cnb.golden_set_helpers import HARBOR_POINT, load_all, reviewed_source, selected_source


@pytest.fixture(scope="module")
def fixtures() -> dict[str, LoadedFixture]:
    return load_all()


def test_fixtures_cover_formats_languages_and_every_stage(fixtures):
    assert {f.fixture.source.source_format for f in fixtures.values()} == {"pdf", "markdown"}
    assert {f.fixture.source.language for f in fixtures.values()} == {"en", "pl"}
    for loaded in fixtures.values():
        fixture = loaded.fixture
        assert fixture_problems(loaded) == [], fixture.fixture_id
        assert fixture.chapter_writing and fixture.verification and fixture.editing
        failures, retained = verify_excerpts(loaded, reviewed_source(loaded))
        assert failures == [], fixture.fixture_id
        assert retained


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
        loaded, summary="Summary", key_excerpts=[{"text": "Harbor Point", "page": 1}]
    )
    assert "invalid locator" in verify_excerpts(loaded, source)[0][0]


def test_polish_evidence_is_exact_at_its_pages(fixtures):
    loaded = fixtures["krakow-flood-drainage-plan"]
    fact = next(f for f in loaded.fixture.extraction.facts if f.id == "total-cost-city")
    page = next(u for u in loaded.units if u.anchor == "page-11")
    assert fact.evidence[0].text in page.text
    assert "1 275 867 730 zł" in fact.evidence[0].text


@pytest.mark.parametrize(
    "mutation",
    ["unknown_chapter", "unknown_extraction_fact", "unassigned_field", "broken_parity"],
)
def test_fixture_problems_detect_broken_cross_references(fixtures, mutation):
    loaded = fixtures["richfield-flood-risk"]
    fixture = loaded.fixture.model_copy(deep=True)
    template = loaded.drafting_input.model_copy(deep=True)
    reference = loaded.reference_draft.model_copy(deep=True)
    if mutation == "unknown_chapter":
        fixture.chapter_writing.facts[0].chapters = ["no_such_chapter"]
    elif mutation == "unknown_extraction_fact":
        fixture.chapter_writing.facts[0].extraction_fact = "no-such-fact"
    elif mutation == "unassigned_field":
        template.required_fields.append("an unowned template field")
    else:
        reference.chapters[0].body_markdown += "\n\n[Information needed: An orphan marker.]"
    broken = replace(loaded, fixture=fixture, drafting_input=template, reference_draft=reference)
    assert fixture_problems(broken)


def test_marker_parity_mirrors_production_normalization():
    gap = SimpleNamespace(question="Confirm the **submission date**.")
    assert marker_parity_problems("Text [Information needed: Confirm the submission date.]", [gap]) == []
    assert marker_parity_problems("No marker here.", [gap]) == [
        "structured gap without marker: confirm the submission date"
    ]
    assert marker_parity_problems("[Information needed: Orphan.]", []) == [
        "marker without structured gap: orphan"
    ]


@pytest.fixture
def judged_case(fixtures):
    """A small mocked extraction judgment to test plumbing, never judge accuracy."""
    loaded = fixtures["richfield-flood-risk"]
    fixture = loaded.fixture.model_copy(deep=True)
    fact = next(f for f in fixture.extraction.facts if f.id == "flood-risk-area-count")
    fixture.extraction.facts = [fact]
    fixture.extraction.topics = []
    loaded = replace(loaded, fixture=fixture)
    text = fact.evidence[0].text
    source = selected_source(
        loaded, summary=text, topics=[], key_excerpts=[{"text": text, "page": 30}]
    )
    payload, _ = extraction_judge_input(loaded, source)
    original = next(u for u in payload.evidence if u.kind == "source" and text in u.text)
    output = TextReference(unit_id=payload.outputs[0].id, quote=text)
    judgment = JudgeEvaluation(
        facts=[
            CoverageJudgment(
                id=fact.id, verdict="covered", output_refs=[output], reason="Mocked verdict"
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
                reason="Mocked verdict",
            )
        ],
    )
    return loaded, source, payload, judgment


def test_valid_judgment_is_aggregated_without_lexical_matching(judged_case):
    loaded, _, payload, judgment = judged_case
    report = score_extraction(loaded, payload, judgment, [])
    assert report.passed
    assert report.metrics == {
        "required_fact_coverage": 1.0,
        "required_facts_covered": 1,
        "required_facts_partially_covered": 0,
        "required_facts_missing": 0,
        "required_facts_contradicted": 0,
        "claim_support_rate": 1.0,
        "topic_coverage": 1.0,
    }


@pytest.mark.parametrize("mutation", ["missing_fact", "duplicate_fact"])
def test_missing_or_repeated_verdicts_withhold_metrics(judged_case, mutation):
    loaded, _, payload, judgment = judged_case
    if mutation == "missing_fact":
        judgment.facts = []
    else:
        judgment.facts.append(judgment.facts[0])
    report = score_extraction(loaded, payload, judgment, [])
    assert not report.passed
    assert report.evaluation_errors
    assert report.metrics == {}
    assert report.semantic_failures == []


@pytest.mark.parametrize(
    "mutation",
    ["invented_quote", "unknown_unit", "wrong_kind", "no_claims", "no_support", "topic_as_fact"],
)
def test_judge_references_never_invalidate_its_verdicts(judged_case, mutation):
    """References only point reviewers to text; the judge's meaning stands."""
    loaded, _, payload, judgment = judged_case
    if mutation == "invented_quote":
        judgment.claims[0].evidence[0].quote = "This quotation is invented."
    elif mutation == "unknown_unit":
        judgment.claims[0].evidence[0].unit_id = "source/does-not-exist"
    elif mutation == "wrong_kind":
        payload.evidence[0].kind = "supplied"
        judgment.claims[0].evidence = [
            TextReference(unit_id=payload.evidence[0].id, quote=payload.evidence[0].text)
        ]
    elif mutation == "no_claims":
        judgment.claims = []
    elif mutation == "no_support":
        judgment.claims[0].evidence = []
    else:
        payload.outputs.append(payload.outputs[0].model_copy(update={"id": "topic/0"}))
        judgment.facts[0].output_refs[0].unit_id = "topic/0"
    report = score_extraction(loaded, payload, judgment, [])
    assert report.evaluation_errors == []
    assert report.metrics["required_fact_coverage"] == 1.0
    assert report.passed


@pytest.mark.parametrize("summary", ["Unrelated description", "Contradictory assertion", ""])
def test_source_summary_never_enters_judge_input_or_changes_score(judged_case, summary):
    loaded, source, payload, judgment = judged_case
    source.summary = summary
    revised, failures = extraction_judge_input(loaded, source)
    assert revised == payload
    assert not failures
    if summary:
        assert summary not in revised.model_dump_json()
    assert [u.text for u in revised.evidence] == [u.text for u in loaded.units]
    assert score_extraction(loaded, revised, judgment, []).passed


def test_fact_only_in_summary_or_original_source_cannot_count_as_retained(judged_case):
    loaded, source, _, judgment = judged_case
    source.key_excerpts = []
    payload, failures = extraction_judge_input(loaded, source)
    assert not payload.outputs and not failures
    judgment.facts[0].verdict = "missing"
    judgment.facts[0].output_refs = []
    judgment.claims = []
    report = score_extraction(loaded, payload, judgment, [])
    assert not report.evaluation_errors
    assert report.metrics["required_fact_coverage"] == 0
    assert not report.passed


def test_partial_coverage_is_reported_separately(judged_case):
    loaded, _, payload, judgment = judged_case
    judgment.facts[0].verdict = "partially_covered"
    report = score_extraction(loaded, payload, judgment, [])
    assert not report.evaluation_errors
    assert report.metrics["required_fact_coverage"] == 0
    assert report.metrics["required_facts_partially_covered"] == 1


@pytest.mark.parametrize(
    "verdict", ["partially_supported", "unsupported", "contradicted", "uncertain"]
)
def test_non_supported_claims_fail_even_with_full_fact_coverage(judged_case, verdict):
    loaded, _, payload, judgment = judged_case
    judgment.claims[0].verdict = verdict
    report = score_extraction(loaded, payload, judgment, [])
    assert report.metrics["required_fact_coverage"] == 1
    assert not report.passed and report.semantic_failures


def test_empty_fixture_directory_fails(tmp_path):
    with pytest.raises(ValueError, match="No golden fixtures"):
        load_golden_fixtures(tmp_path)


def test_cli_selects_stages_and_has_no_repetition_mode():
    assert evaluator.selected_stages(evaluator.parse_args([]).stages) == [
        "extraction",
        "chapter_writing",
        "verification",
        "editing",
    ]
    args = evaluator.parse_args(["--stage", "chapter_writing", "--stage", "editing"])
    assert evaluator.selected_stages(args.stages) == ["extraction", "chapter_writing", "editing"]
    with pytest.raises(SystemExit):
        evaluator.parse_args(["--repeats", "2"])


@pytest.mark.asyncio
async def test_extraction_feeds_chapter_writing_and_later_stages_use_reference(
    fixtures, monkeypatch, tmp_path
):
    loaded = fixtures["richfield-flood-risk"]
    source = reviewed_source(loaded)
    judgment = JudgeEvaluation(facts=[], topics=[], claims=[], chapters=[], contradictions=[])
    extraction = AsyncMock(return_value=(StageReport(judgment=judgment), source))
    writing = AsyncMock(return_value=StageReport())
    verification = AsyncMock(return_value=StageReport())
    editing = AsyncMock(return_value=StageReport())
    monkeypatch.setattr(evaluator, "_evaluate_extraction", extraction)
    monkeypatch.setattr(evaluator, "_evaluate_chapter_writing", writing)
    monkeypatch.setattr(
        "app.services.cnb.golden_set_verification.evaluate_verification", verification
    )
    monkeypatch.setattr("app.services.cnb.golden_set_editing.evaluate_editing", editing)
    stages = evaluator.selected_stages(None)
    report = await evaluator._evaluate_fixture(loaded, get_settings(), stages, tmp_path)
    extraction.assert_awaited_once()
    assert writing.await_args.args[3] is source
    assert writing.await_args.args[4] is judgment
    verification.assert_awaited_once()
    editing.assert_awaited_once()
    assert report.extraction.judgment is judgment


@pytest.mark.asyncio
async def test_failed_extraction_blocks_chapter_writing(fixtures, monkeypatch, tmp_path):
    monkeypatch.setattr(
        evaluator,
        "_evaluate_extraction",
        AsyncMock(return_value=(StageReport(evaluation_errors=["analysis failed"]), None)),
    )
    writing = AsyncMock()
    monkeypatch.setattr(evaluator, "_evaluate_chapter_writing", writing)
    report = await evaluator._evaluate_fixture(
        fixtures["richfield-flood-risk"], get_settings(), ["extraction", "chapter_writing"], tmp_path
    )
    writing.assert_not_awaited()
    assert report.chapter_writing.evaluation_errors == ["blocked: extraction did not produce output"]


@pytest.mark.asyncio
async def test_invalid_fixture_is_an_evaluation_error_for_every_stage(
    fixtures, monkeypatch, tmp_path
):
    loaded = fixtures["richfield-flood-risk"]
    template = loaded.drafting_input.model_copy(deep=True)
    template.required_fields.append("an unowned template field")
    broken = replace(loaded, drafting_input=template)
    extraction = AsyncMock()
    monkeypatch.setattr(evaluator, "_evaluate_extraction", extraction)
    report = await evaluator._evaluate_fixture(broken, get_settings(), ["extraction"], tmp_path)
    extraction.assert_not_awaited()
    assert report.extraction.evaluation_errors[0].startswith("invalid fixture:")


@pytest.mark.asyncio
async def test_judge_unavailable_never_becomes_product_failure(
    judged_case, monkeypatch, tmp_path
):
    _, _, payload, _ = judged_case
    monkeypatch.setattr(
        evaluator, "judge_output", AsyncMock(side_effect=GoldenJudgeError("judge unavailable"))
    )
    report = await evaluator._judge(payload, get_settings(), tmp_path)
    assert report.evaluation_errors == ["judge unavailable"]
    assert not report.semantic_failures and not report.passed


@pytest.mark.asyncio
async def test_extraction_calls_producer_once_and_saves_judgment(
    judged_case, monkeypatch, tmp_path
):
    loaded, source, _, judgment = judged_case
    producer = AsyncMock(return_value=source)
    chapters = AsyncMock(return_value=[])
    monkeypatch.setattr(evaluator, "analyze_document", producer)
    monkeypatch.setattr(evaluator, "extract_chapter_evidence", chapters)
    monkeypatch.setattr(evaluator, "judge_output", AsyncMock(return_value=judgment))
    report, result = await evaluator._evaluate_extraction(loaded, get_settings(), tmp_path)
    producer.assert_awaited_once()
    # Per-chapter quotations follow the fixture's template, as in production.
    refs = [c["chapter_ref"] for c in chapters.await_args.kwargs["chapters"]]
    assert refs == [c["chapter_ref"] for c in loaded.drafting_input.chapter_schema]
    assert result.key_excerpts == source.key_excerpts and result.chapter_evidence_fingerprint
    assert report.passed
    assert (tmp_path / "analysis.json").exists()
    assert (tmp_path / "extraction/judgment.json").exists()


def _section(prompt: str, name: str) -> str:
    """The body of a block whose tags stand alone on their lines."""
    match = re.search(rf"^<{name}>$(.*?)^</{name}>$", prompt, re.M | re.S)
    assert match, name
    return match.group(1)


def _examples(prompt: str) -> list[dict]:
    return json.loads(_section(prompt, "examples"))


@pytest.mark.parametrize("stage", list(PROMPT_KEYS))
def test_prompt_structure_and_example_output(stage):
    prompt = get_settings().llm.prompts.get_prompt(PROMPT_KEYS[stage])
    sections = ("role", "task", "input", "examples", "output", "example_output")
    positions = [re.search(rf"^<{section}>$", prompt, re.M).start() for section in sections]
    assert positions == sorted(positions)
    OUTPUT_TYPES[stage].model_validate_json(_section(prompt, "example_output"))


@pytest.mark.parametrize("stage", list(PROMPT_KEYS))
def test_few_shot_passages_are_extracted_verbatim_from_fixtures(fixtures, stage):
    """Every example passage exists in its document and is never golden evidence."""
    prompt = get_settings().llm.prompts.get_prompt(PROMPT_KEYS[stage])
    examples = _examples(prompt)
    anchored = [e for e in examples if e.get("source_passage")]
    assert len(anchored) >= 3
    assert len({e["fixture"] for e in anchored}) >= 2
    for example in anchored:
        loaded = fixtures[example["fixture"]]
        unit = next(u for u in loaded.units if f"source/{u.anchor}" == example["unit"])
        assert example["source_passage"] in unit.text
        golden = [e.text for f in loaded.fixture.extraction.facts for e in f.evidence]
        assert not any(
            example["source_passage"] in text or text in example["source_passage"]
            for text in golden
        )
        if stage == "extraction":
            # Retained quotations are exact by contract, so examples must be too.
            assert example["output"] in unit.text


def test_prompt_fingerprints_cover_selected_stages():
    settings = get_settings()
    assert set(judge_prompt_versions(settings)) == set(PROMPT_KEYS)
    assert set(judge_prompt_versions(settings, ["editing"])) == {"editing"}
    assert all(len(d) == 64 for d in judge_prompt_versions(settings).values())


@pytest.mark.asyncio
async def test_judge_client_closes_and_uses_configured_model(judged_case, monkeypatch):
    _, _, payload, judgment = judged_case
    from app.services.cnb import golden_set_judge as module

    client = SimpleNamespace(close=AsyncMock())
    monkeypatch.setattr(
        module, "build_openrouter_client_options", lambda *a, **kw: SimpleNamespace(kwargs={})
    )
    monkeypatch.setattr(module, "AsyncOpenAI", lambda **kw: client)
    runner = SimpleNamespace(run=AsyncMock(return_value=SimpleNamespace(final_output=judgment)))
    assert await judge_output(payload, get_settings(), runner=runner) == judgment
    agent, sent = runner.run.await_args.args
    assert agent.model.model == get_settings().llm.models.cnb_golden_set_judge.name
    assert agent.output_type is JudgeEvaluation
    assert json.loads(sent)["stage"] == "extraction"
    client.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_judge_provider_error_is_sanitized_and_client_closed(judged_case, monkeypatch):
    _, _, payload, _ = judged_case
    from app.services.cnb import golden_set_judge as module

    client = SimpleNamespace(close=AsyncMock())
    monkeypatch.setattr(
        module, "build_openrouter_client_options", lambda *a, **kw: SimpleNamespace(kwargs={})
    )
    monkeypatch.setattr(module, "AsyncOpenAI", lambda **kw: client)
    runner = SimpleNamespace(run=AsyncMock(side_effect=RuntimeError("private provider body")))
    with pytest.raises(GoldenJudgeError, match="judge_failed: RuntimeError") as error:
        await judge_output(payload, get_settings(), runner=runner)
    assert "private" not in str(error.value)
    client.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_incremental_build_keeps_golden_analysis_byte_for_byte(fixtures, monkeypatch):
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
        **richfield.reference_draft.selected_source,
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
    new_analysis = selected_source(
        harbor,
        **harbor.reference_draft.selected_source,
    )
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
        "app.services.cnb.context_bundle.begin_build", AsyncMock(return_value=snapshot)
    )
    monkeypatch.setattr("app.services.cnb.context_bundle.complete_build", complete_build)
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
    assert all(
        a["anchor"].startswith(HARBOR_POINT)
        for a in harbor.reference_draft.selected_source["key_excerpts"]
    )


@pytest.mark.parametrize("invalid", [False, True])
def test_markdown_report_shows_counts_and_invalid_judgments(judged_case, invalid):
    loaded, _, payload, judgment = judged_case
    judgment.facts[0].verdict = "partially_covered"
    if invalid:
        judgment.facts = []
    stage = score_extraction(loaded, payload, judgment, [])
    report = GoldenSetReport(
        generated_at="test",
        analysis_contract_version="test",
        judge_prompt_versions={},
        models={},
        fixtures=[
            FixtureReport(
                fixture_id="test", source_sha256="test", source_format="pdf", extraction=stage
            )
        ],
    )
    markdown = evaluator.render_markdown(report)
    assert "### extraction: FAIL" in markdown
    if invalid:
        assert "Evaluation error" in markdown and "metrics withheld" in markdown
    else:
        assert "0 fully covered · 1 partially covered · 0 missing · 0 contradicted" in markdown
        assert re.search(r"facts `flood-risk-area-count`: \*\*partially_covered\*\*", markdown)
    assert "CNB golden set: FAIL" in markdown


def test_inflected_quote_on_the_wrong_page_keeps_the_judgment(judged_case):
    """Mirrors the live Polish slips that used to void a whole stage."""
    loaded, _, payload, judgment = judged_case
    judgment.claims[0].evidence[0] = TextReference(
        unit_id="source/page-4", quote="konieczność adaptacji do zmian klimatu"
    )
    judgment.facts[0].output_refs[0].quote = judgment.facts[0].output_refs[0].quote.upper()
    report = score_extraction(loaded, payload, judgment, [])
    assert report.evaluation_errors == []
    assert report.passed
    # The judge's own words are kept as written for reviewers.
    assert judgment.claims[0].evidence[0].quote == "konieczność adaptacji do zmian klimatu"


def test_pdf_fixtures_pin_their_original_pdf(fixtures):
    for loaded in fixtures.values():
        source = loaded.fixture.source
        if source.source_format == "pdf":
            assert source.original_pdf is not None, loaded.fixture.fixture_id
            assert (loaded.directory / source.original_pdf.path).exists()
    richfield = fixtures["richfield-flood-risk"]
    broken = replace(
        richfield,
        fixture=richfield.fixture.model_copy(
            update={
                "source": richfield.fixture.source.model_copy(
                    update={
                        "original_pdf": richfield.fixture.source.original_pdf.model_copy(
                            update={"sha256": "0" * 64}
                        )
                    }
                )
            }
        ),
    )
    assert "original PDF digest mismatch: source.pdf" in fixture_problems(broken)
