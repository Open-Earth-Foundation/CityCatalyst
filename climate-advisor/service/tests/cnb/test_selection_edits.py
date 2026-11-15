"""Exact selection windows and allowlisted persisted inline formatting."""

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models.cnb.concept_note_edits import (
    EditApplyRequest,
    EditChange,
    EditPlanOutput,
    EditProposalRequest,
    EditScope,
    PlannedTextChange,
    SelectionFormatting,
)
from app.models.db.cnb_edit import ConceptNoteEditProposal
from app.models.db.cnb_workspace import ConceptNoteChapter, ConceptNoteChapterRevision
from app.persistence.concept_notes.edits import (
    ConceptNoteEditRepository,
    EditOperationError,
)
from app.persistence.concept_notes.workspace import ConceptNoteWorkspaceRepository
from app.services.cnb.edit_planner import build_planner_input
from app.services.cnb.edit_validation import validate_edit_plan
from app.services.cnb.edits import ConceptNoteEditService
from app.utils.cnb_formatting import (
    format_selection,
    formatting_tokens,
    require_preserved_formatting,
    require_style_run_edit,
)
from app.utils.cnb_selection import require_selection_change, selection_window
from tests.cnb.test_document_workspace import add_chapters
from tests.cnb.test_document_workspace import workspace as workspace  # noqa: PLC0414
from tests.cnb.test_document_workspace_source_sync import create_source_tables


def scope_for(body, text, *, occurrence=0):
    start = -1
    for _ in range(occurrence + 1):
        start = body.index(text, start + 1)
    return EditScope(
        kind="selection",
        chapter_id=uuid4(),
        base_revision=3,
        start=start,
        end=start + len(text),
        selected_markdown=text,
    )


def test_window_counts_closing_font_and_markdown_as_part_of_selected_sentence():
    body = 'First. Second. <span data-cc-font="serif"><span data-cc-bold="true">**Third.**</span></span> Fourth. Fifth.'
    scope = scope_for(body, "Third.")
    window = selection_window(scope, scope.chapter_id, 3, body)
    assert (
        body[window.start : window.end]
        == 'Second. <span data-cc-font="serif"><span data-cc-bold="true">**Third.**</span></span> Fourth. '
    )


def test_exact_codepoints_and_chosen_repeated_occurrence_are_authoritative():
    body = "😀 First. Repeated. Middle. Repeated. Last."
    scope = scope_for(body, "Repeated", occurrence=1)
    window = selection_window(scope, scope.chapter_id, 3, body)
    assert body[window.start : window.end] == "Middle. Repeated. Last."
    with pytest.raises(ValueError):
        require_selection_change(
            scope, scope.chapter_id, 3, body, body.index("Repeated"), "Repeated"
        )
    with pytest.raises(ValueError):
        selection_window(scope, scope.chapter_id, 4, body)
    with pytest.raises(ValueError):
        selection_window(scope, uuid4(), 3, body)


def test_explicit_formatting_overrides_preserve_markdown_and_other_inner_styles():
    original = (
        '**Bold** and <span data-cc-font="mono" data-cc-italic="true">*mixed*</span>'
    )
    result = format_selection(original, SelectionFormatting(font="serif", bold=False))
    assert (
        result
        == '<span data-cc-font="serif" data-cc-bold="false">**Bold** and <span data-cc-italic="true">*mixed*</span></span>'
    )
    assert formatting_tokens(result)
    require_preserved_formatting(result, result.replace("Bold", "Strong"))
    with pytest.raises(ValueError):
        require_preserved_formatting(
            result, result.replace('data-cc-font="serif"', 'data-cc-font="mono"')
        )
    with pytest.raises(ValueError):
        require_preserved_formatting(result, result.replace("**", ""))


@pytest.mark.parametrize(
    "markup",
    [
        '<span data-cc-font="evil">Text</span>',
        '<span data-cc-font="serif" onclick="evil()">Text</span>',
        '<span data-cc-bold="yes">Text</span>',
        '<span data-cc-font="serif" data-cc-font="mono">Text</span>',
        '<span data-cc-font="serif">Unclosed',
        "</span>Unopened",
        '<span data-cc-bold="true"/>',
        "Text<!-- hidden -->",
        "<!DOCTYPE html>Text",
        "<?instruction?>Text",
    ],
)
def test_invalid_or_hidden_markup_fails_closed(markup):
    with pytest.raises(ValueError):
        format_selection(markup, SelectionFormatting(bold=True))


