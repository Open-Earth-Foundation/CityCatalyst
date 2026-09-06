from __future__ import annotations

import asyncio
import json
from dataclasses import replace
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from app.config.settings import get_settings
from app.models.cnb.concept_note_edits import (
    ChapterEditPlanOutput,
    ChapterEditReview,
    EditPlanOutput,
    EditProposalRequest,
    EditScope,
    PlannedTextChange,
)
from app.persistence.concept_notes.edits import EditOperationError
from app.persistence.concept_notes.workspace import (
    WorkspaceChapterSnapshot,
    WorkspaceGapSnapshot,
)
from app.services.cnb.edit_planner import (
    ConceptNoteEditPlanner,
    bind_semantic_reviews,
    build_planner_input,
    combine_chapter_plans,
    expand_explicit_global_replacements,
    explicit_global_literal_pair,
    fact_tokens,
    validate_edit_plan,
)
from app.services.cnb.edit_planner import (
    validate_edit_plan as validate_wording_plan,
)
from tests.cnb.edit_helpers import BODY, CHAPTER_ID, OTHER_CHAPTER_ID


def snapshot(**overrides) -> WorkspaceChapterSnapshot:
    base = WorkspaceChapterSnapshot(
        chapter_id=CHAPTER_ID,
        chapter_ref="summary",
        title="Summary",
        position=0,
        status="draft",
        required=True,
        user_locked=False,
        body_markdown=BODY,
        gaps=[],
        revision_id=uuid4(),
        revision_number=1,
        confirmed_body_markdown=None,
        confirmed_revision_number=None,
        proposed_revision_number=None,
        regeneration_status="idle",
        regeneration_error=None,
    )
    return replace(base, **overrides)


def request(**overrides) -> EditProposalRequest:
    return EditProposalRequest(
        **{
            "instruction": "Make the parks wording clearer",
            "idempotency_key": uuid4(),
            "scope": EditScope(focused_chapter_id=CHAPTER_ID),
            **overrides,
        }
    )


def open_gap(question: str) -> WorkspaceGapSnapshot:
    """Build one unresolved structured gap for marker-validation tests."""
    now = datetime.now(UTC)
    return WorkspaceGapSnapshot(
        gap_id=uuid4(),
        field_key="test_gap",
        question=question,
        why_asking="Required for the concept note.",
        severity="critical",
        state="open",
        suggestions=[],
        source_refs=[],
        version=1,
        resolution=None,
        created_at=now,
        updated_at=now,
    )


def plan(**overrides) -> EditPlanOutput:
    change = {
        "chapter_id": CHAPTER_ID,
        "start": BODY.index("builds parks"),
        "before": "builds parks",
        "after": "creates greener parks",
        "kind": "wording",
        "group_id": "clarity",
    }
    return EditPlanOutput(
        intent="edit", changes=[PlannedTextChange(**{**change, **overrides})]
    )


def test_single_chapter_wording_uses_actual_base_and_preserves_unrelated_text() -> None:
    changes = validate_wording_plan(request(), [snapshot()], plan())
    assert changes[0].base_revision == 1
    assert changes[0].chapter_title == "Summary"
    assert changes[0].before == "builds parks"


def test_model_cannot_target_foreign_chapter_or_invent_before_text() -> None:
    with pytest.raises(EditOperationError) as error:
        validate_wording_plan(request(), [snapshot()], plan(chapter_id=uuid4()))
    assert error.value.code == "invalid_target"
    with pytest.raises(EditOperationError) as error:
        validate_wording_plan(request(), [snapshot()], plan(before="invented anchor"))
    assert error.value.code == "invalid_anchor"


def test_automatic_scope_allows_any_unlocked_draft_chapter_but_not_locked() -> None:
    neighbor = snapshot(chapter_id=OTHER_CHAPTER_ID, position=1)
    changes = validate_wording_plan(
        request(), [snapshot(), neighbor], plan(chapter_id=OTHER_CHAPTER_ID)
    )
    assert changes[0].chapter_id == OTHER_CHAPTER_ID
    with pytest.raises(EditOperationError):
        validate_wording_plan(request(), [snapshot(user_locked=True)], plan())


