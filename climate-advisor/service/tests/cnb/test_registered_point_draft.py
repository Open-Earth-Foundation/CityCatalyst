"""EUCF draft readiness, accepted-only text, passage updates and numeric review."""

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from app.models.cnb.concept_note_chapter_validation import ChapterValidationPoint
from app.models.db.cnb_edit import ConceptNoteEditProposal
from app.models.db.cnb_workspace import ConceptNoteChapter, ConceptNoteChapterRevision
from app.models.db.concept_note import (
    ConceptNoteContextBundle,
    ConceptNoteRun,
    ConceptNoteUpload,
)
from app.models.db.document_workspace import DocumentNeed, DocumentUpdateJob
from app.models.document_workspace.contracts import DocumentPointCommand
from app.persistence.concept_notes.edits import append_revision
from app.persistence.concept_notes.source_provenance import sources_provenance
from app.services.cnb.chapter_drafting import (
    ChapterDraftingError,
    ConceptNoteChapterDraftService,
)
from app.services.document_workspace.catalogue import (
    setup_catalogue,
    template_from_setup,
)
from app.services.document_workspace.jobs import claim_job, run_update_job
from app.services.document_workspace.point_draft import (
    draft_from_points,
    revise_point_passage,
)
from sqlalchemy import select
from tests.cnb.chapter_validation_helpers import (
    request,
    static_passes,
)
from tests.cnb.chapter_validation_helpers import (
    service as validation_service,
)
from tests.cnb.test_document_workspace import workspace as workspace  # noqa: PLC0414
from tests.cnb.test_protected_proposal_gaps import apply_proposal


async def test_registered_grant_rejects_early_draft_then_builds_open_fields(
    workspace, monkeypatch
):
    points, run, factory = workspace
    setup = setup_catalogue()["eucf"]
    template = template_from_setup(setup)
    async with factory() as session, session.begin():
        connection = await session.connection()
        await connection.run_sync(
            ConceptNoteContextBundle.__table__.create, checkfirst=True
        )
        await connection.run_sync(ConceptNoteUpload.__table__.create, checkfirst=True)
        current = await session.get(ConceptNoteRun, run.run_id)
        current.context_summary = {
            "point_setup_template": template.model_dump(mode="json")
        }
        state = await points._state(session, run.run_id)
        await points._materialize(
            session, state, template, user_id=run.user_id, setup=setup
        )
    drafter = ConceptNoteChapterDraftService(factory, cnb_session_factory=factory)
    with pytest.raises(ChapterDraftingError, match="Read at least one file"):
        await drafter.start(run)
    async with factory() as session, session.begin():
        need = await session.scalar(select(DocumentNeed).limit(1))
        need.documents = [
            {
                "upload_id": str(uuid4()),
                "source_label": "Municipal evidence",
                "filename": "evidence.md",
                "source_format": "markdown",
                "ready": True,
            }
        ]
    _, build = await drafter.start(run)
    await drafter.draft_all(run_id=run.run_id, user_id=run.user_id, build_id=build)
    state = await drafter.load_state(run)
    assert state.status == "complete"
    assert [c.template_section_id for c in state.chapters] == [
        c["chapter_ref"] for c in template.chapter_schema
    ]
    first = state.chapters[0]
    assert set(first.point_passages) == {
        p["key"] for p in template.chapter_schema[0]["required_fields"]
    }
    assert all(gap.field_key in first.point_passages for gap in first.gaps)
    assert "Information needed" in first.body_markdown
    key = "applicant.name"

    async def correct(value):
        view = await points.load(run)
        point = next(p for p in view.points if p.key == key)
        await points.command(
            run,
            key,
            DocumentPointCommand(
                command="answer",
                expected_version=point.version,
                value=value,
                idempotency_key=str(uuid4()),
            ),
            user_id=run.user_id,
        )
        claim = await claim_job(points)
        await run_update_job(
            points, *claim, ca_session_factory=factory, draft_service=drafter
        )
        return claim[0]

    first_job = await correct("Krosno")
    updated = (await drafter.load_state(run)).chapters[0]
    assert "Krosno" in updated.body_markdown
    assert [gap.field_key for gap in updated.gaps if gap.state == "open"] == [
        gap.field_key for gap in first.gaps if gap.field_key != key
    ]
    async with factory() as session, session.begin():
        assert (await session.get(DocumentUpdateJob, first_job)).status == "complete"
        chapter = await session.get(ConceptNoteChapter, first.chapter_id)
        latest = await session.scalar(
            select(ConceptNoteChapterRevision)
            .where(ConceptNoteChapterRevision.chapter_id == first.chapter_id)
            .order_by(ConceptNoteChapterRevision.revision_number.desc())
            .limit(1)
        )
        await append_revision(
            session,
            chapter,
            latest,
            body=latest.body_markdown.replace("Krosno", "City of Krosno"),
            user_id=run.user_id,
            idempotency_key=uuid4(),
            preserve_ready=False,
            patch_summary={},
        )
    next_job = await correct("Gmina Miasto Krosno")
    protected = (await drafter.load_state(run)).chapters[0]
    assert (
        "City of Krosno" in protected.body_markdown
        and "Gmina" not in protected.body_markdown
    )
    async with factory() as session:
        assert (
            await session.get(DocumentUpdateJob, next_job)
        ).status == "pending_review"
        proposal = await session.scalar(select(ConceptNoteEditProposal))
        assert len(proposal.changes) == 1
        assert "Gmina Miasto Krosno" in proposal.changes[0]["after"]
        assert "Country" not in proposal.changes[0]["before"]
    # SQLite lacks the PostgreSQL advisory lock used by this edit endpoint.
    monkeypatch.setattr("app.persistence.concept_notes.edits.lock_run", AsyncMock())
    await apply_proposal(factory, run, proposal)
    approved = (await drafter.load_state(run)).chapters[0]
    assert approved.body_markdown == protected.body_markdown.replace(
        "City of Krosno", "Gmina Miasto Krosno"
    )
    async with factory() as session:
        assert (await session.get(DocumentUpdateJob, next_job)).status == "complete"


