"""Durable source-revalidation jobs stored on the Concept Note run.

A job lives in ``ConceptNoteRun.context_summary["source_revalidation"]`` so it
is written in the same transaction as the context bundle that queued it and
survives restarts. States: ``pending`` (claimable), ``running`` (leased by one
worker), and ``failed`` (attempts exhausted until a new source re-queues it).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.models.db.concept_note import ConceptNoteRun
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

logger = logging.getLogger(__name__)

SOURCE_REVALIDATION_KEY = "source_revalidation"
SOURCE_REVALIDATION_MAX_ATTEMPTS = 3


@dataclass(frozen=True)
class SourceRevalidationClaim:
    """One leased job: the run owner and the uploads to revalidate."""

    run_id: UUID
    user_id: str
    upload_ids: list[UUID]


def queue_source_revalidation(summary: Any, upload_ids: list[UUID]) -> dict[str, Any]:
    """Return a run summary whose revalidation job also covers ``upload_ids``.

    A running job keeps its lease and picks up the added uploads when it
    finishes; any other job becomes pending with a fresh attempt budget.
    """
    job = _revalidation_job(summary)
    queued = _merge_upload_ids(job.get("upload_ids"), upload_ids)
    if job.get("status") == "running":
        next_job = {**job, "upload_ids": queued}
    else:
        next_job = {"status": "pending", "upload_ids": queued, "attempts": 0}
    return _replace_revalidation_job(summary, next_job)


async def claim_source_revalidation(
    *,
    session_factory: async_sessionmaker[AsyncSession],
    run_id: UUID,
) -> SourceRevalidationClaim | None:
    """Lease a pending job for one worker, or return None when none is claimable."""
    async with session_factory() as session, session.begin():
        run = await session.get(ConceptNoteRun, run_id, with_for_update=True)
        if run is None:
            return None
        job = _revalidation_job(run.context_summary)
        if job.get("status") != "pending" or not job.get("upload_ids"):
            return None
        run.context_summary = _replace_revalidation_job(
            run.context_summary,
            {
                **job,
                "status": "running",
                "attempts": int(job.get("attempts") or 0) + 1,
                "started_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        return SourceRevalidationClaim(
            run_id=run_id,
            user_id=run.user_id,
            upload_ids=[UUID(value) for value in job["upload_ids"]],
        )


async def finish_source_revalidation(
    *,
    session_factory: async_sessionmaker[AsyncSession],
    run_id: UUID,
    upload_ids: list[UUID],
    succeeded: bool,
) -> None:
    """Release a lease: clear finished uploads, or keep the job retryable."""
    async with session_factory() as session, session.begin():
        run = await session.get(ConceptNoteRun, run_id, with_for_update=True)
        if run is None:
            return
        job = _revalidation_job(run.context_summary)
        if job.get("status") != "running":
            return
        attempts = int(job.get("attempts") or 0)

        # Success removes the processed uploads; uploads queued meanwhile stay.
        if succeeded:
            processed = {str(value) for value in upload_ids}
            remaining = [
                value for value in job.get("upload_ids", []) if value not in processed
            ]
            next_job = (
                {"status": "pending", "upload_ids": remaining, "attempts": 0}
                if remaining
                else None
            )
        # Failure keeps every upload and retries until attempts run out.
        else:
            exhausted = attempts >= SOURCE_REVALIDATION_MAX_ATTEMPTS
            next_job = {
                "status": "failed" if exhausted else "pending",
                "upload_ids": job.get("upload_ids", []),
                "attempts": attempts,
            }
            if exhausted:
                logger.warning(
                    "Concept Note source revalidation gave up run_id=%s attempts=%s",
                    run_id,
                    attempts,
                )
        run.context_summary = _replace_revalidation_job(run.context_summary, next_job)


async def recover_stale_source_revalidations(
    *,
    session_factory: async_sessionmaker[AsyncSession],
    stale_before: datetime,
) -> int:
    """Return interrupted running jobs to pending once their lease is stale."""
    async with session_factory() as session, session.begin():
        runs = list(
            (
                await session.scalars(
                    select(ConceptNoteRun)
                    .where(_job_status_is("running"))
                    .with_for_update(skip_locked=True)
                )
            ).all()
        )
        recovered = 0
        for run in runs:
            job = _revalidation_job(run.context_summary)
            started_at = _parse_timestamp(job.get("started_at"))
            if job.get("status") != "running" or (
                started_at is not None and started_at >= stale_before
            ):
                continue
            run.context_summary = _replace_revalidation_job(
                run.context_summary, {**job, "status": "pending"}
            )
            recovered += 1
        return recovered


async def list_pending_source_revalidations(
    *,
    session_factory: async_sessionmaker[AsyncSession],
) -> list[UUID]:
    """Return active runs whose revalidation job is waiting for a worker."""
    async with session_factory() as session:
        return list(
            (
                await session.scalars(
                    select(ConceptNoteRun.run_id).where(
                        ConceptNoteRun.status == "active",
                        _job_status_is("pending"),
                    )
                )
            ).all()
        )


def _job_status_is(status: str) -> Any:
    """Build a JSON-path filter on the persisted job status."""
    return (
        ConceptNoteRun.context_summary[SOURCE_REVALIDATION_KEY]["status"].as_string()
        == status
    )


def _revalidation_job(summary: Any) -> dict[str, Any]:
    """Read the nested job object defensively."""
    if not isinstance(summary, dict):
        return {}
    job = summary.get(SOURCE_REVALIDATION_KEY)
    return job if isinstance(job, dict) else {}


def _replace_revalidation_job(
    summary: Any,
    job: dict[str, Any] | None,
) -> dict[str, Any]:
    """Replace or remove only the job and preserve unrelated run metadata."""
    updated = dict(summary) if isinstance(summary, dict) else {}
    if job is None:
        updated.pop(SOURCE_REVALIDATION_KEY, None)
    else:
        updated[SOURCE_REVALIDATION_KEY] = job
    return updated


def _merge_upload_ids(existing: Any, added: list[UUID]) -> list[str]:
    """Union upload identifiers in stable first-seen order."""
    merged = [str(value) for value in existing] if isinstance(existing, list) else []
    for value in added:
        if str(value) not in merged:
            merged.append(str(value))
    return merged


def _parse_timestamp(value: Any) -> datetime | None:
    """Parse a stored ISO timestamp, treating naive values as UTC."""
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