def test_markers_and_template_headings_cannot_be_erased_by_wording_edits() -> None:
    body = "## Summary\n[Information needed: Lead partner]"
    for before, after, code in [
        ("## Summary", "## New heading", "structure_changed"),
        ("[Information needed: Lead partner]", "The lead is known", "marker_changed"),
    ]:
        with pytest.raises(EditOperationError) as error:
            validate_wording_plan(
                request(),
                [snapshot(body_markdown=body)],
                plan(start=body.index(before), before=before, after=after),
            )
        assert error.value.code == code


def test_grounded_edit_can_replace_marker_for_matching_open_gap() -> None:
    marker = "[Information needed: Confirm the lead partner.]"
    replacement = "The lead partner is the City Transport Authority."
    body = f"## Summary\n\n{marker}"
    source_id = str(uuid4())
    changes = validate_wording_plan(
        request(instruction="Fill the lead partner gap from the uploaded document"),
        [
            snapshot(
                body_markdown=body,
                gaps=[open_gap("Confirm the lead partner.")],
            )
        ],
        plan(
            start=body.index(marker),
            before=marker,
            after=replacement,
            kind="wording",
            source_refs=[source_id],
        ),
        {
            "selected_sources": [
                {
                    "upload_id": source_id,
                    "source_label": "Investment plan",
                    "sha256": "a" * 64,
                    "summary": replacement,
                    "key_excerpts": [],
                }
            ]
        },
    )

    assert changes[0].kind == "factual"
    assert changes[0].after == replacement


def test_marker_replacement_requires_matching_open_gap() -> None:
    marker = "[Information needed: Confirm the lead partner.]"
    body = f"## Summary\n\n{marker}"
    with pytest.raises(EditOperationError) as error:
        validate_wording_plan(
            request(instruction="Fill the lead partner gap"),
            [snapshot(body_markdown=body)],
            plan(
                start=body.index(marker),
                before=marker,
                after="The lead partner is known.",
                kind="factual",
                user_input_quote="Fill the lead partner gap",
            ),
        )
    assert error.value.code == "marker_changed"


def test_numeric_changes_are_not_accepted_as_harmless_wording() -> None:
    with pytest.raises(EditOperationError) as error:
        validate_wording_plan(
            request(),
            [snapshot()],
            plan(
                start=BODY.index("10 million"), before="10 million", after="20 million"
            ),
        )
    assert error.value.code == "clarification_required"


def test_context_contains_only_current_chapter_without_storage_metadata() -> None:
    result = build_planner_input(
        request(),
        snapshot(confirmed_body_markdown="Confirmed text"),
        {"selected_sources": [], "token": "secret", "storage_key": "private"},
        recent_messages=[
            {"role": "user", "content": "first"},
            {"role": "assistant", "content": "second"},
            {"role": "system", "content": "hidden"},
            {"role": "user", "content": "third"},
            {"role": "assistant", "content": "fourth"},
        ],
    )
    assert result["chapter"]["body_markdown"] == BODY
    assert result["chapter"]["confirmed_body_markdown"] == "Confirmed text"
    assert "chapter_id" not in json.dumps(result)
    assert "revision" not in json.dumps(result)
    assert result["run_context"] == {"selected_sources": []}
    assert result["recent_messages"] == [
        {"role": "assistant", "content": "second"},
        {"role": "user", "content": "third"},
        {"role": "assistant", "content": "fourth"},
    ]


def test_recent_user_message_can_ground_a_short_factual_follow_up() -> None:
    original = "Change the investment amount to EUR 12 million"
    changes = validate_edit_plan(
        request(instruction="yes"),
        [snapshot()],
        investment_plan([snapshot()], original),
        recent_messages=[
            {"role": "user", "content": original},
            {"role": "assistant", "content": "Should I change it?"},
        ],
    )

    assert changes[0].after == "EUR 12 million"


