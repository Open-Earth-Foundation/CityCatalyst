"""Contract between Core's default hiap.inventory.context output and CNB models.

The fixture `fixtures/hiap_default_context.json` is generated from the real Core
builder by `app/tests/agentic-hiap-default-contract.jest.ts` (regenerate with
UPDATE_HIAP_CONTRACT_FIXTURE=1). Its cases cover selected, fallback, empty,
empty-category, large and many-selected contexts. The Concept Note Builder
models forbid extra fields and check `counts.returned == len(actions)`, so the
default output must not gain paging fields or be trimmed (CC-1060).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from app.models.cnb.concept_note_city_context import HiapContext

FIXTURE = Path(__file__).parent / "fixtures" / "hiap_default_context.json"
CASES: dict[str, dict[str, Any]] = json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_fixture_covers_every_projection_mode() -> None:
    """The fixture must exercise each branch the CNB validator distinguishes."""
    modes = {
        category["selection_mode"]
        for case in CASES.values()
        for category in (case["mitigation"], case["adaptation"])
    }
    assert modes == {"city_selected", "ranked_fallback", "none"}
    assert {
        "selected_and_fallback",
        "empty",
        "empty_category",
        "large_fallback",
        "many_selected",
    } <= set(CASES)


@pytest.mark.parametrize("case_name", sorted(CASES))
def test_core_default_output_validates_with_the_cnb_models(case_name: str) -> None:
    """Every real Core default shape is accepted by the strict CNB models."""
    context = HiapContext.model_validate(CASES[case_name])

    for category in (context.mitigation, context.adaptation):
        assert category.counts.returned == len(category.actions)


def test_large_default_projection_is_complete_not_trimmed() -> None:
    """A response far above the scoped 24 KB trim still returns every action."""
    large = CASES["large_fallback"]["mitigation"]
    assert large["counts"] == {"ranked": 40, "selected": 0, "returned": 40}
    assert len(large["actions"]) == 40
    assert len(json.dumps(large["actions"]).encode("utf-8")) > 24 * 1024
    assert len(CASES["many_selected"]["mitigation"]["actions"]) == 27


@pytest.mark.parametrize("case_name", sorted(CASES))
def test_paging_fields_would_be_rejected_by_the_cnb_models(case_name: str) -> None:
    """Guard the reason for the rule: scoped-only fields break the strict models."""
    scoped = json.loads(json.dumps(CASES[case_name]))
    scoped["mitigation"]["truncated"] = False
    scoped["mitigation"]["counts"]["total"] = scoped["mitigation"]["counts"][
        "returned"
    ]

    with pytest.raises(ValidationError):
        HiapContext.model_validate(scoped)