@pytest.mark.parametrize(
    "body",
    [
        '<span data-cc-font="serif">Selected sentence.</span> Neighbor sentence.',
        "**Selected sentence.** Neighbor sentence.",
    ],
)
def test_ai_cannot_consume_or_relocate_styles_but_can_rewrite_inner_prose(body):
    start = body.index("Selected sentence.")
    require_style_run_edit(body, start, "Selected sentence.", "Clear sentence.")
    with pytest.raises(ValueError):
        require_style_run_edit(
            body,
            0,
            body,
            'Selected sentence. <span data-cc-font="serif">Neighbor sentence.</span>',
        )
    for after in [
        "\\Selected sentence.",
        "`Selected sentence.`",
        "Selected\n\nsentence.",
    ]:
        with pytest.raises(ValueError):
            require_style_run_edit(body, start, "Selected sentence.", after)
    with pytest.raises(ValueError):
        require_style_run_edit(body, 0, "", "\\")


def test_multi_paragraph_formatting_preserves_breaks_with_balanced_wrappers():
    assert (
        format_selection(
            "First paragraph.\n\nSecond paragraph.", SelectionFormatting(font="mono")
        )
        == '<span data-cc-font="mono">First paragraph.</span>\n\n<span data-cc-font="mono">Second paragraph.</span>'
    )


async def selection_service(workspace, body):
    _points, run, factory = workspace
    await create_source_tables(factory)
    await add_chapters(factory)
    async with factory() as session, session.begin():
        chapter = await session.scalar(
            select(ConceptNoteChapter).where(
                ConceptNoteChapter.template_section_id == "summary"
            )
        )
        revision = await session.scalar(
            select(ConceptNoteChapterRevision).where(
                ConceptNoteChapterRevision.chapter_id == chapter.chapter_id
            )
        )
        revision.body_markdown = body
        chapter_id = chapter.chapter_id
    repository = ConceptNoteWorkspaceRepository(
        factory, workflow_session_factory=factory
    )
    planner = SimpleNamespace(plan=AsyncMock())
    service = ConceptNoteEditService(
        ConceptNoteEditRepository(factory),
        repository,
        planner,
        workflow_sessions=factory,
    )
    scope = scope_for(body, "Chosen sentence.").model_copy(
        update={"chapter_id": chapter_id, "base_revision": 1}
    )
    return service, run, factory, scope


async def test_deterministic_format_propose_apply_reload_keeps_other_chapter_and_provenance(
    workspace, monkeypatch
):
    body = "## Summary\n\n😀 Outside. Before sentence. Chosen sentence. After sentence. Last outside."
    service, run, _factory, scope = await selection_service(workspace, body)
    before = await service.workspace.list_chapters(run_id=run.run_id)
    request = EditProposalRequest(
        instruction="Format selected text",
        scope=scope,
        formatting=SelectionFormatting(font="serif", bold=True, italic=True),
        idempotency_key=uuid4(),
    )
    proposal = await service._propose(run, request, recent_messages=None)
    assert proposal.status == "proposed" and proposal.selection_window is not None
    service.planner.plan.assert_not_awaited()
    assert proposal.base_revisions == {scope.chapter_id: 1}
    assert (await service.workspace.list_chapters(run_id=run.run_id))[
        0
    ].body_markdown == before[0].body_markdown
    monkeypatch.setattr("app.persistence.concept_notes.edits.lock_run", AsyncMock())
    await service.repository.apply(
        run_id=run.run_id,
        user_id="owner",
        proposal_id=proposal.proposal_id,
        request=EditApplyRequest(
            idempotency_key=uuid4(), expected_revisions=proposal.base_revisions
        ),
    )
    after = await service.workspace.list_chapters(run_id=run.run_id)
    target = next(
        chapter for chapter in after if chapter.chapter_id == scope.chapter_id
    )
    assert target.body_markdown == body.replace(
        "Chosen sentence.",
        '<span data-cc-font="serif" data-cc-bold="true" data-cc-italic="true">Chosen sentence.</span>',
    )
    assert (
        target.source_provenance
        == next(
            chapter for chapter in before if chapter.chapter_id == scope.chapter_id
        ).source_provenance
    )
    assert (
        next(
            chapter for chapter in after if chapter.chapter_id != scope.chapter_id
        ).body_markdown
        == next(
            chapter for chapter in before if chapter.chapter_id != scope.chapter_id
        ).body_markdown
    )
    assert await service._propose(
        run, request, recent_messages=None
    ) == await service.repository.get(
        run_id=run.run_id, user_id="owner", proposal_id=proposal.proposal_id
    )


