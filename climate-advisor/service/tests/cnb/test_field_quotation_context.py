"""The document reader returns governing text without changing the confirmed citation."""

import pytest
from app.services.document_workspace.quotation_context import (
    MAX_CONTEXT_CHARS,
    citation_enricher,
    enclosing_quotation,
)
from app.services.document_workspace.setup_reading import (
    candidate_signature,
    enrich_findings,
)


def test_first_table_row_includes_its_header_and_second_row_stays_independent():
    table = "Table 2. Estimates\n\n| Site | Amount |\n| --- | --- |\n| North | 40 EUR |\n| South | 75 EUR |"
    first, second = "40 EUR", "75 EUR"
    assert enclosing_quotation(table, first) == table[: table.index("\n| South")]
    assert enclosing_quotation(table, second) == "| South | 75 EUR |"
    units = {"page-6": table, "page-7": "| Different project | 40 EUR |"}
    core = {"quote": first, "source_label": "Plan", "page_number": 6}
    result = enrich_findings({"cost": {("partial", 40): [core]}}, units)
    (enriched,) = result["cost"][("partial", 40)]
    assert enriched["quote"] == first and enriched["page_number"] == 6
    assert (
        enriched["quote_context"] in table
        and "Different project" not in enriched["quote_context"]
    )
    assert "quote_context" not in core
    identity = {"upload_id": "plan"}
    assert candidate_signature(
        40, [enriched], identity, "partial"
    ) == candidate_signature(40, [core], identity, "partial")


def test_same_named_markdown_sections_keep_distinct_anchors():
    units = {"budget/block-a": "| West | €12 |", "budget/block-b": "| East | €12 |"}
    quote = {
        "quote": "€12",
        "source_label": "Budget",
        "source_anchor": "budget/block-b",
    }
    citations = citation_enricher(units)(
        [quote, {**quote, "source_anchor": "other/block"}]
    )
    assert citations[0]["quote_context"] == "| East | €12 |"
    assert "quote_context" not in citations[1]


@pytest.mark.parametrize(
    "text,core",
    [
        ("| West | 100 |\n| East | 100 |", "100"),
        (
            "# District 1\n\nResearchers arrived.\n\n# District 2\n\nThe bridge closed.",
            "The bridge closed.",
        ),
        ("| Row with a very long label" + "x" * MAX_CONTEXT_CHARS + " | 200 |", "200"),
        ("Other source text", "200"),
        ("Percentage   Households\n32%          1500", "32%"),
    ],
)
def test_uncertain_or_complete_core_is_left_alone(text, core):
    assert enclosing_quotation(text, core) is None


def test_short_clause_is_restored_with_its_condition_but_stays_in_its_section():
    text = "Damages outside the city were excluded.\n\nOnly after approval may the district borrow funds."
    assert (
        enclosing_quotation(text, "borrow funds")
        == "Only after approval may the district borrow funds."
    )


def test_pronoun_keeps_the_named_site_in_its_own_paragraph():
    text = (
        "The council approved a different site.\n\n## East basin\n\n"
        "The city selected the basin below East Park. This area floods during a five-year storm."
    )
    result = enclosing_quotation(text, "This area floods during a five-year storm.")
    assert result == text[text.index("##") :]


def test_numbered_alternatives_and_unrelated_new_section_are_excluded():
    text = "Priority 2: public spaces, Priority 3: clean air, and Priority 4: public transit."
    assert enclosing_quotation(text, "Priority 3: clean air") is None
    unit = "My report states that the bridge closes.\n\nEmergency repairs\nFunding starts tomorrow."
    assert (
        enclosing_quotation(unit, "the bridge closes.")
        == "My report states that the bridge closes."
    )
