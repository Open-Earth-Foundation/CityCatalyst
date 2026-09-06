from __future__ import annotations

from uuid import uuid4

import pytest
from app.models.cnb.concept_note_edits import (
    ChapterEditPlanOutput,
    EditApplyRequest,
    EditPlanOutput,
    EditProposalRequest,
    EditScope,
    PlannedTextChange,
)
from pydantic import ValidationError


def test_proposal_preserves_exact_instruction_and_focus_hint() -> None:
    chapter_id = uuid4()
    request = EditProposalRequest(
        instruction=" Make this clearer. ",
        idempotency_key=uuid4(),
        scope=EditScope(focused_chapter_id=chapter_id),
    )
    assert request.instruction == " Make this clearer. "
    assert request.model_dump(mode="json")["scope"] == {
        "kind": "auto",
        "focused_chapter_id": str(chapter_id),
    }
    with pytest.raises(ValidationError, match="frozen"):
        request.instruction = "Changed"


@pytest.mark.parametrize(
    "scope",
    [
        {"kind": "chapters", "chapter_ids": [str(uuid4())]},
        {"kind": "passage", "passage": {}},
        {"kind": "document"},
        {"kind": "auto", "full_document_confirmed": True},
        {"kind": "invalid"},
    ],
)
def test_invalid_scope_is_rejected_without_broadening(scope: dict) -> None:
    with pytest.raises(ValidationError):
        EditScope.model_validate(scope)


def test_scope_is_automatic_and_forbids_manual_authority_fields() -> None:
    chapter_id = uuid4()
    assert EditScope(focused_chapter_id=chapter_id).kind == "auto"
    with pytest.raises(ValidationError, match="extra"):
        EditScope.model_validate({"kind": "auto", "chapter_ids": [str(chapter_id)]})


@pytest.mark.parametrize(
    "instruction", ["", "  \n", "a" * 8_001], ids=["empty", "blank", "over-limit"]
)
def test_instruction_is_bounded(instruction: str) -> None:
    with pytest.raises(ValidationError):
        EditProposalRequest(instruction=instruction, idempotency_key=uuid4())


def test_change_requires_real_difference_and_factual_provenance() -> None:
    values = dict(
        chapter_id=uuid4(),
        start=0,
        before="Old",
        after="New",
        kind="wording",
        group_id="clarity",
    )
    assert PlannedTextChange(**values).after == "New"
    with pytest.raises(ValidationError, match="alter"):
        PlannedTextChange(**{**values, "after": "Old"})
    with pytest.raises(ValidationError, match="evidence"):
        PlannedTextChange(**{**values, "kind": "factual"})
    factual = PlannedTextChange(
        **{**values, "kind": "factual", "user_input_quote": "New"}
    )
    assert factual.user_input_quote == "New"


def test_question_and_clarification_cannot_contain_changes() -> None:
    assert ChapterEditPlanOutput(intent="no_change").changes == []
    assert EditPlanOutput(intent="question").changes == []
    assert EditPlanOutput(
        intent="clarification", clarification="Which chapter?"
    ).clarification
    with pytest.raises(ValidationError):
        EditPlanOutput(intent="edit")
    with pytest.raises(ValidationError):
        EditPlanOutput(intent="question", clarification="Which chapter?")


def test_apply_requires_positive_complete_revision_values_and_unique_selection() -> (
    None
):
    chapter_id, change_id = uuid4(), uuid4()
    body = dict(idempotency_key=uuid4(), expected_revisions={chapter_id: 1})
    assert EditApplyRequest(**body).expected_revisions == {chapter_id: 1}
    with pytest.raises(ValidationError):
        EditApplyRequest(**{**body, "expected_revisions": {chapter_id: 0}})
    with pytest.raises(ValidationError, match="unique"):
        EditApplyRequest(**body, selected_change_ids=[change_id, change_id])


def test_unknown_fields_fail_instead_of_becoming_agent_mutation_authority() -> None:
    with pytest.raises(ValidationError, match="extra"):
        EditProposalRequest(
            instruction="Shorten it", idempotency_key=uuid4(), apply=True
        )