@pytest.mark.parametrize(
    "instruction",
    [
        "change all chapter beginnings to not have the project name besides the first",
        "keep the full project name only in Chapter 1 and replace it in later openings",
        "Chapter 1 keeps the project name and later chapters use neutral openings",
    ],
)
def test_recent_direct_request_can_remove_project_name_from_chapter_opening(
    instruction: str,
) -> None:
    project_name = (
        "Kraków Fast Tram Stage 4 (KST IV), commonly presented as Tram to Mistrzejowice"
    )
    first_body = f"## Project summary\n\n{project_name} improves connectivity."
    body = (
        f"## Context and rationale\n\n{project_name} improves connectivity. "
        f"The corridor is also known as {project_name}."
    )
    first_chapter = snapshot(body_markdown=first_body)
    chapter = snapshot(
        chapter_id=OTHER_CHAPTER_ID,
        title="Context and rationale",
        position=1,
        body_markdown=body,
    )
    generated = EditPlanOutput(
        intent="edit",
        changes=[
            PlannedTextChange(
                chapter_id=chapter.chapter_id,
                start=body.index(project_name),
                before=project_name,
                after="This section",
                kind="factual",
                group_id="neutral_chapter_opening",
                user_input_quote=instruction,
            )
        ],
    )

    changes = validate_edit_plan(
        request(instruction="yes it should"),
        [first_chapter, chapter],
        generated,
        recent_messages=[
            {"role": "user", "content": instruction},
            {
                "role": "assistant",
                "content": "Should the project name remain only in the first chapter?",
            },
        ],
    )

    assert changes[0].after == "This section"
    assert changes[0].source_snapshots == []


def test_project_name_request_fills_an_omitted_later_chapter_opening() -> None:
    instruction = (
        "Chapter 1 keeps the full project name. Rewrite every later chapter opening "
        "with neutral wording."
    )
    project_name = "Kraków Fast Tram Stage 4 (KST IV)"
    first_chapter = snapshot(body_markdown=f"## Summary\n\n{project_name} starts here.")
    second_chapter = snapshot(
        chapter_id=OTHER_CHAPTER_ID,
        title="Context",
        position=1,
        body_markdown=f"## Context\n\n{project_name} has context.",
    )
    third_chapter = snapshot(
        chapter_id=uuid4(),
        title="Objectives",
        position=2,
        body_markdown=f"## Objectives\n\n{project_name} has objectives.",
    )
    generated = EditPlanOutput(
        intent="edit",
        changes=[
            PlannedTextChange(
                chapter_id=third_chapter.chapter_id,
                start=third_chapter.body_markdown.index(project_name),
                before=project_name,
                after="The project",
                kind="factual",
                group_id="neutral_chapter_opening",
                user_input_quote=instruction,
            )
        ],
    )

    changes = validate_edit_plan(
        request(instruction=instruction),
        [first_chapter, second_chapter, third_chapter],
        generated,
    )

    assert {change.chapter_id for change in changes} == {
        second_chapter.chapter_id,
        third_chapter.chapter_id,
    }
    assert all(change.after == "The project" for change in changes)


async def test_fake_model_receives_bound_input_and_question_is_no_edit() -> None:
    captured = {}

    class FakeRunner:
        @staticmethod
        async def run(agent, payload, **kwargs):
            captured.update(agent=agent, payload=payload, **kwargs)
            return SimpleNamespace(
                final_output={
                    "intent": "question",
                    "changes": [],
                    "clarification": None,
                }
            )

    settings = get_settings().model_copy(deep=True)
    settings.openrouter_api_key = "test-only"
    result = await ConceptNoteEditPlanner(settings, runner=FakeRunner).plan(
        request(instruction="Why does the project build parks?"), [snapshot()], {}
    )
    assert result.intent == "question"
    assert captured["agent"].tools == []
    assert captured["run_config"].tracing_disabled
    assert "builds parks" in captured["payload"]


async def test_context_limit_fails_before_client_or_model_call(monkeypatch) -> None:
    settings = get_settings().model_copy(deep=True)
    monkeypatch.setattr(
        "app.services.cnb.edit_planner.count_prompt_tokens",
        lambda *args, **kwargs: SimpleNamespace(tokens=1_000_000),
    )
    with pytest.raises(EditOperationError) as error:
        await ConceptNoteEditPlanner(settings).plan(request(), [snapshot()], {})
    assert error.value.code == "context_limit"


def investment_plan(
    chapters,
    instruction="Change the investment amount to EUR 12 million",
    *,
    omit_last=False,
    source_ref=None,
    quote=True,
):
    changes = []
    for index, chapter in enumerate(chapters[:-1] if omit_last else chapters):
        before = (
            "EUR 10 million"
            if "EUR 10 million" in chapter.body_markdown
            else "€10 million"
        )
        after = "EUR 12 million" if before.startswith("EUR") else "€12 million"
        changes.append(
            PlannedTextChange(
                chapter_id=chapter.chapter_id,
                start=chapter.body_markdown.index(before),
                before=before,
                after=after,
                kind="factual",
                group_id=f"model-group-{index}",
                source_refs=[source_ref] if source_ref else [],
                user_input_quote=instruction if quote else None,
            )
        )
    return EditPlanOutput(intent="edit", changes=changes)


