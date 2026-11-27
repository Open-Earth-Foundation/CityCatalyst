"""Derived scalar locations remain source-local and never become reviewed identity."""

from types import SimpleNamespace

import pytest
from app.models.document_workspace.contracts import DocumentPointCitation
from app.services.cnb.source_analysis import SourceBlock, SourcePage
from app.services.document_workspace.scalar_sources import (
    MAX_SCALAR_LOCATIONS,
    scalar_source_enricher,
)
from app.services.document_workspace.setup_reading import (
    candidate_signature,
    candidate_support,
    compatible_candidates,
    enrich_source_findings,
)

DEFINITION = {
    "key": "authority",
    "kind": "fact",
    "answer_type": "text",
    "city_field": "city.name",
}


def body(line: str) -> str:
    return f"Official register\n{line}\nSupporting records follow."


def citation(quote: str, page: int = 1, **extra) -> dict:
    return dict(source_label="Register", quote=quote, page_number=page, **extra)


@pytest.mark.parametrize(
    "line,value",
    [
        (
            "Podmiot realizujący działanie (lider działania): Gmina Miasto Brzozów",
            "Gmina Miasto Brzozów",
        ),
        ("Municipality: Borough of Willow", "Borough of Willow"),
        ("| Municipality | Willow (North District) |", "Willow (North District)"),
        ("Registry code\tAB-123", "AB-123"),
    ],
)
def test_complete_reviewed_cells_retain_native_pdf_and_markdown_locations(line, value):
    units = [
        SourcePage(1, body(line)),
        SourceBlock("chapter/page-7/block-b", body(line)),
    ]
    original = citation(line)
    result = enrich_source_findings(
        {"authority": {("full", value): [original]}}, [DEFINITION], units, "Register"
    )
    retained = result["authority"][("full", value)]
    assert {k: v for k, v in retained[0].items() if k != "quote_context"} == original
    assert {k: v for k, v in retained[1].items() if k != "quote_context"} == citation(
        line, 7, source_anchor="chapter/page-7/block-b", repeated_from_anchor="page-1"
    )
    assert (
        DocumentPointCitation.model_validate(retained[1]).repeated_from_anchor
        == "page-1"
    )
    identity = {"upload_id": "upload", "sha256": "digest"}
    assert candidate_signature(
        value, retained, identity, "full"
    ) == candidate_signature(value, [original], identity, "full")
    refreshed = scalar_source_enricher(units, "Register")(
        DEFINITION, value, retained, "full"
    )
    assert [
        {k: v for k, v in c.items() if k != "quote_context"} for c in refreshed
    ] == [{k: v for k, v in c.items() if k != "quote_context"} for c in retained]


@pytest.mark.parametrize(
    "value,definition,support,line,repeat",
    [
        (
            "Willow",
            DEFINITION,
            "partial",
            "Municipality: Willow",
            "Municipality: Willow",
        ),
        (
            "Willow",
            {k: v for k, v in DEFINITION.items() if k != "city_field"},
            "full",
            "Municipality: Willow",
            "Municipality: Willow",
        ),
        (
            "Willow",
            {**DEFINITION, "kind": "decision"},
            "full",
            "Municipality: Willow",
            "Municipality: Willow",
        ),
        (
            41200,
            {**DEFINITION, "answer_type": "number"},
            "full",
            "Population: 41200",
            "Population: 41200",
        ),
        (
            "41200 residents",
            DEFINITION,
            "full",
            "Population: 41200 residents",
            "Population: 41200 residents",
        ),
        ("Data 2021", DEFINITION, "full", "Period: Data 2021", "Period: Data 2021"),
        (
            "office@willow.example",
            DEFINITION,
            "full",
            "Email: office@willow.example",
            "Email: office@willow.example",
        ),
        (
            "Willow",
            DEFINITION,
            "full",
            "Municipality: Willow and Cedar",
            "Municipality: Willow and Cedar",
        ),
        (
            "Willow (North)",
            DEFINITION,
            "full",
            "Municipality: Willow",
            "Municipality: Willow",
        ),
        (
            "Willow (Miasto Wierzba)",
            DEFINITION,
            "full",
            "Municipality: Miasto Wierzba",
            "Municipality: Miasto Wierzba",
        ),
        (
            "Willow",
            DEFINITION,
            "full",
            "Municipality: Willow",
            "Municipality: Willow (North)",
        ),
        (
            "Willow",
            DEFINITION,
            "full",
            "Municipality: Willow",
            "Contact municipality: Cedar",
        ),
        (
            "Willow",
            DEFINITION,
            "full",
            "Municipality: Willow",
            "The Municipality: Willow is listed here.",
        ),
        (
            "Willow",
            DEFINITION,
            "full",
            "Municipality: Willow",
            "# Municipality: Willow",
        ),
        (
            "Willow",
            DEFINITION,
            "full",
            "Municipality: Willow",
            "| Municipality | Willow | Cedar |",
        ),
    ],
)
def test_incidental_ambiguous_other_entity_and_unbound_fields_do_not_expand(
    value, definition, support, line, repeat
):
    original = citation(line)
    units = [SourcePage(1, body(line)), SourcePage(2, body(repeat))]
    assert scalar_source_enricher(units, "Register")(
        definition, value, [original], support
    ) == [original]


