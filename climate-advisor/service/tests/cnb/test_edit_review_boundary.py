"""LLM decisions own meaning; Python checks exact changes and their identities."""

import json
from dataclasses import replace
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from app.models.cnb.concept_note_edits import (
    ChapterEditPlanOutput,
    ChapterEditReview,
    EditProposalRequest,
    EditProposalResponse,
    EditScope,
)
from app.persistence.concept_notes.edits import EditOperationError, replace_anchors
from app.persistence.concept_notes.workspace import WorkspaceChapterSnapshot
from app.services.cnb.edit_planner import (
    ConceptNoteEditPlanner,
    bind_semantic_reviews,
    build_planner_input,
    combine_chapter_plans,
)
from app.services.cnb.edit_validation import validate_edit_plan

from app.config import get_settings


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


@pytest.fixture
def duplicate_sources():
    return [
        {
            "upload_id": str(uuid4()),
            "sha256": fingerprint * 64,
            "source_label": "plan.pdf",
            "filename": "plan.pdf",
            "source_format": "pdf",
            "source_index": 999,
            "summary": f"The project serves {count} schools.",
            "topics": ["schools"],
            "key_excerpts": [{"text": f"We serve {count} schools.", "page": 1}],
            "storage_key": f"private/{fingerprint}.pdf",
        }
        for fingerprint, count in [("a", 12), ("b", 14)]
    ]


@pytest.mark.parametrize("reference,index", [("1", 0), ("2", 1)])
def test_duplicate_source_labels_resolve_exact_index_and_snapshot(
    duplicate_sources, reference, index
):
    current = chapter("We serve 10 schools.")
    plan = reviewed_plan(
        current,
        [
            {
                **factual("10 schools", "12 schools", None),
                "source_refs": [reference],
            }
        ],
        ["source"],
    )
    changes = validate_edit_plan(
        EditProposalRequest(
            instruction="Use the selected plan.", idempotency_key=uuid4()
        ),
        [current],
        plan,
        {"selected_sources": duplicate_sources},
    )
    assert changes[0].source_refs == [reference]
    assert changes[0].source_snapshots[0].model_dump(mode="json") == {
        key: duplicate_sources[index][key]
        for key in ("upload_id", "source_label", "sha256")
    }


@pytest.mark.parametrize("reference", ["plan.pdf", "0", "3", "01", "upload_id"])
def test_source_labels_ids_and_invalid_indices_cannot_select_evidence(
    duplicate_sources, reference
):
    current = chapter("We serve 10 schools.")
    if reference == "upload_id":
        reference = duplicate_sources[0]["upload_id"]
    plan = reviewed_plan(
        current,
        [
            {
                **factual("10 schools", "12 schools", None),
                "source_refs": [reference],
            }
        ],
        ["source"],
    )
    with pytest.raises(EditOperationError) as error:
        validate_edit_plan(
            EditProposalRequest(
                instruction="Use the selected plan.", idempotency_key=uuid4()
            ),
            [current],
            plan,
            {"selected_sources": duplicate_sources},
        )
    assert error.value.code == "invalid_source"


