from __future__ import annotations

import json
import re
from dataclasses import asdict, is_dataclass
from typing import Any
from uuid import UUID

from pydantic import ValidationError

from ..utils.stationary_energy_context import (
    stationary_energy_scope_identity,
    stationary_energy_scope_label,
    stationary_energy_scope_matches_target,
)
from .stationary_energy_llm_models import (
    StationaryEnergyLLMProposal,
    StationaryEnergyLLMResponse,
)


def parse_llm_output(raw_output: str) -> StationaryEnergyLLMResponse:
    """Parse raw LLM output text into the Stationary Energy response schema."""
    payload_text = extract_json_text(raw_output)
    try:
        payload = json.loads(payload_text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Stationary Energy LLM returned invalid JSON: {exc}") from exc

    try:
        return StationaryEnergyLLMResponse.model_validate(payload)
    except ValidationError as exc:
        raise ValueError(
            f"Stationary Energy LLM output failed schema validation: {exc}"
        ) from exc


def extract_json_text(raw_output: str) -> str:
    """Extract a JSON payload from plain or fenced LLM output."""
    raw_output = raw_output.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", raw_output, flags=re.DOTALL)
    if fenced:
        return fenced.group(1).strip()
    return raw_output


def parsed_output_from_result(
    result: Any,
    raw_output: str,
) -> StationaryEnergyLLMResponse:
    """Read the structured response from an agent run, with JSON fallback parsing."""
    try:
        final_output = result.final_output_as(
            StationaryEnergyLLMResponse,
            raise_if_incorrect_type=True,
        )
        return final_output
    except Exception:
        return parse_llm_output(raw_output)


def raw_output_from_result(result: Any) -> str:
    """Serialize the raw final output field from an agent run result."""
    final_output = getattr(result, "final_output", None)
    if hasattr(final_output, "model_dump_json"):
        return final_output.model_dump_json()
    if isinstance(final_output, str):
        return final_output
    return json.dumps(final_output, default=str, ensure_ascii=True)


def usage_from_result(result: Any) -> dict[str, Any] | None:
    """Aggregate usage metadata across raw agent responses."""
    usage: dict[str, Any] = {}
    for response in getattr(result, "raw_responses", []) or []:
        response_usage = serializable_model(getattr(response, "usage", None))
        if not response_usage:
            continue
        for key, value in response_usage.items():
            if isinstance(value, (int, float)):
                usage[key] = usage.get(key, 0) + value
            elif key not in usage:
                usage[key] = value
    return usage or None


def generation_failure_message(exc: Exception) -> str:
    """Translate provider-side agent failures into user-facing error text."""
    status_code = getattr(exc, "status_code", None) or getattr(exc, "status", None)
    error_type = type(exc).__name__
    if status_code in {401, 403} or error_type in {
        "AuthenticationError",
        "PermissionDeniedError",
    }:
        return (
            "Stationary Energy agent run failed: LLM provider authentication "
            "failed. Check OPENROUTER_API_KEY or the configured LLM base URL."
        )
    if error_type == "APITimeoutError":
        return (
            "Stationary Energy agent run failed: LLM provider request timed "
            "out. Increase OPENROUTER_TIMEOUT_MS or use a faster model."
        )
    return "Stationary Energy agent run failed"


def validate_and_normalize_proposals(
    proposals: list[StationaryEnergyLLMProposal],
    stored_source_candidates: list[dict[str, Any]],
    taxonomy_rows: list[Any],
) -> list[dict[str, Any]]:
    """Validate bounded-scope proposal ids and normalize them for persistence."""
    taxonomy_by_identity = _taxonomy_by_identity(taxonomy_rows)
    candidate_by_id = {
        str(candidate["candidate_id"]): candidate
        for candidate in stored_source_candidates
        if candidate.get("candidate_id")
    }
    applicable_candidate_ids = {
        candidate_id
        for candidate_id, candidate in candidate_by_id.items()
        if candidate.get("applicability_status") == "applicable"
    }
    normalized: list[dict[str, Any]] = []
    seen_taxonomy_rows: set[tuple[str | None, ...]] = set()
    for proposal in proposals:
        proposal_identity = stationary_energy_scope_identity(proposal.target_ref)
        if proposal_identity not in taxonomy_by_identity:
            raise ValueError(
                "Stationary Energy LLM returned a target_ref outside the bounded taxonomy: "
                f"{stationary_energy_scope_label(proposal.target_ref)}"
            )
        if proposal_identity in seen_taxonomy_rows:
            raise ValueError(
                "Stationary Energy LLM returned multiple proposals for the same taxonomy row: "
                f"{stationary_energy_scope_label(proposal.target_ref)}"
            )
        seen_taxonomy_rows.add(proposal_identity)
        canonical_target_ref = taxonomy_by_identity[proposal_identity]

        recommended_candidate_id = (
            str(proposal.recommended_candidate_id)
            if proposal.recommended_candidate_id
            else None
        )
        if (
            recommended_candidate_id
            and recommended_candidate_id not in applicable_candidate_ids
        ):
            raise ValueError(
                "Stationary Energy LLM recommended a candidate outside the applicable stored snapshot"
            )

        recommended_candidate = (
            candidate_by_id.get(recommended_candidate_id)
            if recommended_candidate_id
            else None
        )
        if recommended_candidate:
            expected_datasource_id = recommended_candidate.get("datasource_id")
            if not proposal.recommended_datasource_id:
                raise ValueError(
                    "Stationary Energy LLM omitted recommended_datasource_id for a recommended candidate"
                )
            if proposal.recommended_datasource_id != expected_datasource_id:
                raise ValueError(
                    "Stationary Energy LLM returned a datasource ID that does not match the recommended candidate"
                )
            if not stationary_energy_scope_matches_target(
                target_ref=canonical_target_ref,
                source_scope=recommended_candidate.get("source_scope"),
            ):
                raise ValueError(
                    "Stationary Energy LLM recommended a candidate outside the proposal target scope: "
                    f"{stationary_energy_scope_label(canonical_target_ref)}"
                )
            recommended_datasource_id = expected_datasource_id
        else:
            if proposal.recommended_datasource_id:
                raise ValueError(
                    "Stationary Energy LLM returned recommended_datasource_id without a candidate_id"
                )
            recommended_datasource_id = None

        alternative_candidate_ids: list[str] = []
        seen_alternatives: set[str] = set()
        for candidate_id in proposal.alternative_candidate_ids:
            candidate_id_text = str(candidate_id)
            if candidate_id_text not in applicable_candidate_ids:
                raise ValueError(
                    "Stationary Energy LLM returned an alternative candidate outside the applicable stored snapshot"
                )
            alternative_candidate = candidate_by_id[candidate_id_text]
            if not stationary_energy_scope_matches_target(
                target_ref=canonical_target_ref,
                source_scope=alternative_candidate.get("source_scope"),
            ):
                raise ValueError(
                    "Stationary Energy LLM returned an alternative candidate outside the proposal target scope: "
                    f"{stationary_energy_scope_label(canonical_target_ref)}"
                )
            if (
                candidate_id_text != recommended_candidate_id
                and candidate_id_text not in seen_alternatives
            ):
                alternative_candidate_ids.append(candidate_id_text)
                seen_alternatives.add(candidate_id_text)

        normalized.append(
            {
                "target_ref": canonical_target_ref,
                "current_value": proposal.current_value,
                "recommended_candidate_id": (
                    UUID(recommended_candidate_id)
                    if recommended_candidate_id
                    else None
                ),
                "recommended_datasource_id": recommended_datasource_id,
                "alternative_candidate_ids": alternative_candidate_ids,
                "proposed_value": proposal.proposed_value,
                "rationale": proposal.rationale,
                "status": proposal.status,
                "confidence_score": proposal.confidence_score,
            }
        )

    missing_rows = [
        taxonomy_by_identity[identity]
        for identity in taxonomy_by_identity
        if identity not in seen_taxonomy_rows
    ]
    if missing_rows:
        missing_labels = ", ".join(
            stationary_energy_scope_label(row) for row in missing_rows
        )
        raise ValueError(
            "Stationary Energy LLM omitted taxonomy rows from the draft: "
            f"{missing_labels}"
        )
    return normalized


def _taxonomy_by_identity(
    taxonomy_rows: list[Any],
) -> dict[tuple[str | None, ...], dict[str, Any]]:
    """Index taxonomy rows by their Stationary Energy scope identity."""
    taxonomy_by_identity: dict[tuple[str | None, ...], dict[str, Any]] = {}
    for row in taxonomy_rows:
        row_payload = (
            row.model_dump(mode="json", exclude_none=True)
            if hasattr(row, "model_dump")
            else dict(row)
        )
        identity = stationary_energy_scope_identity(row_payload)
        if identity in taxonomy_by_identity:
            raise ValueError(
                "Stationary Energy taxonomy contains duplicate rows for identity "
                f"{stationary_energy_scope_label(row_payload)}"
            )
        taxonomy_by_identity[identity] = row_payload
    return taxonomy_by_identity


def serializable_model(value: Any) -> dict[str, Any] | None:
    """Convert a model-like object into a JSON-serializable dictionary."""
    if value is None:
        return None
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if is_dataclass(value) and not isinstance(value, type):
        return asdict(value)
    if isinstance(value, dict):
        return value
    return None


def json_safe(value: Any) -> Any:
    """Round-trip arbitrary values through JSON for safe trace persistence."""
    return json.loads(json.dumps(value, default=str, ensure_ascii=True))