def test_semantic_fact_edit_uses_whole_document_despite_focus_and_merges_groups() -> (
    None
):
    chapters = [
        snapshot(),
        snapshot(
            chapter_id=OTHER_CHAPTER_ID,
            position=1,
            body_markdown="Budget: €10 million. Unrelated text stays.",
        ),
    ]
    instruction = "Change the investment amount to EUR 12 million"
    body = request(
        instruction=instruction, scope=EditScope(focused_chapter_id=CHAPTER_ID)
    )
    changes = validate_edit_plan(body, chapters, investment_plan(chapters, instruction))
    assert {change.chapter_id for change in changes} == {CHAPTER_ID, OTHER_CHAPTER_ID}
    assert len({change.group_id for change in changes}) == 1
    assert all(
        change.kind == "factual" and change.user_input_quote == instruction
        for change in changes
    )


def test_omitted_investment_occurrence_requires_clarification_not_inconsistent_proposal() -> (
    None
):
    chapters = [snapshot(), snapshot(chapter_id=OTHER_CHAPTER_ID, position=1)]
    with pytest.raises(EditOperationError) as error:
        validate_edit_plan(
            request(
                instruction="Change the investment amount to EUR 12 million",
                scope=EditScope(),
            ),
            chapters,
            investment_plan(chapters, omit_last=True),
        )
    assert error.value.code == "clarification_required"


def test_unique_quote_recovers_bad_unicode_offset_but_ambiguous_quote_fails() -> None:
    body = "🌳 " + BODY
    changes = validate_edit_plan(
        request(), [snapshot(body_markdown=body)], plan(start=999)
    )
    assert changes[0].start == body.index("builds parks")
    with pytest.raises(EditOperationError) as error:
        validate_edit_plan(
            request(), [snapshot(body_markdown=BODY + " builds parks")], plan(start=999)
        )
    assert error.value.code == "invalid_anchor"


def test_full_document_rewrite_uses_automatic_scope_without_confirmation() -> None:
    body = request(
        instruction="Rewrite the entire draft more clearly", scope=EditScope()
    )
    assert validate_edit_plan(body, [snapshot()], plan())


def test_explicit_all_occurrences_are_completed_from_exact_user_literals() -> None:
    instruction = "Change every occurrence of Stage IV to Stage 4 in this concept note."
    chapters = [
        snapshot(body_markdown="Stage IV opens. Stage IV continues."),
        snapshot(
            chapter_id=OTHER_CHAPTER_ID,
            position=1,
            body_markdown="A final Stage IV reference.",
        ),
    ]
    generated = EditPlanOutput(
        intent="edit",
        changes=[
            PlannedTextChange(
                chapter_id=CHAPTER_ID,
                start=0,
                before="Stage IV",
                after="Stage 4",
                kind="factual",
                group_id="stage",
                user_input_quote=instruction,
            )
        ],
    )

    expanded = expand_explicit_global_replacements(
        request(instruction=instruction, scope=EditScope()), chapters, generated
    )

    assert [(change.chapter_id, change.start) for change in expanded.changes] == [
        (CHAPTER_ID, 0),
        (CHAPTER_ID, 16),
        (OTHER_CHAPTER_ID, 8),
    ]
    assert all(change.user_input_quote == instruction for change in expanded.changes)
    assert (
        len(validate_edit_plan(request(instruction=instruction), chapters, generated))
        == 3
    )


