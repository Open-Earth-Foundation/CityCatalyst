"""Synthetic evidence only. Verify grouping, support and original row attribution."""

import asyncio
import json
from unittest.mock import AsyncMock

import pytest
from app.config.settings import get_settings
from app.models.document_workspace.contracts import DocumentPointCitation
from app.services.document_workspace.narrative_synthesis import (
    Contribution,
    NarrativeLayout,
    apply_layout,
    synthesize_narratives,
)
from pydantic import ValidationError


def contribution(text, page, support="full", source="Council plan"):
    citation = {
        "source_label": source,
        "page_number": page,
        "source_anchor": None,
        "quote": f"Original row on page {page}",
    }
    return Contribution(support, text, [citation])


def layout(groups, *, support="full", excluded=()):
    answers = []
    for sections in groups:
        answers.append(
            {
                "support": support,
                "sections": [
                    {
                        "dimension": dimension,
                        "items": [
                            {"value": primary, "equivalent": equivalent}
                            for primary, equivalent in items
                        ],
                    }
                    for dimension, items in sections
                ],
            }
        )
    return NarrativeLayout(answers=answers, excluded=list(excluded))


def test_two_physical_locations_and_corroboration_belong_only_to_their_item():
    rows = [
        contribution("Insulate the roof.", 2),
        contribution("Fit heat meters.", 5, "partial"),
        contribution("Roof insulation.", 9),
        contribution("Unrelated rail operator example.", 35, "partial"),
    ]
    rows[0].citations.append(contribution("Insulate the roof.", 7).citations[0])
    chosen = layout([[("measures", [(0, [2]), (1, [])])]], excluded=[3])
    answer = apply_layout(rows, chosen)
    ((key, citations),) = answer.items()
    assert key == ("full", "• Insulate the roof.\n• Fit heat meters.")
    for citation in citations:
        DocumentPointCitation.model_validate(citation)
    assert {
        c["page_number"]: (c["component_values"], c["component_support"])
        for c in citations
    } == {
        2: (["Insulate the roof."], "full"),
        7: (["Insulate the roof."], "full"),
        9: (["Insulate the roof."], "full"),
        5: (["Fit heat meters."], "partial"),
    }


def test_project_options_and_incompatible_amounts_stay_separate():
    rows = [
        contribution("Purchase two electric buses.", 2),
        contribution("Extend the tram route.", 4),
        contribution("Accepted net cost EUR 20,000.", 7),
        contribution("Accepted net cost EUR 25,000.", 8),
    ]
    plans = layout(
        [
            [("measures", [(0, [])])],
            [("measures", [(1, [])])],
            [("costs", [(2, []), (3, [])])],
        ]
    )
    answers = apply_layout(rows, plans)
    for row in rows:
        assert [c["page_number"] for c in answers[("full", row.value)]] == [
            row.citations[0]["page_number"]
        ]


def test_different_scopes_and_equivalent_amounts_cannot_link_to_each_others_pages():
    rows = [
        contribution("Annual operating budget EUR 60,000.", 1),
        contribution("Project capital cost EUR 110,000.", 9),
    ]
    plans = layout([[("costs", [(0, [1])])]])
    answers = apply_layout(rows, plans)
    assert set(answers) == {("full", row.value) for row in rows}
    assert [c["page_number"] for c in answers[("full", rows[0].value)]] == [1]


def test_partial_inputs_cannot_be_promoted_and_overflow_segments_keep_every_row():
    rows = [
        contribution("Boiler work: " + "X" * 46, 1, "partial"),
        contribution("Consultation: " + "Y" * 46, 2, "partial"),
    ]
    plans = layout([[("measures", [(0, [])]), ("participants", [(1, [])])]])
    grouped = apply_layout(rows, plans)
    assert [support for support, _ in grouped] == ["partial"]
    fragments = apply_layout(rows, plans, max_chars=80)
    assert len(fragments) == 2
    assert all(support == "partial" for support, _ in fragments)
    assert {
        v for cs in fragments.values() for c in cs for v in c["component_values"]
    } == {r.value for r in rows}
    assert {c["page_number"] for cs in fragments.values() for c in cs} == {1, 2}


