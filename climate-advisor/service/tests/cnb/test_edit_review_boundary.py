"""LLM decisions own meaning; Python checks exact changes and their identities."""

from dataclasses import replace
from uuid import uuid4

import pytest

from app.models.cnb.concept_note_edits import (
    ChapterEditPlanOutput,
    ChapterEditReview,
    EditProposalRequest,
)
from app.persistence.concept_notes.edits import EditOperationError, replace_anchors
from app.persistence.concept_notes.workspace import WorkspaceChapterSnapshot
from app.services.cnb.edit_planner import bind_semantic_reviews, combine_chapter_plans
from app.services.cnb.edit_validation import validate_edit_plan


def chapter(body: str) -> WorkspaceChapterSnapshot:
    return WorkspaceChapterSnapshot(
        chapter_id=uuid4(),
        chapter_ref=None,
        title="Implementation",
        position=0,
        status="needs_review",
        required=True,
        user_locked=False,
        body_markdown=body,
        revision_number=1,
    )


def reviewed_plan(current, changes, supports):
    plan = ChapterEditPlanOutput(intent="edit", changes=changes)
    review = ChapterEditReview(
        decisions=[
            {
                "change_index": index,
                "support": support,
                "explanation": "Reviewed in chapter and instruction context",
            }
            for index, support in enumerate(supports)
        ]
    )
    return bind_semantic_reviews(
        combine_chapter_plans([current], [plan]), [plan], [review]
    )


def factual(before, after, instruction, group="schools"):
    return {
        "start": 0,
        "before": before,
        "after": after,
        "kind": "factual",
        "group_id": group,
        "user_input_quote": instruction,
    }


def test_school_count_edit_keeps_unrelated_ten_month_duration():
    current = chapter(
        "The project serves 10 schools. The delivery period is 10 months."
    )
    instruction = "Change the number of schools from 10 to 12. Keep the delivery period at 10 months unchanged."
    request = EditProposalRequest(instruction=instruction, idempotency_key=uuid4())
    plan = reviewed_plan(
        current, [factual("10 schools", "12 schools", instruction)], ["user"]
    )

    changes = validate_edit_plan(request, [current], plan)

    assert (
        replace_anchors(current.body_markdown, changes)
        == "The project serves 12 schools. The delivery period is 10 months."
    )


def test_independent_facts_with_equal_old_values_keep_model_groups():
    current = chapter("We serve 10 schools over 10 months.")
    instruction = "Serve 12 schools over 14 months."
    plan = reviewed_plan(
        current,
        [
            factual("10 schools", "12 schools", instruction, "schools"),
            factual("10 months", "14 months", instruction, "duration"),
        ],
        ["user", "user"],
    )

    changes = validate_edit_plan(
        EditProposalRequest(instruction=instruction, idempotency_key=uuid4()),
        [current],
        plan,
    )

    assert changes[0].group_id != changes[1].group_id
    assert (
        replace_anchors(current.body_markdown, changes)
        == "We serve 12 schools over 14 months."
    )


def test_semantically_preserved_number_format_is_not_reclassified_by_tokens():
    current = chapter("We serve ten schools.")
    instruction = "Use digits for the school count."
    plan = reviewed_plan(
        current,
        [
            {
                "start": 9,
                "before": "ten",
                "after": "10",
                "kind": "wording",
                "group_id": "format",
            }
        ],
        ["preserved"],
    )

    changes = validate_edit_plan(
        EditProposalRequest(instruction=instruction, idempotency_key=uuid4()),
        [current],
        plan,
    )

    assert changes[0].kind == "wording"
    assert replace_anchors(current.body_markdown, changes) == "We serve 10 schools."


def test_llm_supported_calculation_does_not_require_literal_result_in_user_quote():
    current = chapter("We serve 10 schools.")
    instruction = "Double the number of schools."
    plan = reviewed_plan(
        current, [factual("10 schools", "20 schools", instruction)], ["user"]
    )

    changes = validate_edit_plan(
        EditProposalRequest(instruction=instruction, idempotency_key=uuid4()),
        [current],
        plan,
    )

    assert replace_anchors(current.body_markdown, changes) == "We serve 20 schools."


def test_python_does_not_add_unreviewed_replacements_to_a_global_request():
    current = chapter("We serve 10 schools. These 10 schools receive grants.")
    instruction = "Replace every 10 schools with 12 schools."
    plan = reviewed_plan(
        current,
        [{**factual("10 schools", "12 schools", instruction), "start": 9}],
        ["user"],
    )

    changes = validate_edit_plan(
        EditProposalRequest(instruction=instruction, idempotency_key=uuid4()),
        [current],
        plan,
    )

    assert len(changes) == 1
    assert (
        replace_anchors(current.body_markdown, changes)
        == "We serve 12 schools. These 10 schools receive grants."
    )


def test_llm_rejection_still_blocks_a_proposal():
    current = chapter("We serve 10 schools.")
    with pytest.raises(EditOperationError) as error:
        reviewed_plan(
            current,
            [factual("10 schools", "20 schools", "Make this clearer.")],
            ["unsupported"],
        )
    assert error.value.code == "unsupported_edit"


@pytest.mark.parametrize(
    "failure,code",
    [
        ("missing_review", "invalid_review"),
        ("fabricated_quote", "invalid_user_input"),
        ("fabricated_source", "invalid_source"),
        ("wrong_anchor", "invalid_anchor"),
        ("locked", "invalid_target"),
        ("heading", "structure_changed"),
    ],
)
def test_storage_and_provenance_guards_remain(failure, code):
    current = chapter("## Implementation\nWe serve 10 schools.")
    instruction = "Serve 12 schools."
    change = factual("10 schools", "12 schools", instruction)
    if failure == "fabricated_quote":
        change["user_input_quote"] = "Invented user instruction"
    if failure == "fabricated_source":
        change["source_refs"] = [str(uuid4())]
    if failure == "wrong_anchor":
        change["before"] = "Text absent from this chapter"
    if failure == "heading":
        change.update(before="## Implementation", after="## New heading")
    if failure == "locked":
        current = replace(current, user_locked=True)
    plan = reviewed_plan(current, [change], ["user"])
    if failure == "missing_review":
        plan = plan.model_copy(
            update={
                "changes": [
                    plan.changes[0].model_copy(update={"semantic_support": None})
                ]
            }
        )

    with pytest.raises(EditOperationError) as error:
        validate_edit_plan(
            EditProposalRequest(instruction=instruction, idempotency_key=uuid4()),
            [current],
            plan,
        )
    assert error.value.code == code
