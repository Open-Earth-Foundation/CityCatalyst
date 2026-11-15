"""Accepted authority survives independent waiting-task and workflow notes."""

from uuid import uuid4

import pytest

from app.models.document_workspace.contracts import (
    DocumentExportRequest,
    DocumentPointCommand,
)
from app.persistence.concept_notes.workspace_validation import _load_validation_points
from app.services.document_workspace.jobs import point_context
from app.utils.document_point_values import accepted_point_reason
from tests.cnb.test_document_workspace import template
from tests.cnb.test_document_workspace import workspace as workspace  # noqa: PLC0414 - pytest fixture


@pytest.mark.parametrize("command", ["answer", "assume", "not_applicable"])
async def test_accepted_basis_survives_park_and_resume_without_using_workflow_notes(
    workspace, command
):
    service, run, factory = workspace
    configured = template(allow_assumption=True)
    for chapter in configured.chapter_schema:
        chapter["required_fields"][0]["allow_not_applicable"] = True
    run.custom_template["chapter_schema"] = configured.chapter_schema
    await service.reconcile_template(run, configured)
    point = (await service.load(run)).points[0]
    basis = "Confirmed by the finance director on the review date."
    accepted = await service.command(
        run,
        point.key,
        DocumentPointCommand(
            command=command,
            expected_version=point.version,
            idempotency_key=str(uuid4()),
            value=None if command == "not_applicable" else 125000,
            reason=basis if command != "answer" else None,
            note=basis if command == "answer" else None,
        ),
        user_id="owner",
    )
    assert accepted.point.accepted_reason == basis
    current = accepted.point
    for operation, workflow_note in (
        ("park", "Waiting for another document"),
        ("resume", "Workflow follow-up only"),
    ):
        result = await service.command(
            run,
            point.key,
            DocumentPointCommand(
                command=operation,
                expected_version=current.version,
                idempotency_key=str(uuid4()),
                waiting_for="Treasurer" if operation == "park" else None,
                note=workflow_note,
            ),
            user_id="owner",
        )
        current = result.point
        assert current.task.note == workflow_note
        assert current.accepted_reason == basis
        [canonical] = await point_context(service, run.run_id)
        assert canonical["reason"] == basis
        async with factory() as session:
            [validation_point] = await _load_validation_points(session, run.run_id)
        assert validation_point["reason"] == basis
        if command != "answer":
            export = await service.export(
                run,
                DocumentExportRequest(
                    mode="working", expected_revision=result.workspace_revision
                ),
            )
            assert (
                basis in export.body_markdown
                and workflow_note not in export.body_markdown
            )


def test_older_accepted_snapshot_note_is_read_from_the_immutable_snapshot():
    assert (
        accepted_point_reason(
            {"reason": None, "task": {"note": "Original accepted basis"}}
        )
        == "Original accepted basis"
    )
    assert accepted_point_reason(None) is None