def test_review_preserves_neighbouring_manual_text_and_proposes_changed_field():
    common = {
        "description": "From the grant form",
        "required": True,
        "chapter_refs": ["identity"],
        "source_provenance": sources_provenance([]),
    }
    name = {
        **common,
        "key": "applicant.name",
        "label": "Name",
        "status": "answered",
        "value": "Krosno",
        "citations": [{"source_label": "Municipal plan", "page_number": 2}],
    }
    number = {
        **common,
        "key": "applicant.population",
        "label": "Population",
        "status": "missing",
        "task": {"status": "parked"},
        "value": 9999,
    }
    section = {
        "chapter_ref": "identity",
        "required_fields": [{"key": number["key"]}, {"key": name["key"]}],
    }
    built = draft_from_points([name, number], section)
    assert "9999" not in built.output.body_markdown
    assert "Parked" in built.output.body_markdown
    assert "Municipal plan, p. 2" in built.output.body_markdown
    original = built.output.body_markdown.replace(
        "Krosno", "City of Krosno (reviewed spelling)"
    )
    chapter = SimpleNamespace(
        body_markdown=original,
        point_passages=built.passages,
        gaps=built.output.missing_information,
        source_provenance=built.provenance,
    )
    update = revise_point_passage(
        chapter,
        {
            **number,
            "status": "assumption",
            "value": 44_000,
            "reason": "Planning estimate",
        },
    )
    assert update.needs_review is False
    assert "City of Krosno (reviewed spelling)" in update.output.body_markdown
    assert "Assumption" in update.output.body_markdown
    assert update.output.missing_information == []
    proposed = revise_point_passage(chapter, {**name, "value": "Gmina Miasto Krosno"})
    assert proposed.needs_review is True
    start, previous, replacement = proposed.change
    assert previous == original[start : start + len(previous)]
    assert "Population" not in previous and "Population" not in replacement
    assert "Municipal plan" in replacement


@pytest.mark.parametrize(
    ("renewable", "savings", "answer", "expected"),
    [(3, 3, "Yes", "ready"), (5, 3, "Yes", "incomplete")],
)
async def test_eucf_impact_rule_is_checked_even_if_model_passes(
    renewable, savings, answer, expected
):
    payload = request()
    rule = setup_catalogue()["eucf"]["rules"][0]
    payload.template.chapter_schema[0]["point_rules"] = [rule]
    payload.canonical_points = [
        ChapterValidationPoint(key=rule[key], label=key, status="answered", value=value)
        for key, value in (("left", renewable), ("right", savings), ("answer", answer))
    ]
    result = await validation_service(static_passes()).validate(payload)
    assert result.status == expected
    if expected == "incomplete":
        assert any(
            f.phase == "consistency" and rule["label"] in f.message
            for f in result.findings
        )