def test_explicit_global_pair_overrides_under_enumerated_sentence_edits() -> None:
    instruction = "Change every occurrence of Stage IV to Stage 4 in this concept note."
    body = "Stage IV opens. Later Stage IV continues."
    generated = EditPlanOutput(
        intent="edit",
        changes=[
            PlannedTextChange(
                chapter_id=CHAPTER_ID,
                start=0,
                before="Stage IV opens.",
                after="Stage 4 opens.",
                kind="factual",
                group_id="stage",
                user_input_quote=instruction,
            )
        ],
    )

    expanded = expand_explicit_global_replacements(
        request(instruction=instruction), [snapshot(body_markdown=body)], generated
    )

    assert explicit_global_literal_pair(instruction) == ("Stage IV", "Stage 4")
    assert [
        (change.start, change.before, change.after) for change in expanded.changes
    ] == [
        (0, "Stage IV", "Stage 4"),
        (22, "Stage IV", "Stage 4"),
    ]
    assert (
        len(
            validate_edit_plan(
                request(instruction=instruction),
                [snapshot(body_markdown=body)],
                generated,
            )
        )
        == 2
    )


def test_vague_broad_rewrite_does_not_expand_model_wording_pair() -> None:
    generated = plan(before="builds parks", after="creates greener parks")
    result = expand_explicit_global_replacements(
        request(instruction="Make all parks wording clearer"),
        [snapshot(body_markdown=BODY + " builds parks")],
        generated,
    )
    assert result == generated


def test_global_literal_expansion_preserves_markers_and_template_headings() -> None:
    instruction = "Change every occurrence of Stage IV to Stage 4 in this concept note."
    body = (
        "## Stage IV heading\n\n"
        "Stage IV opens.\n"
        "[Information needed: Confirm Stage IV delivery status]"
    )
    generated = EditPlanOutput(
        intent="edit",
        changes=[
            PlannedTextChange(
                chapter_id=CHAPTER_ID,
                start=body.index("Stage IV opens"),
                before="Stage IV",
                after="Stage 4",
                kind="factual",
                group_id="stage",
                user_input_quote=instruction,
            )
        ],
    )

    result = validate_edit_plan(
        request(instruction=instruction),
        [snapshot(body_markdown=body)],
        generated,
    )

    assert len(result) == 1
    assert result[0].start == body.index("Stage IV opens")


def test_factual_source_reference_is_run_bound_immutable_and_must_support_value() -> (
    None
):
    chapters = [snapshot()]
    source_id = str(uuid4())
    context = {
        "selected_sources": [
            {
                "upload_id": source_id,
                "source_label": "Approved budget",
                "sha256": "a" * 64,
                "summary": "Investment is EUR 12 million.",
                "key_excerpts": [],
            }
        ]
    }
    generated = investment_plan(chapters, source_ref=source_id, quote=False)
    changes = validate_edit_plan(request(), chapters, generated, context)
    assert changes[0].source_snapshots[0].sha256 == "a" * 64
    with pytest.raises(EditOperationError) as error:
        validate_edit_plan(request(), chapters, generated, {})
    assert error.value.code == "invalid_source"
    context["selected_sources"][0]["summary"] = "Only EUR 10 million is evidenced."
    with pytest.raises(EditOperationError) as error:
        validate_edit_plan(request(), chapters, generated, context)
    assert error.value.code == "clarification_required"


def test_model_cannot_invent_user_input_or_disguise_named_entity_change_as_wording() -> (
    None
):
    generated = plan(user_input_quote="The user never said this")
    with pytest.raises(EditOperationError) as error:
        validate_edit_plan(request(), [snapshot()], generated)
    assert error.value.code == "invalid_user_input"
    with pytest.raises(EditOperationError) as error:
        validate_edit_plan(
            request(),
            [snapshot(body_markdown="Lincoln Council leads.")],
            plan(start=0, before="Lincoln Council", after="Other Company"),
        )
    assert error.value.code == "clarification_required"


def test_contradictory_values_for_same_fact_are_rejected() -> None:
    chapters = [snapshot(), snapshot(chapter_id=OTHER_CHAPTER_ID, position=1)]
    instruction = "Change the investment amount to EUR 12 million and EUR 13 million"
    generated = investment_plan(chapters, instruction)
    generated = generated.model_copy(
        update={
            "changes": [
                generated.changes[0],
                generated.changes[1].model_copy(update={"after": "EUR 13 million"}),
            ]
        }
    )
    with pytest.raises(EditOperationError) as error:
        validate_edit_plan(
            request(instruction=instruction, scope=EditScope()), chapters, generated
        )
    assert error.value.code == "inconsistent_fact"


@pytest.mark.parametrize(
    "value",
    ["EUR 10 million", "€10m", "10,000,000 EUR", "EUR 10.000.000", "EUR 10,0 million"],
)
def test_currency_variants_have_one_canonical_consistency_value(value: str) -> None:
    assert fact_tokens(value) == [("EUR", "1E+7")]