async def test_stale_selection_fails_before_provider_or_proposal_creation(workspace):
    service, run, factory, scope = await selection_service(
        workspace, "Before sentence. Chosen sentence. After sentence."
    )
    request = EditProposalRequest(
        instruction="Shorten",
        scope=scope.model_copy(update={"base_revision": 2}),
        idempotency_key=uuid4(),
    )
    with pytest.raises(EditOperationError) as caught:
        await service._propose(run, request, recent_messages=None)
    assert caught.value.status_code == 409
    service.planner.plan.assert_not_awaited()
    async with factory() as session:
        assert not list(await session.scalars(select(ConceptNoteEditProposal)))


async def test_ai_can_edit_both_neighbors_but_not_second_neighbor_or_other_chapter(
    workspace, monkeypatch
):
    body = (
        "First outside. Before sentence. Chosen sentence. After sentence. Last outside."
    )
    service, run, _factory, scope = await selection_service(workspace, body)
    snapshots = await service.workspace.list_chapters(run_id=run.run_id)
    request = EditProposalRequest(
        instruction="Improve these sentences", scope=scope, idempotency_key=uuid4()
    )
    changes = [
        PlannedTextChange(
            chapter_id=scope.chapter_id,
            start=body.index(old),
            before=old,
            after=new,
            kind="wording",
            group_id="selection",
            semantic_support="preserved",
        )
        for old, new in [
            ("Before sentence.", "Earlier sentence."),
            ("Chosen sentence.", "Clear sentence."),
            ("After sentence.", "Following sentence."),
        ]
    ]
    service.planner.plan.return_value = EditPlanOutput(intent="edit", changes=changes)
    proposal = await service._propose(run, request, recent_messages=None)
    assert proposal.status == "proposed" and len(proposal.changes) == 3
    for old, chapter_id in [
        ("First outside.", scope.chapter_id),
        ("Last outside.", scope.chapter_id),
        (
            "Old amount.",
            next(
                chapter.chapter_id
                for chapter in snapshots
                if chapter.chapter_id != scope.chapter_id
            ),
        ),
    ]:
        chapter_body = next(
            chapter.body_markdown
            for chapter in snapshots
            if chapter.chapter_id == chapter_id
        )
        bad = PlannedTextChange(
            chapter_id=chapter_id,
            start=chapter_body.index(old),
            before=old,
            after="Changed outside.",
            kind="wording",
            group_id="bad",
            semantic_support="preserved",
        )
        with pytest.raises(
            EditOperationError, match="selected-text edit|selected chapter revision"
        ):
            validate_edit_plan(
                request, snapshots, EditPlanOutput(intent="edit", changes=[bad])
            )
    monkeypatch.setattr("app.persistence.concept_notes.edits.lock_run", AsyncMock())
    await service.repository.apply(
        run_id=run.run_id,
        user_id="owner",
        proposal_id=proposal.proposal_id,
        request=EditApplyRequest(
            idempotency_key=uuid4(), expected_revisions=proposal.base_revisions
        ),
    )
    target = next(
        chapter
        for chapter in await service.workspace.list_chapters(run_id=run.run_id)
        if chapter.chapter_id == scope.chapter_id
    )
    assert target.body_markdown.startswith(
        "First outside. "
    ) and target.body_markdown.endswith("Last outside.")
    assert (
        "Earlier sentence. Clear sentence. Following sentence." in target.body_markdown
    )


async def test_apply_rechecks_scope_when_a_saved_plan_is_outside_window(
    workspace, monkeypatch
):
    body = (
        "First outside. Before sentence. Chosen sentence. After sentence. Last outside."
    )
    service, run, factory, scope = await selection_service(workspace, body)
    change = EditChange(
        chapter_id=scope.chapter_id,
        chapter_title="Summary",
        change_id=uuid4(),
        base_revision=1,
        start=0,
        before="First outside.",
        after="Unsafe outside.",
        kind="wording",
        group_id="bad",
    )
    proposal_id = uuid4()
    async with factory() as session, session.begin():
        session.add(
            ConceptNoteEditProposal(
                proposal_id=proposal_id,
                run_id=run.run_id,
                actor_user_id="owner",
                idempotency_key=uuid4(),
                request_fingerprint="a" * 64,
                instruction="Tampered controlled plan",
                scope=scope.model_dump(mode="json"),
                base_revisions={str(scope.chapter_id): 1},
                changes=[change.model_dump(mode="json")],
                notices=[],
                status="proposed",
            )
        )
    monkeypatch.setattr("app.persistence.concept_notes.edits.lock_run", AsyncMock())
    with pytest.raises(
        EditOperationError, match="outside its permitted sentence window"
    ):
        await service.repository.apply(
            run_id=run.run_id,
            user_id="owner",
            proposal_id=proposal_id,
            request=EditApplyRequest(
                idempotency_key=uuid4(), expected_revisions={scope.chapter_id: 1}
            ),
        )
    assert (
        next(
            chapter
            for chapter in await service.workspace.list_chapters(run_id=run.run_id)
            if chapter.chapter_id == scope.chapter_id
        ).body_markdown
        == body
    )


