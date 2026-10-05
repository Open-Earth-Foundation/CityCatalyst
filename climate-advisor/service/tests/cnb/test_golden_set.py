"""Deterministic checks for the CNB grounding golden set and its scorer."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import NAMESPACE_URL, uuid5

import pytest
from app.config import get_settings
from app.models.cnb.context_bundle import SelectedSource
from app.models.cnb.golden_set import TermMatch
from app.persistence.concept_notes.context_bundle import ContextBundleBuildSnapshot
from app.persistence.concept_notes.markdown import ConceptNoteUploadSnapshot
from app.services.citycatalyst_client import ConceptNoteMarkdownArtifact
from app.services.cnb.context_bundle import ContextBundleService
from app.services.cnb.golden_set import (
    DraftedChapter,
    LoadedFixture,
    compare_source_analyses,
    drafting_failures,
    extract_numbers,
    golden_evidence_problems,
    load_drafting_input,
    load_golden_fixtures,
    matches_terms,
    score_drafting,
    score_source_analysis,
    source_analysis_failures,
)
from app.services.cnb.source_analysis import source_analysis_contract_version
from app.services.cnb.visual_context import VISUAL_CONTEXT_CONTRACT_VERSION

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


def test_checked_in_fixtures_cover_both_formats_with_exact_evidence(fixtures) -> None:
    """Every fixture revalidates and its evidence is exact at an allowed locator."""
    formats = {item.fixture.source.source_format for item in fixtures.values()}
    assert formats == {"pdf", "markdown"}
    for loaded in fixtures.values():
        assert golden_evidence_problems(loaded) == []


def test_frozen_drafting_bundle_passes_its_own_analysis_gates(fixtures) -> None:
    """Stage 2 drafts from a reviewed analysis that stage 1 would accept."""
    loaded = fixtures["richfield-flood-risk"]
    frozen = selected_source(loaded, **load_drafting_input(loaded).selected_source)

    score = score_source_analysis(loaded, frozen, run=1)

    thresholds = loaded.fixture.source_analysis.thresholds
    assert source_analysis_failures(thresholds, [score]) == []
    assert score.unsupported_sentences == []
    assert score.excerpt_findings == []


def test_reworded_grounded_summary_passes_without_exact_strings(fixtures) -> None:
    loaded = fixtures["harbor-point-heat-resilience"]

    score = score_source_analysis(
        loaded, harbor_analysis(loaded, HARBOR_SUMMARY), run=1
    )

    assert score.required_fact_coverage == 1.0
    assert score.fact_grounding == 1.0
    assert score.topic_coverage == 1.0
    assert score.unsupported_sentence_rate == 0.0
    assert (
        source_analysis_failures(loaded.fixture.source_analysis.thresholds, [score])
        == []
    )


def test_invalid_locators_and_non_exact_excerpts_fail_every_run(fixtures) -> None:
    loaded = fixtures["richfield-flood-risk"]
    source = selected_source(
        loaded,
        summary="The Richfield study evaluated 746 flood-risk areas.",
        topics=["flood-risk prioritization"],
        key_excerpts=[
            {"text": "A total of 746 flood-risk areas were evaluated", "page": 31},
            {"text": "A total of 746 flood risk areas were evaluated", "page": 30},
        ],
    )

    score = score_source_analysis(loaded, source, run=1)

    assert score.invalid_locators == 0
    assert score.non_exact_excerpts == 2
    assert [item.reason for item in score.excerpt_findings] == [
        "text_not_exact_at_locator",
        "text_not_exact_at_locator",
    ]
    failures = source_analysis_failures(
        loaded.fixture.source_analysis.thresholds, [score]
    )
    assert "non_exact_excerpts 2 > 0" in failures


def test_markdown_excerpt_with_a_page_locator_is_invalid(fixtures) -> None:
    loaded = fixtures["harbor-point-heat-resilience"]
    source = selected_source(
        loaded,
        summary=HARBOR_SUMMARY,
        topics=["heat"],
        key_excerpts=[{"text": "Harbor Point has 182,400 residents.", "page": 1}],
    )

    score = score_source_analysis(loaded, source, run=1)

    assert score.invalid_locators == 1
    assert score.excerpt_findings[0].reason == "locator_not_in_source"


def test_summary_claim_without_a_retained_excerpt_is_unsupported(fixtures) -> None:
    """A true document fact still fails when its supporting excerpt was dropped."""
    loaded = fixtures["richfield-flood-risk"]
    source = selected_source(
        loaded,
        summary=(
            "The Richfield study presents the Section 5 cost estimates as a concept "
            "level design, and all costs are presented in 2025 US dollars."
        ),
        topics=["cost estimates"],
        key_excerpts=[
            {
                "text": "The projects, model results, and cost estimates presented in "
                "Section 5 are represent a concept level design.",
                "page": 48,
            }
        ],
    )

    score = score_source_analysis(loaded, source, run=1)

    assert score.unsupported_sentence_rate == 1.0
    assert score.unsupported_sentences[0].reason == (
        "figures_not_in_retained_excerpts: 2025"
    )
    assert "cost-basis" in score.ungrounded_facts


def test_invented_summary_wording_has_low_term_support(fixtures) -> None:
    loaded = fixtures["harbor-point-heat-resilience"]
    source = harbor_analysis(
        loaded,
        HARBOR_SUMMARY
        + " Harbor Point will also electrify municipal ferries and retrofit seawalls.",
    )

    score = score_source_analysis(loaded, source, run=1)

    assert len(score.unsupported_sentences) == 1
    assert score.unsupported_sentences[0].reason.startswith("term_support")


def test_missing_facts_topics_and_ambiguous_subjects_are_reported(fixtures) -> None:
    loaded = fixtures["harbor-point-heat-resilience"]
    source = selected_source(
        loaded,
        summary="Harbor Point has 182,400 residents. It plans new trees.",
        topics=["population"],
        key_excerpts=[
            {
                "text": "Harbor Point has 182,400 residents.",
                "anchor": harbor_anchor(loaded, "summary", "182,400"),
            }
        ],
    )

    score = score_source_analysis(loaded, source, run=1)

    assert "programme-financing" in score.missing_required_facts
    assert "financing" in score.missing_topics
    assert score.ambiguous_sentence_rate == 0.5
    failures = source_analysis_failures(
        loaded.fixture.source_analysis.thresholds, [score]
    )
    assert any(failure.startswith("required_fact_coverage") for failure in failures)
    assert any(failure.startswith("ambiguous_sentence_rate") for failure in failures)


def test_demonstrative_opener_naming_its_subject_is_not_ambiguous(fixtures) -> None:
    loaded = fixtures["harbor-point-heat-resilience"]
    summary = (
        HARBOR_SUMMARY.replace(
            "The Harbor Point City Council adopted",
            "This Harbor Point City Council adopted",
        )
        + " This plan also adds cooling centres."
    )

    score = score_source_analysis(loaded, harbor_analysis(loaded, summary), run=1)

    assert [item.sentence for item in score.ambiguous_sentences] == [
        "This plan also adds cooling centres."
    ]


def test_stability_is_reported_separately_from_correctness(fixtures) -> None:
    """Two correct but differently worded runs pass and report their variation."""
    loaded = fixtures["harbor-point-heat-resilience"]
    first = harbor_analysis(loaded, HARBOR_SUMMARY)
    second = harbor_analysis(
        loaded,
        HARBOR_SUMMARY.replace("adopted", "approved").replace("seeks", "requests"),
    ).model_copy(
        update={"topics": ["heat risk", "flooding", "trees", "green space", "budget"]}
    )
    second = second.model_copy(
        update={"key_excerpts": second.key_excerpts[:-1] + first.key_excerpts[-1:]}
    )
    sources = [first, second]
    scores = [
        score_source_analysis(loaded, item, run=run)
        for run, item in enumerate(sources, 1)
    ]

    stability = compare_source_analyses(
        sources, scores, loaded.fixture.source_analysis.facts
    )

    assert stability.fact_agreement == 1.0
    assert stability.unstable_facts == []
    assert stability.topic_jaccard == 0.0
    assert stability.locator_jaccard == 1.0
    assert (
        source_analysis_failures(loaded.fixture.source_analysis.thresholds, scores)
        == []
    )


def test_term_matching_is_word_bounded_for_figures() -> None:
    assert matches_terms("601 areas", TermMatch(all_of=[["601"]]))
    assert not matches_terms("6010 areas", TermMatch(all_of=[["601"]]))
    assert not matches_terms("1601 areas", TermMatch(all_of=[["601"]]))
    assert matches_terms("Flood-risk prioritization", TermMatch(all_of=[["prioriti"]]))
    assert matches_terms("costs of $8,853,000", TermMatch(all_of=[["8,853,000"]]))


def test_figure_extraction_scales_amounts_and_ignores_single_digits() -> None:
    figures = extract_numbers(
        "USD 8.85million, $8,853,000, a 2-year storm, 3.2 ha, 2025"
    )

    assert figures == [
        ("8.85million", 8_850_000.0),
        ("8853000", 8_853_000.0),
        ("3.2", 3.2),
        ("2025", 2025.0),
    ]


def test_drafting_requires_facts_in_their_chapters_and_flags_invented_figures(
    fixtures,
) -> None:
    golden = fixtures["richfield-flood-risk"].fixture.drafting
    chapters = [
        DraftedChapter(
            "applicant_project_information",
            "Applicant",
            "The City of Richfield, Minnesota applies to the Flood Hazard Mitigation "
            "Grant Assistance Program.",
        ),
        DraftedChapter(
            "funding_breakout",
            "Funding",
            "Wilson Pond Concept A is estimated at $8.85 million in 2025 US dollars, "
            "and the city requests $12.5 million.",
        ),
        DraftedChapter("project_activities", "Activities", ""),
        DraftedChapter(
            "project_analysis",
            "Analysis",
            "Of 746 flood-risk areas, 601 lie within the city.",
        ),
    ]
    input_text = "Concept A $8,853,000; 746 and 601 flood-risk areas; 2025 US dollars."

    score = score_drafting(golden, chapters, input_text)

    findings = {fact.fact_id: fact for fact in score.facts}
    assert findings["applicant-city"].covered
    assert findings["funding-programme"].covered
    assert findings["cost-basis"].covered
    assert findings["concept-cost-figures"].covered
    assert findings["flood-risk-area-count"].found_in == ["project_analysis"]
    assert findings["flood-risk-area-count"].covered
    assert not findings["selected-sites"].covered
    assert [item.number for item in score.unsupported_numbers] == ["12.5 million"]
    assert score.empty_chapters == ["project_activities"]
    failures = drafting_failures(golden.thresholds, score)
    assert "empty_chapters 1 > 0" in failures
    assert any(failure.startswith("unsupported_number_rate") for failure in failures)


def test_drafting_fact_outside_its_allowed_chapters_is_not_covered(fixtures) -> None:
    golden = fixtures["richfield-flood-risk"].fixture.drafting
    chapters = [
        DraftedChapter(
            "project_financing",
            "Financing",
            "Wilson Pond flooding reaches the lowest structures in the 2-year event.",
        )
    ]

    score = score_drafting(golden, chapters, "2-year")

    finding = next(
        fact for fact in score.facts if fact.fact_id == "wilson-pond-damages"
    )
    assert finding.found_in == ["project_financing"]
    assert not finding.covered


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