def test_indices_are_exhaustive_and_numeric_types_are_strict():
    rows = [contribution("Municipal fleet", 1), contribution("City-owned buildings", 2)]
    for selection in [
        layout([[("general", [(0, [])])]]),
        layout([[("general", [(0, [1])])]], excluded=[1]),
        layout([[("general", [(0, [3])])]]),
    ]:
        with pytest.raises(ValueError, match="every index"):
            apply_layout(rows, selection)
    with pytest.raises(ValidationError):
        layout([[("general", [(True, [])])]])


@pytest.mark.parametrize("failure", ["omitted", "duplicate", "unavailable"])
async def test_invalid_composition_keeps_this_batch_and_finishes_another_field(failure):
    def values(*rows):
        return {(r.support, r.value): r.citations for r in rows}

    amounts = values(
        contribution("Approved works EUR 10", 2),
        contribution("Approved works EUR 20", 5),
        contribution("Historical cost EUR 6", 9, "partial"),
    )
    team = values(contribution("Director", 4), contribution("City engineer", 8))

    async def model(**kwargs):
        if json.loads(kwargs["input_text"])["requirement"]["key"] == "team":
            return layout([[("responsibilities", [(0, []), (1, [])])]])
        if failure == "unavailable":
            raise TimeoutError("Provider did not return a grouping")
        return layout(
            [[("costs", [(0, []), (1, [])])]],
            excluded=[1, 2] if failure == "duplicate" else [],
        )

    result = await synthesize_narratives(
        {"amounts": amounts, "team": team},
        [{"key": key, "answer_type": "multiline"} for key in ("amounts", "team")],
        scope={},
        source_label="Council plan",
        settings=get_settings(),
        client=None,
        runner=None,
        invoke=model,
    )
    assert result["amounts"] == amounts
    assert len(result["team"]) == 1


async def test_replay_synthesizes_only_one_file_and_never_calls_the_reader_or_changes_scalar_values():
    rows = [
        contribution("Finance director", 3),
        contribution("Technical lead", 6, "partial"),
    ]
    narrative = {(r.support, r.value): r.citations for r in rows}
    scalar = {("full", 25): contribution("25", 7).citations}
    choice = {("full", "Yes"): contribution("Yes", 8).citations}
    reviewed = {"team": narrative, "budget": scalar, "eligible": choice}
    definitions = [
        {"key": "team", "answer_type": "multiline"},
        {"key": "budget", "answer_type": "number"},
        {"key": "eligible", "answer_type": "choice"},
    ]
    invoke = AsyncMock(
        return_value=layout([[("responsibilities", [(0, []), (1, [])])]])
    )
    output = await synthesize_narratives(
        reviewed,
        definitions,
        scope={"municipality": {"name": "Example"}},
        source_label="Council plan",
        settings=get_settings(),
        client=None,
        runner=None,
        invoke=invoke,
        semaphore=asyncio.Semaphore(1),
    )
    assert output["budget"] is scalar and output["eligible"] is choice
    assert len(narrative) == 2 and len(output["team"]) == 1
    invoke.assert_awaited_once()
    request = json.loads(invoke.await_args.kwargs["input_text"])
    assert request["requirement"]["key"] == "team"
    assert [v["support"] for v in request["items"]] == ["full", "partial"]
    rows[1].citations[0]["source_label"] = "Different file"
    with pytest.raises(ExceptionGroup) as exc:
        await synthesize_narratives(
            reviewed,
            definitions,
            scope={},
            source_label="Council plan",
            settings=get_settings(),
            client=None,
            runner=None,
            invoke=invoke,
        )
    assert "exactly one source" in str(exc.value.exceptions[0])