async def test_ai_wording_preserves_nested_font_and_emphasis_in_real_apply(
    workspace, monkeypatch
):
    body = 'Outside. Before sentence. <span data-cc-font="serif"><span data-cc-italic="true">**Chosen sentence.**</span></span> After sentence. Last.'
    service, run, _factory, scope = await selection_service(workspace, body)
    chapters = await service.workspace.list_chapters(run_id=run.run_id)
    target = next(
        chapter for chapter in chapters if chapter.chapter_id == scope.chapter_id
    )
    request = EditProposalRequest(
        instruction="Use simpler wording", scope=scope, idempotency_key=uuid4()
    )
    payload = build_planner_input(request, target, {})
    assert payload["selection"]["selected_markdown"] == "Chosen sentence."
    assert 'data-cc-font="serif"' in payload["chapter"]["body_markdown"]
    assert payload["formatting"]["preserve_existing"] is True
    service.planner.plan.return_value = EditPlanOutput(
        intent="edit",
        changes=[
            PlannedTextChange(
                chapter_id=scope.chapter_id,
                start=scope.start,
                before="Chosen sentence.",
                after="Clear sentence.",
                kind="wording",
                group_id="inner_prose",
                semantic_support="preserved",
            )
        ],
    )
    proposal = await service._propose(run, request, recent_messages=None)
    assert proposal.status == "proposed"
    monkeypatch.setattr("app.persistence.concept_notes.edits.lock_run", AsyncMock())
    await service.repository.apply(
        run_id=run.run_id,
        user_id="owner",
        proposal_id=proposal.proposal_id,
        request=EditApplyRequest(
            idempotency_key=uuid4(), expected_revisions=proposal.base_revisions
        ),
    )
    after = next(
        chapter
        for chapter in await service.workspace.list_chapters(run_id=run.run_id)
        if chapter.chapter_id == scope.chapter_id
    )
    assert after.body_markdown == body.replace("Chosen sentence.", "Clear sentence.")


@pytest.mark.parametrize("style", ["span", "markdown"])
async def test_style_relocation_is_rejected_in_planning_and_final_apply(
    workspace, monkeypatch, style
):
    body = (
        '<span data-cc-font="serif">Chosen sentence.</span> Neighbor sentence.'
        if style == "span"
        else "**Chosen sentence.** Neighbor sentence."
    )
    moved = (
        'Chosen sentence. <span data-cc-font="serif">Neighbor sentence.</span>'
        if style == "span"
        else "Chosen sentence. **Neighbor sentence.**"
    )
    service, run, factory, scope = await selection_service(workspace, body)
    snapshots = await service.workspace.list_chapters(run_id=run.run_id)
    planned = PlannedTextChange(
        chapter_id=scope.chapter_id,
        start=0,
        before=body,
        after=moved,
        kind="wording",
        group_id="bad",
        semantic_support="preserved",
    )
    request = EditProposalRequest(
        instruction="Simplify wording", scope=scope, idempotency_key=uuid4()
    )
    with pytest.raises(EditOperationError, match="formatting markers in place"):
        validate_edit_plan(
            request, snapshots, EditPlanOutput(intent="edit", changes=[planned])
        )
    change = EditChange(
        **planned.model_dump(),
        chapter_title="Summary",
        change_id=uuid4(),
        base_revision=1,
    )
    proposal_id = uuid4()
    async with factory() as session, session.begin():
        session.add(
            ConceptNoteEditProposal(
                proposal_id=proposal_id,
                run_id=run.run_id,
                actor_user_id="owner",
                idempotency_key=uuid4(),
                request_fingerprint="a" * 64,
                instruction="Controlled bypass probe",
                scope=scope.model_dump(mode="json"),
                base_revisions={str(scope.chapter_id): 1},
                changes=[change.model_dump(mode="json")],
                notices=[],
                status="proposed",
            )
        )
    monkeypatch.setattr("app.persistence.concept_notes.edits.lock_run", AsyncMock())
    with pytest.raises(EditOperationError, match="formatting markers in place"):
        await service.repository.apply(
            run_id=run.run_id,
            user_id="owner",
            proposal_id=proposal_id,
            request=EditApplyRequest(
                idempotency_key=uuid4(), expected_revisions={scope.chapter_id: 1}
            ),
        )