def test_delivery_date_change_covers_repeated_year_and_preserves_unrelated_text() -> (
    None
):
    chapters = [
        snapshot(body_markdown="Delivery starts in 2030. Parks stay public."),
        snapshot(
            chapter_id=OTHER_CHAPTER_ID,
            position=1,
            body_markdown="The completion date is 2030.",
        ),
    ]
    instruction = "Change the delivery year to 2031 everywhere"
    generated = EditPlanOutput(
        intent="edit",
        changes=[
            PlannedTextChange(
                chapter_id=chapter.chapter_id,
                start=chapter.body_markdown.index("2030"),
                before="2030",
                after="2031",
                kind="factual",
                group_id=f"year-{index}",
                user_input_quote=instruction,
            )
            for index, chapter in enumerate(chapters)
        ],
    )
    result = validate_edit_plan(
        request(instruction=instruction, scope=EditScope()), chapters, generated
    )
    assert len(result) == 2 and len({change.group_id for change in result}) == 1
    assert result[0].after == "2031"


async def test_planner_runs_isolated_chapters_with_bounded_parallelism() -> None:
    chapters = [
        snapshot(
            chapter_id=uuid4(),
            position=index,
            body_markdown=f"Chapter {index} builds parks.",
        )
        for index in range(5)
    ]
    payloads = []
    active = 0
    max_active = 0

    class ParallelRunner:
        @staticmethod
        async def run(agent, payload, **kwargs):
            nonlocal active, max_active
            parsed = json.loads(payload)
            if agent.output_type is ChapterEditReview:
                return SimpleNamespace(
                    final_output={
                        "decisions": [
                            {
                                "change_index": 0,
                                "support": "preserved",
                                "explanation": "Same park proposal.",
                            }
                        ]
                    }
                )
            payloads.append(parsed)
            active += 1
            max_active = max(max_active, active)
            await asyncio.sleep(0.01)
            active -= 1
            body = parsed["chapter"]["body_markdown"]
            return SimpleNamespace(
                final_output={
                    "intent": "edit",
                    "changes": [
                        {
                            "start": body.index("builds parks"),
                            "before": "builds parks",
                            "after": "creates greener parks",
                            "kind": "wording",
                            "group_id": "clarity",
                            "source_refs": [],
                            "user_input_quote": None,
                        }
                    ],
                    "clarification": None,
                }
            )

    settings = get_settings().model_copy(deep=True)
    settings.openrouter_api_key = "test-only"
    result = await ConceptNoteEditPlanner(settings, runner=ParallelRunner).plan(
        request(scope=EditScope(focused_chapter_id=chapters[3].chapter_id)),
        chapters,
        {},
    )

    assert result.intent == "edit"
    assert len(result.changes) == len(chapters)
    assert len({change.group_id for change in result.changes}) == len(chapters)
    assert max_active == settings.llm.generation.prompt_budget.cnb_edits.max_concurrency
    assert {payload["chapter"]["body_markdown"] for payload in payloads} == {
        chapter.body_markdown for chapter in chapters
    }
    assert all(payload["instruction"] == request().instruction for payload in payloads)
    assert sum(payload["is_focused_chapter"] for payload in payloads) == 1
    serialized_payloads = {
        payload["chapter"]["position"]: json.dumps(payload) for payload in payloads
    }
    for chapter in chapters:
        serialized = serialized_payloads[chapter.position]
        assert serialized.count("builds parks") == 1
        assert str(chapter.chapter_id) not in serialized


def test_combiner_keeps_no_change_separate_and_blocks_partial_clarification() -> None:
    chapters = [snapshot(), snapshot(chapter_id=OTHER_CHAPTER_ID, position=1)]
    assert (
        combine_chapter_plans(
            chapters,
            [
                ChapterEditPlanOutput(intent="question"),
                ChapterEditPlanOutput(intent="no_change"),
            ],
        ).intent
        == "question"
    )
    clarified = combine_chapter_plans(
        chapters,
        [
            ChapterEditPlanOutput(
                intent="clarification", clarification="Which value should change?"
            ),
            ChapterEditPlanOutput(intent="no_change"),
        ],
    )
    assert clarified.intent == "clarification"
    assert clarified.clarification == "Which value should change?"