@pytest.mark.parametrize(
    "repeat",
    [
        "Municipality: Willow",
        "Municipality: Willow\nPage 2",
        "Page 2\nMunicipality: Willow",
    ],
)
def test_isolated_headers_and_footers_are_ambiguous(repeat):
    original = citation("Municipality: Willow")
    units = [SourcePage(1, body(original["quote"])), SourcePage(2, repeat)]
    assert scalar_source_enricher(units, "Register")(
        DEFINITION, "Willow", [original], "full"
    ) == [original]


def test_identical_complete_lines_within_one_block_are_one_location():
    line = "Municipality: Willow"
    original = citation(line)
    units = [
        SourcePage(1, body(line + "\n" + line)),
        SourcePage(2, body(line + "\n" + line)),
    ]
    retained = scalar_source_enricher(units, "Register")(
        DEFINITION, "Willow", [original], "full"
    )
    assert len(retained) == 2
    assert (
        retained[1]["page_number"] == 2
        and retained[1]["repeated_from_anchor"] == "page-1"
    )


def test_source_label_scope_unknown_support_and_changed_ocr_drop_only_derived_locations():
    line = "Municipality: Willow"
    original = citation(line)
    units = [SourcePage(1, body(line)), SourcePage(2, body(line))]
    enrich = scalar_source_enricher(units, "Register")
    derived = enrich(DEFINITION, "Willow", [original], "full")
    assert len(derived) == 2
    for support, label in ((None, "Register"), ("full", "Other source")):
        assert scalar_source_enricher(units, label)(
            DEFINITION, "Willow", derived, support
        ) == [original]
    assert scalar_source_enricher(
        [SourcePage(1, body("Municipality: Cedar"))], "Register"
    )(DEFINITION, "Willow", derived, "full") == [original]
    # A derived quotation alone cannot seed another source read.
    assert enrich(DEFINITION, "Willow", derived[1:], "full") == []


def test_direct_legacy_location_wins_and_seed_choice_and_cap_are_order_independent():
    line = "Municipality: Willow"
    original = [citation(line), citation(line, 2)]
    units = [SourcePage(i, body(line)) for i in range(1, 5)]
    value = scalar_source_enricher(units, "Register")(
        DEFINITION, "Willow", original, "full"
    )
    assert value[:2] == original and len(value) == 4
    assert all(c.get("repeated_from_anchor") == "page-1" for c in value[2:])
    reversed_result = scalar_source_enricher(list(reversed(units)), "Register")(
        DEFINITION, "Willow", list(reversed(original)), "full"
    )
    assert reversed_result[2:] == value[2:]
    over_cap = [SourcePage(i, body(line)) for i in range(1, MAX_SCALAR_LOCATIONS + 2)]
    assert (
        scalar_source_enricher(over_cap, "Register")(
            DEFINITION, "Willow", original, "full"
        )
        == original
    )


def test_duplicate_original_anchors_abstain_and_unbound_forms_never_index_units():
    line = "Municipality: Willow"
    original = citation(line)
    units = [
        SourcePage(1, body(line)),
        SourcePage(2, body(line)),
        SourcePage(2, body("Municipality: Cedar")),
    ]
    assert scalar_source_enricher(units, "Register")(
        DEFINITION, "Willow", [original], "full"
    ) == [original]
    # An unbound form must not inspect source units, even for a very large source.
    enrich = scalar_source_enricher(
        [object()], "Register", [{"key": "authority", "answer_type": "text"}]
    )
    assert enrich({"answer_type": "text"}, "Willow", [original], "full") == [original]


def test_accepted_legacy_fingerprint_and_disposition_survive_derived_locations():
    line = "Municipality: Willow"
    identity = {"upload_id": "upload", "sha256": "sha"}
    original = [citation(line, 2), citation(line)]
    from app.services.document_workspace.requirements import fingerprint

    stored = SimpleNamespace(
        value="Willow",
        status="accepted",
        candidate_id="human-choice",
        citations=scalar_source_enricher(
            [SourcePage(i, body(line)) for i in (1, 2, 3)], "Register"
        )(DEFINITION, "Willow", original, "full"),
        fingerprint=fingerprint(["Willow", original, identity, "full"]),
    )
    assert candidate_support(stored, identity) == "full"
    assert candidate_support(stored, {**identity, "sha256": "different"}) is None
    signature = candidate_signature("Willow", original, identity, "full")
    assert (
        compatible_candidates({stored.fingerprint: stored}, identity)[signature]
        is stored
    )
