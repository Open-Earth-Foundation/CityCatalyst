"""Context recovered from invented source text, including exact source locations."""

import pytest
from app.models.cnb.context_bundle import SourceExcerpt
from app.services.cnb import source_analysis
from app.services.cnb.source_quote_context import (
    MAX_CONTEXT_CHARS,
    recover_quotation_context,
)


def test_clause_retains_its_actor_condition_and_inspection_requirement():
    complete = (
        "If the board signs the operating agreement, the agency will pay the final "
        "instalment after an independent inspection."
    )
    page = f"The old facility has closed. {complete} A different grant covers staffing."
    fragment = "the agency will pay the final instalment"
    assert recover_quotation_context(page, fragment) == complete
    assert recover_quotation_context(page, complete) == complete


def test_qualified_list_retains_its_own_introduction_and_no_unrelated_paragraph():
    intro = "Only the coastal reserve is eligible for these works:"
    items = [
        "- repair the trail;",
        "- replace the warning buoys;",
        "- equip the field station.",
    ]
    page = (
        "A neighbouring park seeks staff.\n\n"
        + "\n".join([intro, *items])
        + "\n\n### Operating costs\nNew scope."
    )
    quote = "replace the warning buoys"
    context = recover_quotation_context(page, quote)
    assert context == "\n".join([intro, *items[:2]])
    assert recover_quotation_context(page, context) == context


@pytest.mark.parametrize(
    "lead", ["## Qualifying monitoring equipment", "QUALIFYING MONITORING EQUIPMENT"]
)
def test_list_can_have_a_heading_with_one_markdown_blank_line(lead):
    page = f"A fee is payable.\n\n{lead}\n\n- pressure sensors\n- tide gauges"
    assert (
        recover_quotation_context(page, "pressure sensors")
        == f"{lead}\n\n- pressure sensors"
    )


def test_context_never_borrows_an_unrelated_section_or_an_ambiguous_occurrence():
    page = "Old scheme:\n- ferry services\n\nA separate district runs a sports centre.\n- replacement windows"
    assert (
        recover_quotation_context(page, "replacement windows")
        == "- replacement windows"
    )
    duplicate = "Only in district A: the payment. Only in district B: the payment."
    assert recover_quotation_context(duplicate, "the payment") == "the payment"


def test_self_contained_sentences_tables_and_oversized_context_stay_intact():
    sentence = "The council signed the operating agreement yesterday."
    assert recover_quotation_context("## Notes\n\n- " + sentence, sentence) == sentence
    table = "| Asset | Baseline | Target |\n| Pump | 30 | 40 |"
    assert (
        recover_quotation_context(
            f"The programme runs for three years.\n{table}", table
        )
        == table
    )
    quote = "the agency makes a payment"
    page = "If conditions " + "remain valid and " * MAX_CONTEXT_CHARS + quote + "."
    assert recover_quotation_context(page, quote) == quote


def test_saved_source_reading_deduplicates_after_expansion_and_preserves_anchors():
    full = "Subject to the owners' written approval, the council can replace the rails."
    rows = [
        SourceExcerpt(text="the council can replace the rails", page=2),
        SourceExcerpt(text="the owners' written approval", page=2),
        SourceExcerpt(text="the council can replace the rails", page=1),
    ]
    originals = {"page-2": full, "page-1": "Another proposal concerns vegetation."}
    result = source_analysis.contextualize_source_excerpts(rows, originals)
    assert result == [SourceExcerpt(text=full, page=2)]
    assert source_analysis.contextualize_source_excerpts(result, originals) == result
    assert rows[0].text == "the council can replace the rails"


def test_source_key_excerpt_skips_an_ambiguous_heading_before_context_expansion():
    from app.models.cnb.source_prompt import ReadableExcerpt

    quote = "the grant expires"
    pages = [
        source_analysis.SourceBlock(
            "funding/block-ab1", f"If the work stops, {quote}."
        ),
        source_analysis.SourceBlock("funding/block-cd2", f"After five years, {quote}."),
    ]
    assert (
        source_analysis._restore_readable_excerpts(
            [ReadableExcerpt(text=quote, heading="funding")], pages
        )
        == []
    )


def test_context_algorithm_version_invalidates_document_and_chapter_readings(
    monkeypatch,
):
    from app.config import get_settings

    settings = get_settings()
    original = (
        source_analysis.source_analysis_contract_version(settings),
        source_analysis.chapter_evidence_fingerprint(settings, []),
    )
    monkeypatch.setattr(source_analysis, "QUOTE_CONTEXT_VERSION", "future-test-version")
    assert source_analysis.source_analysis_contract_version(settings) != original[0]
    assert source_analysis.chapter_evidence_fingerprint(settings, []) != original[1]
