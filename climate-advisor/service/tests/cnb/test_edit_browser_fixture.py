"""Regression checks for the model-only local browser fixture and target guards."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from app.models.cnb.concept_note_edits import EditPlanOutput
from service.scripts.run_cnb_edit_browser_fixture import (
    CHAPTERS,
    SyntheticModelRunner,
    fixture_cc_connection,
    isolated_database_url,
)
from sqlalchemy.engine import make_url


@pytest.mark.parametrize(
    "url",
    [
        None,
        "postgresql://test:fake@remote.invalid:65499/cc732_fixture",
        "postgresql://test:fake@127.0.0.1:65499/production",
        "postgresql://test:fake@127.0.0.1/cc732_fixture",
        "sqlite:///fixture.db",
    ],
)
def test_browser_fixture_rejects_unowned_database_targets(url: str | None) -> None:
    with pytest.raises(ValueError):
        isolated_database_url(url)


def test_browser_fixture_preserves_explicit_local_database_and_port() -> None:
    url = make_url(
        isolated_database_url("postgresql://test:fake@127.0.0.1:65499/cc732_fixture")
    )
    assert url.host == "127.0.0.1" and url.port == 65499
    assert url.database == "cc732_fixture" and url.drivername == "postgresql+asyncpg"


@pytest.mark.parametrize("url", ["", "https://production.invalid", "http://127.0.0.1"])
def test_browser_fixture_rejects_unscoped_cc_endpoint(monkeypatch, url: str) -> None:
    monkeypatch.setenv("CC_BASE_URL", url)
    monkeypatch.setenv("CC_API_KEY", "synthetic")
    with pytest.raises(ValueError, match="loopback"):
        fixture_cc_connection()


def test_browser_fixture_requires_service_key_for_local_app(monkeypatch) -> None:
    monkeypatch.setenv("CC_BASE_URL", "http://127.0.0.1:3410")
    monkeypatch.setenv("CC_API_KEY", "")
    with pytest.raises(ValueError, match="CC_API_KEY"):
        fixture_cc_connection()
    monkeypatch.setenv("CC_API_KEY", "synthetic")
    assert fixture_cc_connection() == ("http://127.0.0.1:3410", "synthetic")


@pytest.mark.parametrize(
    ("instruction", "kind", "count"),
    [
        ("Make the opening more concise", "wording", 1),
        ("Change the investment amount to EUR 12 million everywhere", "factual", 2),
        ("Update the delivery date to 2031 everywhere", "factual", 2),
        (
            "Change the investment to EUR 12 million and delivery to 2031 everywhere",
            "factual",
            4,
        ),
    ],
)
async def test_browser_fixture_returns_parseable_exact_model_anchors(
    instruction: str,
    kind: str,
    count: int,
) -> None:
    chapters = [
        {
            "chapter_id": f"73200000-0000-4000-8000-00000000010{index}",
            "body_markdown": body,
        }
        for index, (_, body) in enumerate(CHAPTERS)
    ]
    result = await SyntheticModelRunner.run(
        SimpleNamespace(name="Concept Note edit planner"),
        json.dumps({"instruction": instruction, "chapters": chapters}),
    )
    plan = EditPlanOutput.model_validate(result.final_output)
    assert len(plan.changes) == count
    for change in plan.changes:
        chapter = next(
            item for item in chapters if item["chapter_id"] == str(change.chapter_id)
        )
        assert (
            chapter["body_markdown"][change.start : change.start + len(change.before)]
            == change.before
        )
        assert change.kind == kind
        assert change.user_input_quote == (instruction if kind == "factual" else None)


async def test_browser_fixture_does_not_invent_an_unspecified_investment_value() -> (
    None
):
    result = await SyntheticModelRunner.run(
        SimpleNamespace(name="Concept Note edit planner"),
        json.dumps({"instruction": "Update the investment amount", "chapters": []}),
    )
    plan = EditPlanOutput.model_validate(result.final_output)
    assert plan.intent == "clarification" and plan.changes == []


async def test_browser_fixture_refinement_uses_prior_proposal_but_anchors_current_body() -> (
    None
):
    chapter_id = "73200000-0000-4000-8000-000000000100"
    payload = {
        "instruction": "Make the proposed wording even shorter",
        "chapters": [{"chapter_id": chapter_id, "body_markdown": CHAPTERS[0][1]}],
        "prior_proposal": {
            "instruction": "Make the opening more concise",
            "changes": [
                {
                    "chapter_id": chapter_id,
                    "before": "The project will create a park that is resilient to floods.",
                    "after": "The project will create a flood-resilient park.",
                }
            ],
        },
    }
    result = await SyntheticModelRunner.run(
        SimpleNamespace(name="Concept Note edit planner"),
        json.dumps(payload),
    )
    plan = EditPlanOutput.model_validate(result.final_output)
    assert len(plan.changes) == 1
    change = plan.changes[0]
    assert change.after == "The project will build a flood-resilient park."
    assert (
        CHAPTERS[0][1][change.start : change.start + len(change.before)]
        == change.before
    )
    assert change.before != payload["prior_proposal"]["changes"][0]["after"]


async def test_browser_fixture_does_not_run_an_unrelated_model() -> None:
    with pytest.raises(RuntimeError, match="only the CNB"):
        await SyntheticModelRunner.run(SimpleNamespace(name="Unrelated workflow"), "{}")
