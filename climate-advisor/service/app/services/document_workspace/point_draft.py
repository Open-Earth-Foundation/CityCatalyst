"""Render point-backed application fields and revise only the affected passage."""

from __future__ import annotations

import re
from dataclasses import dataclass
from hashlib import sha256
from typing import Any
from uuid import UUID

from app.models.cnb.concept_note_draft import (
    ConceptNoteChapterDraftOutput,
    ConceptNoteDraftGapOutput,
)
from app.models.db.document_workspace import DocumentNeed, DocumentWorkspaceState
from app.persistence.concept_notes.source_provenance import (
    PROVENANCE_KEY,
    merge_provenance,
    sources_provenance,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker


async def point_draft_readiness(
    sessions: async_sessionmaker[AsyncSession], run_id: UUID
) -> tuple[bool, bool]:
    """Return whether a registered setup is pinned and has a fully read file."""
    async with sessions() as session:
        state = await session.get(DocumentWorkspaceState, run_id)
        setup = state.setup if state and state.setup else {}
        if setup.get("document_type") in {None, "concept_note"}:
            return False, False
        groups = await session.scalars(
            select(DocumentNeed.documents).where(
                DocumentNeed.run_id == run_id, DocumentNeed.active.is_(True)
            )
        )
        return True, bool(setup.get("ready")) and any(
            document.get("ready") is True
            for documents in groups
            for document in documents
        )


def _literal(value: Any) -> str:
    """Keep user and source text literal inside a Markdown form field."""
    return re.sub(r"([\\`*_{}\[\]<>#!|])", r"\\\1", str(value)).strip()


def _heading(label: str) -> str:
    return "#### " + _literal(" ".join(label.split()))


def _render_field(
    point: dict[str, Any],
) -> tuple[str, ConceptNoteDraftGapOutput | None]:
    label = point["label"]
    heading = _heading(label)
    status = point["status"]
    task = point.get("task") or {}
    if status == "missing":
        question = f"What should the application state for {label.rstrip('?')}?"
        gap = ConceptNoteDraftGapOutput(
            field_key=point["key"],
            question=question,
            why_asking=point["description"] or label,
            severity="critical" if point["required"] else "noncritical",
        )
        parked = {"parked": "Parked", "waiting": "Waiting for evidence"}.get(
            task.get("status")
        )
        body = f"[Information needed: {question}]"
        if parked:
            body = f"**{parked}.** {body}"
        return f"{heading}\n\n{body}", gap

    if status == "not_applicable":
        answer = f"**Not applicable.** {_literal(point.get('reason') or '')}"
    else:
        value = point["value"]
        formatted = (
            format(value, ",")
            if isinstance(value, (int, float)) and not isinstance(value, bool)
            else value
        )
        answer = _literal(formatted)
        if point.get("unit"):
            answer += " " + _literal(point["unit"])
        if status == "assumption":
            answer = (
                f"**Assumption.** {answer}\n\n{_literal(point.get('reason') or '')}"
            )
    sources = []
    for citation in point.get("citations", []):
        reference = _literal(citation["source_label"])
        if citation.get("page_number") is not None:
            reference += f", p. {citation['page_number']}"
        elif citation.get("source_anchor"):
            reference += f", {_literal(citation['source_anchor'])}"
        if reference not in sources:
            sources.append(reference)
    source_note = (
        "Source: " + "; ".join(sources) if sources else "Source: city team decision"
    )
    return f"{heading}\n\n{answer}\n\n_{source_note}_", None


@dataclass
class PointDraft:
    output: ConceptNoteChapterDraftOutput
    passages: dict[str, dict[str, str]]
    provenance: dict[str, Any]
    # Exact replacement span for a protected passage proposal.
    change: tuple[int, str, str] | None = None
    needs_review: bool = False


def draft_from_points(
    points: list[dict[str, Any]], section: dict[str, Any]
) -> PointDraft:
    """Compose the real application in pinned form order using accepted facts only."""
    selected = [p for p in points if section["chapter_ref"] in p["chapter_refs"]]
    order = {
        (field.get("semantic_key") or field.get("key")): index
        for index, field in enumerate(section.get("required_fields", []))
        if isinstance(field, dict)
    }
    selected.sort(key=lambda point: order.get(point["key"], len(order)))
    bodies, gaps, passages = [], [], {}
    for point in selected:
        text, gap = _render_field(point)
        bodies.append(text)
        passages[point["key"]] = {
            "heading": _heading(point["label"]),
            "digest": sha256(text.encode()).hexdigest(),
        }
        if gap:
            gaps.append(gap)
    return PointDraft(
        output=ConceptNoteChapterDraftOutput(
            body_markdown="\n\n".join(bodies)
            or "No application fields are configured for this section.",
            missing_information=gaps,
        ),
        passages=passages,
        provenance=merge_provenance(
            sources_provenance([]), *(point[PROVENANCE_KEY] for point in selected)
        ),
    )


def revise_point_passage(chapter: Any, point: dict[str, Any]) -> PointDraft:
    """Replace one recorded field, preserving every character outside its boundary.

    If a person removed or renamed the section anchor, propose a new field at
    the end. Applying such a change always requires their explicit review.
    """
    body = chapter.body_markdown
    passages = dict(chapter.point_passages)
    previous = passages.get(point["key"], {})
    heading = previous.get("heading", _heading(point["label"]))
    headings = list(re.finditer(r"^#### [^\n]+$", body, flags=re.MULTILINE))
    matches = [i for i, match in enumerate(headings) if match.group() == heading]
    replacement, gap = _render_field(point)
    original_body = body
    old_gap = next((g for g in chapter.gaps if g.field_key == point["key"]), None)
    if len(matches) == 1:
        index = matches[0]
        start = headings[index].start()
        boundary = (
            headings[index + 1].start() if index + 1 < len(headings) else len(body)
        )
        before = body[start:boundary].rstrip()
        after = replacement
    elif old_gap and body.count(f"[Information needed: {old_gap.question}]") == 1:
        # A renamed field can still be located by its recorded, unique gap.
        # Keep the officer's heading and propose replacing only the marker.
        before = f"[Information needed: {old_gap.question}]"
        start = body.index(before)
        after = replacement.split("\n\n", 1)[1]
    else:
        # Proposals use a nonempty anchor. The last character is retained.
        start, before, after = len(body) - 1, body[-1], body[-1] + "\n\n" + replacement
    body = body[:start] + after + body[start + len(before) :]
    # Retain existing gaps outside the edited point so marker parity is exact.
    gaps = [
        ConceptNoteDraftGapOutput(
            field_key=g.field_key,
            question=g.question,
            why_asking=g.why_asking,
            severity=g.severity,
            suggestions=g.suggestions or [],
        )
        for g in chapter.gaps
        if f"[Information needed: {g.question}]" in body
        and (not gap or g.field_key != gap.field_key)
    ]
    if gap:
        gaps.append(gap)
    passages[point["key"]] = {
        "heading": _heading(point["label"]),
        "digest": sha256(replacement.encode()).hexdigest(),
    }
    return PointDraft(
        output=ConceptNoteChapterDraftOutput(
            body_markdown=body, missing_information=gaps
        ),
        passages=passages,
        provenance=merge_provenance(chapter.source_provenance, point[PROVENANCE_KEY]),
        change=(start, before, after) if body != original_body else None,
        needs_review=len(matches) != 1
        or previous.get("digest") != sha256(before.encode()).hexdigest(),
    )
