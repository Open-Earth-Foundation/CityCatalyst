from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from app.models.db.stationary_energy_draft import StationaryEnergyDraftSourceCandidate
from app.models.stationary_energy_drafts import (
    LoadStationaryEnergyContextResponse,
    StationaryEnergySourceCandidate,
    StoredSourceCandidate,
    StoredSourceScope,
)
from app.utils.token_manager import LogSafeFormatter


logger = logging.getLogger(__name__)


def context_summary_with_error(
    existing: dict[str, Any] | None,
    *,
    failed_step: str,
    exc: Exception,
    trace_id: str | None,
) -> dict[str, Any]:
    """Merge a redacted error summary into an existing draft context summary."""
    context_summary = dict(existing or {})
    safe_message = LogSafeFormatter.redact_tokens(str(exc))[:500]
    context_summary["error_summary"] = {
        "failed_step": failed_step,
        "error_type": type(exc).__name__,
        "message": safe_message,
        "trace_id": trace_id,
        "failed_at": datetime.now(timezone.utc).isoformat(),
    }
    context_summary["attempt_count"] = (
        int(context_summary.get("attempt_count") or 0) + 1
    )
    return context_summary


def source_candidate_records(
    draft_run_id: UUID,
    candidates: list[StationaryEnergySourceCandidate],
) -> list[dict[str, Any]]:
    """Convert applicable context candidates into persisted draft candidate payloads."""
    records: list[dict[str, Any]] = []
    for candidate in candidates:
        if candidate.applicability_status != "applicable":
            continue

        candidate_json = candidate.model_dump(mode="json", exclude={"quality_score"})
        records.append(
            {
                "candidate_id": uuid4(),
                "datasource_id": candidate.datasource_id,
                "name": candidate.name,
                "publisher_name": candidate.publisher_name,
                "retrieval_method": candidate.retrieval_method,
                "dataset_name": candidate.dataset_name,
                "dataset_year": candidate.dataset_year,
                "url": candidate.url,
                "geography_match": candidate.geography_match,
                "source_scope": candidate.source_scope.model_dump(
                    mode="json",
                    exclude_none=True,
                ),
                "source_data": candidate_json.get("source_data"),
                "normalized_rows": candidate_json.get("normalized_rows") or [],
                "applicability_status": candidate.applicability_status,
                "applicability_issues": candidate.applicability_issues,
                "failure_reason": candidate.failure_reason,
                "quality_score": candidate.quality_score,
                "confidence_notes": candidate.confidence_notes,
            }
        )

    if not records:
        logger.info(
            "No Stationary Energy source candidates received for draft=%s",
            draft_run_id,
        )
    return records


def stored_source_candidate_payload_from_record(
    draft_run_id: UUID,
    candidate: dict[str, Any],
) -> dict[str, Any]:
    """Validate and serialize a stored source candidate payload built from raw data."""
    return StoredSourceCandidate.model_validate(
        {
            "draft_run_id": draft_run_id,
            **candidate,
        }
    ).model_dump(mode="json", exclude_none=True)


def stored_source_candidate_payload(
    candidate: StationaryEnergyDraftSourceCandidate,
) -> dict[str, Any]:
    """Serialize a persisted source candidate back into the API payload shape."""
    return StoredSourceCandidate(
        candidate_id=candidate.candidate_id,
        draft_run_id=candidate.draft_run_id,
        datasource_id=candidate.datasource_id,
        name=candidate.name,
        publisher_name=candidate.publisher_name,
        retrieval_method=candidate.retrieval_method,
        dataset_name=candidate.dataset_name,
        dataset_year=candidate.dataset_year,
        url=candidate.url,
        geography_match=candidate.geography_match,  # type: ignore[arg-type]
        source_scope=StoredSourceScope.model_validate(candidate.source_scope or {}),
        source_data=candidate.source_data,
        normalized_rows=candidate.normalized_rows or [],
        applicability_status=candidate.applicability_status,  # type: ignore[arg-type]
        applicability_issues=candidate.applicability_issues or [],
        failure_reason=candidate.failure_reason,
        quality_score=candidate.quality_score,
        confidence_notes=candidate.confidence_notes,
        created_at=candidate.created_at,
        updated_at=candidate.updated_at,
    ).model_dump(mode="json", exclude_none=True)


def context_summary(
    context: LoadStationaryEnergyContextResponse,
    allowed_capabilities: list[str],
    source_candidates_count: int,
) -> dict[str, Any]:
    """Build the stored draft context summary from the loaded Stationary Energy scope."""
    return {
        "city": context.city.model_dump(mode="json", exclude_none=True),
        "inventory": context.inventory.model_dump(mode="json", exclude_none=True),
        "taxonomy_count": len(context.taxonomy),
        "current_values_count": len(context.current_values),
        "source_candidates_count": source_candidates_count,
        "allowed_capabilities": allowed_capabilities,
        "guidance_context": context.guidance_context,
    }
