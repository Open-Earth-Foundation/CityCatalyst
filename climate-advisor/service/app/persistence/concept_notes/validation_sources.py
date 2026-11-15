"""Live CA grounding scoped to exact server-captured chapter/point source identities."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.cnb.concept_note_markdown import source_format_from_filename
from app.models.db.concept_note import (
    ConceptNoteContextBundle,
    ConceptNoteRun,
    ConceptNoteUpload,
)
from app.persistence.concept_notes.context_bundle import normalize_bundle
from app.persistence.concept_notes.source_provenance import merge_provenance


@dataclass(frozen=True)
class ValidationSourceSnapshot:
    """One detached CA read reused for every chapter in a CNB projection."""

    status: str
    owner_id: str | None = None
    mode: str | None = None
    selected: dict[str, Any] = field(default_factory=dict)
    documents: dict[str, Any] = field(default_factory=dict)
    uploads: dict[str, dict[str, Any]] = field(default_factory=dict)


@dataclass(frozen=True)
class ValidationSourceAuthority:
    """Exact model-visible authority plus a versioned, private freshness contract."""

    status: str
    identities: list[dict[str, str]]
    documents: list[dict[str, Any]]

    @property
    def ready(self) -> bool:
        return self.status in {"source_free", "full_text"}

    def fingerprint_input(self) -> dict[str, Any]:
        text = json.dumps(
            self.documents, sort_keys=True, ensure_ascii=False, separators=(",", ":")
        )
        return {
            "version": 1,
            "status": self.status,
            "identities": self.identities,
            "text_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        }


async def load_validation_source_snapshot(
    workflow_session_factory: async_sessionmaker[AsyncSession] | None,
    run_id: UUID,
) -> ValidationSourceSnapshot:
    """Read the explicitly composed CA store; unavailable never means source-free."""
    if workflow_session_factory is None:
        return ValidationSourceSnapshot(status="unavailable")
    try:
        async with workflow_session_factory() as session:
            run = await session.get(ConceptNoteRun, run_id)
            if run is None:
                return ValidationSourceSnapshot(status="missing_run")
            row = await session.get(ConceptNoteContextBundle, run_id)
            bundle = normalize_bundle(row.context_bundle if row else None)
            uploads = list(
                await session.scalars(
                    select(ConceptNoteUpload).where(ConceptNoteUpload.run_id == run_id)
                )
            )
            return ValidationSourceSnapshot(
                status="loaded",
                owner_id=run.user_id,
                mode=bundle.source_text.mode if bundle.source_text else None,
                selected={
                    str(source.upload_id): source for source in bundle.selected_sources
                },
                documents={
                    str(document.upload_id): document
                    for document in bundle.source_text.documents
                }
                if bundle.source_text
                else {},
                uploads={
                    str(upload.upload_id): {
                        "owner_id": upload.uploaded_by_user_id,
                        "status": upload.ingest_status,
                        "sha256": upload.markdown_sha256,
                        "filename": upload.filename,
                    }
                    for upload in uploads
                },
            )
    except (OSError, SQLAlchemyError, ValueError):
        return ValidationSourceSnapshot(status="unavailable")


def resolve_validation_source_authority(
    provenance: dict[str, Any] | None,
    snapshot: ValidationSourceSnapshot,
) -> ValidationSourceAuthority:
    """Match identity, owner and immutable digest before removing private IDs."""
    captured = merge_provenance(provenance)
    identities = captured["identities"]

    def unavailable(status: str) -> ValidationSourceAuthority:
        return ValidationSourceAuthority(
            status=status, identities=identities, documents=[]
        )

    if not captured["complete"]:
        return unavailable("unknown")
    if not identities:
        return unavailable("source_free")
    if snapshot.status != "loaded":
        return unavailable(snapshot.status)
    if snapshot.mode != "full_text":
        return unavailable("summary" if snapshot.mode == "summary" else "missing_text")
    documents = []
    for identity in identities:
        upload_id = identity["upload_id"]
        source = snapshot.selected.get(upload_id)
        document = snapshot.documents.get(upload_id)
        upload = snapshot.uploads.get(upload_id)
        if source is None or document is None or upload is None:
            return unavailable("missing_source")
        if upload["owner_id"] != snapshot.owner_id:
            return unavailable("owner_mismatch")
        if (
            source.sha256 != identity["sha256"]
            or upload["sha256"] != identity["sha256"]
        ):
            return unavailable("digest_mismatch")
        try:
            actual_format = source_format_from_filename(upload["filename"])
        except ValueError:
            return unavailable("metadata_mismatch")
        if (
            upload["status"] != "ready"
            or document.filename != source.filename
            or document.filename != upload["filename"]
            or document.source_label != source.source_label
            or document.source_format != source.source_format
            or document.source_format != actual_format
        ):
            return unavailable("metadata_mismatch")
        if not document.text.strip():
            return unavailable("missing_text")
        documents.append(document.model_dump(mode="json", exclude={"upload_id"}))
    return ValidationSourceAuthority(
        status="full_text", identities=identities, documents=documents
    )