def test_generic_wording_quote_cannot_ground_removed_negation_or_deleted_fact() -> None:
    cases = [
        ("Funding is not guaranteed.", "Funding is guaranteed."),
        ("Funding is not guaranteed.", ""),
        ("Funding is EUR 10 million.", "Funding is available."),
    ]
    for before, after in cases:
        with pytest.raises(EditOperationError) as error:
            validate_edit_plan(
                request(instruction="Improve the wording"),
                [snapshot(body_markdown=before)],
                plan(
                    start=0,
                    before=before,
                    after=after,
                    user_input_quote="Improve the wording",
                ),
            )
        assert error.value.code == "clarification_required"


def test_source_affirming_resulting_claim_can_ground_word_level_negation_removal() -> (
    None
):
    body = "Funding is not guaranteed."
    source_id = str(uuid4())
    context = {
        "selected_sources": [
            {
                "upload_id": source_id,
                "source_label": "Signed agreement",
                "sha256": "b" * 64,
                "summary": "Funding is guaranteed.",
                "key_excerpts": [],
            }
        ]
    }
    generated = plan(
        start=body.index("not "), before="not ", after="", source_refs=[source_id]
    )
    result = validate_edit_plan(
        request(instruction="Update the funding statement from the signed agreement"),
        [snapshot(body_markdown=body)],
        generated,
        context,
    )
    assert result[0].kind == "factual"


def test_explicit_user_removal_naming_value_is_grounded_but_not_a_generic_edit() -> (
    None
):
    instruction = "Remove the old EUR 10 million estimate"
    body = "Old estimate: EUR 10 million. Further review follows."
    generated = plan(
        start=body.index("EUR"),
        before="EUR 10 million",
        after="",
        user_input_quote=instruction,
    )
    assert (
        validate_edit_plan(
            request(instruction=instruction), [snapshot(body_markdown=body)], generated
        )[0].kind
        == "factual"
    )


@pytest.mark.parametrize(
    "instruction",
    [
        "Remove repetitions, not factual content",
        "Do not remove not from the funding statement",
    ],
)
def test_negated_or_unrelated_removal_does_not_authorize_deleting_not(
    instruction: str,
) -> None:
    body = "Funding is not guaranteed."
    with pytest.raises(EditOperationError):
        validate_edit_plan(
            request(instruction=instruction),
            [snapshot(body_markdown=body)],
            plan(
                start=body.index("not "),
                before="not ",
                after="",
                user_input_quote=instruction,
            ),
        )


def test_prefix_negation_in_source_is_not_affirmative_support() -> None:
    body = "Not guaranteed funding."
    source_id = str(uuid4())
    context = {
        "selected_sources": [
            {
                "upload_id": source_id,
                "source_label": "Agreement",
                "sha256": "a" * 64,
                "summary": "Not guaranteed funding.",
                "key_excerpts": [],
            }
        ]
    }
    with pytest.raises(EditOperationError):
        validate_edit_plan(
            request(),
            [snapshot(body_markdown=body)],
            plan(
                start=0,
                before="Not guaranteed funding.",
                after="Guaranteed funding.",
                source_refs=[source_id],
            ),
            context,
        )


@pytest.mark.parametrize(
    "before,after",
    [
        ("Funding isn't guaranteed.", "Funding is guaranteed."),
        ("Funding isn’t guaranteed.", "Funding is guaranteed."),
        ("The partners aren't committed.", "The partners are committed."),
        ("The project won't start.", "The project will start."),
        ("The project can’t proceed.", "The project can proceed."),
    ],
)
def test_negative_contractions_cannot_disappear_as_harmless_wording(
    before: str, after: str
) -> None:
    with pytest.raises(EditOperationError) as error:
        validate_edit_plan(
            request(instruction="Improve the wording"),
            [snapshot(body_markdown=before)],
            plan(
                start=0,
                before=before,
                after=after,
                user_input_quote="Improve the wording",
            ),
        )
    assert error.value.code == "clarification_required"


