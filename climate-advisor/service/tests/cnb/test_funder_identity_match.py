"""Focused tests for LLM-backed CNB canonical-funder identity matching."""

from __future__ import annotations

import json
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.models.cnb.research import CanonicalFunder, FundedProjectDraft
from app.services.cnb.funder_identity_match import (
    FunderIdentityLlmDecision,
    FunderIdentityLlmDecisionSet,
    FunderIdentityLlmMatch,
    propose_funder_identity_candidates,
)


class FakeResponses:
    """Record the identity request and return injected structured output."""

    def __init__(self, decision_set: FunderIdentityLlmDecisionSet) -> None:
        self.decision_set = decision_set
        self.calls: list[dict[str, object]] = []

    def parse(self, **kwargs: object) -> SimpleNamespace:
        self.calls.append(kwargs)
        return SimpleNamespace(output_parsed=self.decision_set)


def _record(
    ref: str,
    *,
    reported_funder_name: str | None,
) -> FundedProjectDraft:
    return FundedProjectDraft(
        funded_project_ref=ref,
        funder_ref="funder-001",
        name=f"Record {ref}",
        reported_funder_name=reported_funder_name,
        selected_funder_id=uuid4(),
    )


def test_identity_scan_uses_one_llm_call_and_keeps_selection_manual() -> None:
    canonical_funder = CanonicalFunder(
        funder_id=uuid4(),
        name="Minnesota Pollution Control Agency",
    )
    responses = FakeResponses(
        FunderIdentityLlmDecisionSet(
            decisions=[
                FunderIdentityLlmDecision(
                    funded_project_ref="project-reported",
                    matches=[
                        FunderIdentityLlmMatch(
                            funder_id=canonical_funder.funder_id,
                            match_reason="MPCA is the agency's established acronym.",
                        )
                    ],
                ),
                FunderIdentityLlmDecision(
                    funded_project_ref="project-dossier",
                    matches=[],
                ),
            ]
        )
    )
    projects = [
        _record("project-reported", reported_funder_name="MPCA"),
        _record("project-dossier", reported_funder_name=None),
    ]

    reported_project, dossier_project = (
        propose_funder_identity_candidates(
            funded_projects=projects,
            canonical_funders=[canonical_funder],
            dossier_funder_name="European Investment Bank",
            openai_client=SimpleNamespace(responses=responses),
            model_name="small-model",
            reasoning_effort="low",
            prompt="Resolve funder identities.",
        )
    )

    assert len(responses.calls) == 1
    call = responses.calls[0]
    assert call["model"] == "small-model"
    assert call["reasoning"] == {"effort": "low"}
    assert call["store"] is False
    payload = json.loads(str(call["input"]))
    assert [item["identity_name"] for item in payload["funded_projects"]] == [
        "MPCA",
        "European Investment Bank",
    ]
    assert [item["identity_name_source"] for item in payload["funded_projects"]] == [
        "reported_funder_name",
        "dossier_funder_name",
    ]
    assert reported_project.selected_funder_id is None
    assert reported_project.candidate_funders[0].name == canonical_funder.name
    assert dossier_project.selected_funder_id is None
    assert dossier_project.candidate_funders == []


def test_identity_scan_rejects_model_invented_funder_id() -> None:
    canonical_funder = CanonicalFunder(funder_id=uuid4(), name="Known Funder")
    invented_id = uuid4()
    responses = FakeResponses(
        FunderIdentityLlmDecisionSet(
            decisions=[
                FunderIdentityLlmDecision(
                    funded_project_ref="project-001",
                    matches=[
                        FunderIdentityLlmMatch(
                            funder_id=invented_id,
                            match_reason="Unsupported candidate.",
                        )
                    ],
                )
            ]
        )
    )

    with pytest.raises(ValueError, match=str(invented_id)):
        propose_funder_identity_candidates(
            funded_projects=[
                _record("project-001", reported_funder_name="Possible Funder")
            ],
            canonical_funders=[canonical_funder],
            openai_client=SimpleNamespace(responses=responses),
            model_name="small-model",
            reasoning_effort="low",
            prompt="Resolve funder identities.",
        )


def test_identity_scan_skips_provider_when_no_identity_can_be_compared() -> None:
    record = _record("project-001", reported_funder_name=None)
    responses = FakeResponses(FunderIdentityLlmDecisionSet(decisions=[]))

    [updated] = propose_funder_identity_candidates(
        funded_projects=[record],
        canonical_funders=[CanonicalFunder(funder_id=uuid4(), name="Known Funder")],
        openai_client=SimpleNamespace(responses=responses),
        model_name="small-model",
        reasoning_effort="low",
        prompt="Resolve funder identities.",
    )

    assert responses.calls == []
    assert updated.candidate_funders == []
    assert updated.selected_funder_id is None
