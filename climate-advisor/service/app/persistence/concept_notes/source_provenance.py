"""Server-owned source authority captured with each exact chapter revision."""

from __future__ import annotations

import re
from typing import Any
from uuid import UUID

PROVENANCE_KEY = "source_provenance"
UNKNOWN_PROVENANCE_MESSAGE = (
    "Source provenance is unknown for existing chapter text. Create a new concept "
    "note and draft it from current inputs before final export; working export "
    "remains available with this caveat."
)


def merge_provenance(*snapshots: dict[str, Any] | None) -> dict[str, Any]:
    """Union authority snapshots without turning unknown legacy text into clean text."""
    complete = True
    identities: dict[tuple[str, str], dict[str, str]] = {}
    for snapshot in snapshots:
        if not isinstance(snapshot, dict) or snapshot.get("version") != 1:
            complete = False
            continue
        complete = complete and snapshot.get("complete") is True
        sources = snapshot.get("identities")
        if not isinstance(sources, list):
            complete = False
            continue
        for source in sources:
            try:
                upload_id = str(UUID(str(source["upload_id"])))
                digest = source["sha256"]
                if not isinstance(digest, str) or not re.fullmatch(
                    r"[0-9a-f]{64}", digest
                ):
                    raise ValueError("Invalid source digest")
            except (KeyError, TypeError, ValueError):
                complete = False
                continue
            identities[(upload_id, digest)] = {"upload_id": upload_id, "sha256": digest}
    return {
        "version": 1,
        "complete": complete,
        "identities": [identities[key] for key in sorted(identities)],
    }


def sources_provenance(sources: list[dict[str, Any]]) -> dict[str, Any]:
    """Capture an explicit source input set, including a genuinely source-free set."""
    return merge_provenance({"version": 1, "complete": True, "identities": sources})


def revision_provenance(revision: Any) -> dict[str, Any]:
    """Read metadata from an immutable revision; absent metadata remains unknown."""
    return merge_provenance(
        (revision.patch_summary or {}).get(PROVENANCE_KEY)
        if revision is not None
        else None
    )


def generation_provenance(
    run_context: dict[str, Any],
    chapters: list[Any],
    *,
    current: Any | None = None,
    extra_sources: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Capture exact source inputs and inherited bodies before model ID stripping.

    Chapter generation receives its current body and preceding bodies. Edit
    planning receives all chapters and calls this without a current chapter.
    """
    bundle = run_context.get("context_bundle", run_context)
    sources = list(bundle.get("selected_sources", []))
    sources.extend(extra_sources or [])
    inherited = [
        chapter.source_provenance
        for chapter in chapters
        if chapter.body_markdown is not None
        and (
            current is None
            or chapter.chapter_id == current.chapter_id
            or chapter.position < current.position
        )
    ]
    if current is None:
        inherited.extend(
            chapter.confirmed_source_provenance
            for chapter in chapters
            if chapter.confirmed_body_markdown is not None
        )
    point_inputs = [
        point.get(PROVENANCE_KEY)
        for point in run_context.get("document_workspace_points", [])
        if point.get("status") in {"answered", "assumption", "not_applicable"}
        and (current is None or current.chapter_ref in point.get("chapter_refs", []))
    ]
    return merge_provenance(sources_provenance(sources), *inherited, *point_inputs)