@pytest.mark.parametrize(
    "before,after",
    [
        (
            "The programme will operationalise a stakeholder engagement mechanism.",
            "The programme will gather residents' views in several ways.",
        ),
        (
            "The project is intended to improve paths that people can use.",
            "The project aims to improve local walking paths.",
        ),
    ],
)
def test_independently_reviewed_editorial_changes_need_no_uploaded_evidence(
    before, after
):
    generated = plan(start=0, before=before, after=after)
    generated = generated.model_copy(
        update={
            "changes": [
                generated.changes[0].model_copy(
                    update={"semantic_support": "preserved"}
                )
            ]
        }
    )
    changes = validate_edit_plan(
        request(
            instruction="Please rewrite this in plain English. Keep the commitments."
        ),
        [snapshot(body_markdown=before)],
        generated,
    )
    assert changes[0].kind == "wording"
    assert changes[0].source_snapshots == []
    assert "semantic_support" not in changes[0].model_dump()


def test_semantic_review_cannot_override_numeric_grounding_or_source_identity():
    generated = plan(
        start=0,
        before="EUR 10 million",
        after="EUR 13 million",
        kind="factual",
        user_input_quote="Set the budget to EUR 12 million",
    )
    generated = generated.model_copy(
        update={
            "changes": [
                generated.changes[0].model_copy(update={"semantic_support": "user"})
            ]
        }
    )
    with pytest.raises(EditOperationError, match="new value"):
        validate_edit_plan(
            request(instruction="Set the budget to EUR 12 million"),
            [snapshot(body_markdown="EUR 10 million")],
            generated,
        )


@pytest.mark.parametrize(
    "decisions,code",
    [
        (
            [
                {
                    "change_index": 1,
                    "support": "preserved",
                    "explanation": "Wrong index.",
                }
            ],
            "invalid_review",
        ),
        (
            [
                {
                    "change_index": 0,
                    "support": "unsupported",
                    "explanation": "Removed a funding caveat.",
                }
            ],
            "unsupported_edit",
        ),
        (
            [
                {"change_index": 0, "support": "preserved", "explanation": "First."},
                {
                    "change_index": 0,
                    "support": "preserved",
                    "explanation": "Duplicate.",
                },
            ],
            "invalid_review",
        ),
    ],
)
def test_semantic_review_rejects_incomplete_duplicate_or_unsupported_assessments(
    decisions, code
):
    chapter_plan = ChapterEditPlanOutput(
        intent="edit", changes=[plan().changes[0].model_dump(exclude={"chapter_id"})]
    )
    with pytest.raises(EditOperationError) as error:
        bind_semantic_reviews(
            plan(), [chapter_plan], [ChapterEditReview(decisions=decisions)]
        )
    assert error.value.code == code


async def test_real_planner_pipeline_reviews_output_and_binds_user_budget_authority():
    instruction = "The council confirmed EUR 12 million. Update the whole note; keep the funding caveats."
    before = "The budget is EUR 10 million. Funding is not guaranteed."
    calls = []

    class ReviewingRunner:
        @staticmethod
        async def run(agent, payload, **kwargs):
            parsed = json.loads(payload)
            calls.append((agent.output_type, parsed))
            if agent.output_type is ChapterEditReview:
                return SimpleNamespace(
                    final_output={
                        "decisions": [
                            {
                                "change_index": 0,
                                "support": "user",
                                "explanation": "Explicit council budget in user instruction.",
                            }
                        ]
                    }
                )
            return SimpleNamespace(
                final_output={
                    "intent": "edit",
                    "changes": [
                        {
                            "start": before.index("EUR"),
                            "before": "EUR 10 million",
                            "after": "EUR 12 million",
                            "kind": "factual",
                            "group_id": "budget",
                            "source_refs": [],
                            "user_input_quote": instruction,
                        }
                    ],
                    "clarification": None,
                }
            )

    settings = get_settings().model_copy(deep=True)
    settings.openrouter_api_key = "test-only"
    chapters = [snapshot(body_markdown=before)]
    edit_request = request(instruction=instruction)
    generated = await ConceptNoteEditPlanner(settings, runner=ReviewingRunner).plan(
        edit_request, chapters, {}
    )
    assert len(calls) == 2
    assert calls[1][1]["changes"][0]["after"] == "EUR 12 million"
    assert calls[1][1]["chapter"]["body_markdown"] == before
    assert generated.changes[0].semantic_support == "user"
    changes = validate_edit_plan(edit_request, chapters, generated)
    assert changes[0].user_input_quote == instruction
    assert changes[0].source_snapshots == []