@pytest.mark.asyncio
async def test_planner_and_reviewer_receive_evidence_without_backend_metadata(
    duplicate_sources,
):
    current = chapter("We serve 10 schools.")
    request = EditProposalRequest(
        instruction="Use the second plan's school count.", idempotency_key=uuid4()
    )
    context = {
        "selected_sources": duplicate_sources,
        "cc_context": {
            "city": {
                "cityId": "private-city",
                "name": "Example City",
                "storageKey": "private/storage",
                "s3_key": "private/s3",
                "object_key": "private/object",
            }
        },
        "funder_context": {"funder_id": "private-funder", "name": "Example Fund"},
        "document_context": {
            "chapter_id": str(current.chapter_id),
            "title": "Application",
        },
        "similar_projects": [
            {
                "project_id": "private-project",
                "summary": "School upgrades.",
                "markdown_s3_key": "private/project.md",
            }
        ],
        "unexpected_metadata": "private-extra",
    }
    duplicate_sources[0]["key_excerpts"].append(
        {
            "text": "School upgrades are eligible.",
            "anchor": "eligibility/block-a81bd152fa20",
            "upload_id": "private-excerpt",
        }
    )
    original = json.dumps(context, sort_keys=True)
    calls = []

    class CapturingRunner:
        @staticmethod
        async def run(agent, payload, **kwargs):
            calls.append(json.loads(payload))
            if agent.output_type is ChapterEditPlanOutput:
                output = ChapterEditPlanOutput(
                    intent="edit",
                    changes=[
                        {
                            **factual("10 schools", "14 schools", None),
                            "source_refs": ["2"],
                        }
                    ],
                )
            else:
                output = ChapterEditReview(
                    decisions=[
                        {
                            "change_index": 0,
                            "support": "source",
                            "explanation": "The second plan specifies 14 schools.",
                        }
                    ]
                )
            return SimpleNamespace(final_output=output)

    settings = get_settings().model_copy(deep=True)
    settings.openrouter_api_key = "test-key"
    plan = await ConceptNoteEditPlanner(settings, runner=CapturingRunner).plan(
        request, [current], context
    )
    assert len(calls) == 2
    for payload in calls:
        encoded = json.dumps(payload)
        for secret in [
            "private-",
            "private/",
            str(current.chapter_id),
            "a81bd152fa20",
            *[
                source[key]
                for source in duplicate_sources
                for key in ("upload_id", "sha256")
            ],
        ]:
            assert secret not in encoded
        source = payload["run_context"]["selected_sources"][0]
        assert source["source_index"] == 1
        assert source["summary"] == duplicate_sources[0]["summary"]
        assert source["key_excerpts"][1] == {
            "text": "School upgrades are eligible.",
            "heading": "eligibility",
        }
        assert payload["run_context"]["cc_context"]["city"] == {"name": "Example City"}
    assert calls[1]["changes"][0]["source_refs"] == ["2"]
    changes = validate_edit_plan(request, [current], plan, context)
    assert (
        str(changes[0].source_snapshots[0].upload_id)
        == duplicate_sources[1]["upload_id"]
    )
    assert changes[0].source_snapshots[0].sha256 == duplicate_sources[1]["sha256"]
    assert json.dumps(context, sort_keys=True) == original


@pytest.mark.parametrize("source_changed", [False, True])
def test_refinement_rebinds_snapshots_without_replaying_private_source_refs(
    duplicate_sources, source_changed
):
    current = chapter("We serve 10 schools.")
    request = EditProposalRequest(
        instruction="Use the selected plan.", idempotency_key=uuid4()
    )
    plan = reviewed_plan(
        current,
        [{**factual("10 schools", "12 schools", None), "source_refs": ["1"]}],
        ["source"],
    )
    changes = validate_edit_plan(
        request, [current], plan, {"selected_sources": duplicate_sources}
    )
    # A saved proposal may carry private references; only its verified snapshots are trusted.
    changes[0] = changes[0].model_copy(
        update={"source_refs": [duplicate_sources[0]["upload_id"]]}
    )
    now = datetime.now(timezone.utc)
    prior = EditProposalResponse(
        proposal_id=uuid4(),
        run_id=uuid4(),
        instruction=request.instruction,
        scope=EditScope(),
        status="proposed",
        changes=changes,
        created_at=now,
        updated_at=now,
    )
    reordered = [duplicate_sources[1], dict(duplicate_sources[0])]
    if source_changed:
        reordered[1]["sha256"] = "c" * 64
    payload = build_planner_input(
        request, current, {"selected_sources": reordered}, prior_proposal=prior
    )
    assert payload["prior_proposal"]["changes"][0]["source_refs"] == (
        [] if source_changed else ["2"]
    )
    encoded = json.dumps(payload)
    for value in [
        str(prior.proposal_id),
        str(prior.run_id),
        str(changes[0].change_id),
        *[
            source[key]
            for source in duplicate_sources
            for key in ("upload_id", "sha256")
        ],
    ]:
        assert value not in encoded
