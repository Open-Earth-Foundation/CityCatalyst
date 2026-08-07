from __future__ import annotations

from dataclasses import asdict, is_dataclass
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.utils.stationary_energy_context import (
    stationary_energy_scope_identity,
    stationary_energy_scope_matches_target,
)


_GEOGRAPHY_RANK = {"city": 0, "locode": 0, "region": 1, "country": 2, "global": 3}

# IPCC/GPC notation keys and their plain-language meaning. Used to describe any
# notation-key answer a source reports (not just "NO").
_NOTATION_KEY_LABELS = {
    "NO": "not occurring",
    "NE": "not estimated",
    "IE": "included elsewhere",
    "C": "confidential",
    "NA": "not applicable",
}


def _has_emissions_value(value: Any) -> bool:
    """Return whether an emissions field is present, including zero values."""
    return value is not None and value != ""


def _notation_key_label(notation_key: str | None, notation_key_name: Any = None) -> str:
    """Plain-language label for a notation key, with sensible fallbacks."""
    if notation_key and notation_key.upper() in _NOTATION_KEY_LABELS:
        return _NOTATION_KEY_LABELS[notation_key.upper()]
    if isinstance(notation_key_name, str) and notation_key_name.strip():
        return notation_key_name.replace("-", " ").replace("_", " ").strip()
    return "reported notation"


def _row_has_usable_emissions(row: dict[str, Any]) -> bool:
    """Return whether a normalized row carries an emissions value."""
    if _has_emissions_value(row.get("emissions_value_100yr")) or _has_emissions_value(
        row.get("emissions_value")
    ):
        return True

    gases = row.get("gases")
    if not isinstance(gases, list):
        return False
    return any(
        isinstance(gas, dict)
        and (
            _has_emissions_value(gas.get("emissions_value_100yr"))
            or _has_emissions_value(gas.get("emissions_value"))
        )
        for gas in gases
    )


def _candidate_has_usable_emissions(candidate: dict[str, Any]) -> bool:
    """Return whether a candidate actually carries an emissions value to draft.

    Some sources (e.g. infrastructure-mapping datasets) match a row's scope but
    return rows with empty ``gases`` / no emissions. Those can't back a draft
    value, so they should not count as a usable source -- otherwise the row shows
    a confusing "no source-backed draft value" instead of a clean gap.
    """
    for row in candidate.get("normalized_rows") or []:
        if not isinstance(row, dict):
            continue
        if _row_has_usable_emissions(row):
            return True
    return False


def build_deterministic_proposals(
    *,
    taxonomy_rows: list[Any],
    stored_source_candidates: list[dict[str, Any]],
    current_values: list[Any] | None = None,
    inventory_year: int | None = None,
) -> list[dict[str, Any]]:
    """Resolve every taxonomy row into a deterministic draft proposal.

    For each row, find the applicable candidates whose scope matches the row
    (using the SAME matcher as proposal validation), then:

    - 0 matching candidates -> "gap" proposal (no source available).
    - 1 matching candidate -> "ready" proposal whose proposed_value copies the
      candidate's data row verbatim. No data rows -> "gap".
    - >= 2 matching candidates with equal emissions -> "needs_review" proposal
      so the user chooses which source to attach.
    - >= 2 matching candidates with different emissions -> "conflict" proposal.
      Multi-source candidates are ranked by geographic specificity (city >
      region > country > global) then closeness to the inventory year. The top
      candidate is the recommendation, the rest are alternatives, and the user
      picks or overrides during review.
    """
    applicable = [
        candidate
        for candidate in stored_source_candidates
        if candidate.get("applicability_status") == "applicable"
    ]
    deterministic: list[dict[str, Any]] = []
    current_value_payloads = _current_value_payloads(current_values or [])
    for row in taxonomy_rows:
        row_payload = (
            row.model_dump(mode="json", exclude_none=True)
            if hasattr(row, "model_dump")
            else dict(row)
        )
        current_value = _current_value_for_row(row_payload, current_value_payloads)
        scope_matched = [
            candidate
            for candidate in applicable
            if stationary_energy_scope_matches_target(
                target_ref=row_payload,
                source_scope=candidate.get("source_scope"),
            )
        ]
        matching = [
            candidate
            for candidate in scope_matched
            if _candidate_has_usable_emissions(candidate)
        ]
        if not matching:
            # No source with an emissions value. If a matching source instead
            # reports a notation key (e.g. "NO" = not occurring), surface that
            # distinctly from a blind data gap.
            notation_candidate = next(
                (
                    candidate
                    for candidate in scope_matched
                    if _candidate_notation_key(candidate)
                ),
                None,
            )
            if notation_candidate is not None:
                deterministic.append(
                    _deterministic_notation_proposal(
                        row_payload, notation_candidate, current_value
                    )
                )
            else:
                deterministic.append(
                    _deterministic_gap_proposal(row_payload, current_value)
                )
            continue
        if len(matching) == 1:
            candidate = matching[0]
            normalized_rows = candidate.get("normalized_rows") or []
            if (
                normalized_rows
                and candidate.get("candidate_id")
                and candidate.get("datasource_id")
            ):
                deterministic.append(
                    _deterministic_single_source_proposal(
                        row_payload, candidate, normalized_rows[0], current_value
                    )
                )
            else:
                deterministic.append(
                    _deterministic_gap_proposal(row_payload, current_value)
                )
            continue
        # >= 2 sources with real emissions. If the values agree, still ask the
        # user which source to attach. If the values differ, surface a conflict
        # with the deterministic recommendation plus alternatives.
        if _matching_candidates_have_same_emissions_value(matching):
            deterministic.append(
                _deterministic_multi_source_proposal(
                    row_payload,
                    matching,
                    inventory_year,
                    current_value,
                    status="needs_review",
                )
            )
            continue
        deterministic.append(
            _deterministic_multi_source_proposal(
                row_payload,
                matching,
                inventory_year,
                current_value,
                status="conflict",
            )
        )
    return deterministic


def _current_value_payloads(current_values: list[Any]) -> list[dict[str, Any]]:
    """Return scoped current inventory values as serializable dictionaries."""
    payloads: list[dict[str, Any]] = []
    for value in current_values:
        payload = serializable_model(value)
        if not payload:
            continue
        identity = stationary_energy_scope_identity(payload)
        if any(part is not None for part in identity):
            payloads.append(payload)
    return payloads


def _current_value_for_row(
    row_payload: dict[str, Any],
    current_values: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Find the current inventory value for a taxonomy row."""
    row_identity = stationary_energy_scope_identity(row_payload)
    for current_value in current_values:
        if stationary_energy_scope_identity(current_value) == row_identity:
            return current_value
    for current_value in current_values:
        if stationary_energy_scope_matches_target(
            target_ref=row_payload,
            source_scope=current_value,
        ):
            return current_value
    return None


def _candidate_rank_key(
    candidate: dict[str, Any], inventory_year: int | None
) -> tuple[int, int, str, str]:
    """Rank a candidate by geography, then closeness to the inventory year."""
    geography = str(candidate.get("geography_match") or "unknown").lower()
    geography_rank = _GEOGRAPHY_RANK.get(geography, 4)
    year = candidate.get("dataset_year")
    if inventory_year is not None and year is not None:
        try:
            year_distance = abs(int(year) - int(inventory_year))
        except (TypeError, ValueError):
            year_distance = 9999
    else:
        year_distance = 9999
    # Stable tiebreakers so the recommendation is deterministic across runs.
    return (
        geography_rank,
        year_distance,
        str(candidate.get("datasource_id") or ""),
        str(candidate.get("candidate_id") or ""),
    )


def _matching_candidates_have_same_emissions_value(
    candidates: list[dict[str, Any]],
) -> bool:
    """Return whether all candidates expose the same normalized emissions value."""
    signatures = [_candidate_emissions_signature(candidate) for candidate in candidates]
    if not signatures or any(signature is None for signature in signatures):
        return False
    return len(set(signatures)) == 1


def _candidate_emissions_signature(candidate: dict[str, Any]) -> tuple[Any, ...] | None:
    """Build a comparable emissions signature from a candidate's first usable row."""
    for row in candidate.get("normalized_rows") or []:
        if not isinstance(row, dict) or not _row_has_usable_emissions(row):
            continue
        total_signature = _row_total_emissions_signature(row)
        if total_signature is not None:
            return total_signature
        gas_signature = _row_gas_emissions_signature(row)
        if gas_signature is not None:
            return gas_signature
    return None


def _row_total_emissions_signature(row: dict[str, Any]) -> tuple[Any, ...] | None:
    """Return a comparable total-emissions signature for one normalized row."""
    value = row.get("emissions_value_100yr")
    unit = row.get("emissions_unit_100yr") or row.get("emissions_unit")
    if _has_emissions_value(value):
        return ("total_100yr", _normalize_emissions_value(value), _normalize_unit(unit))

    value = row.get("emissions_value")
    unit = row.get("emissions_unit")
    if _has_emissions_value(value):
        return ("total", _normalize_emissions_value(value), _normalize_unit(unit))
    return None


def _row_gas_emissions_signature(row: dict[str, Any]) -> tuple[Any, ...] | None:
    """Return a comparable gas-level emissions signature for one row."""
    gases = row.get("gases")
    if not isinstance(gases, list):
        return None

    signatures: list[tuple[str, str, str]] = []
    for gas in gases:
        if not isinstance(gas, dict):
            continue
        value = gas.get("emissions_value_100yr")
        unit = gas.get("emissions_unit_100yr") or gas.get("emissions_unit")
        value_kind = "100yr"
        if not _has_emissions_value(value):
            value = gas.get("emissions_value")
            unit = gas.get("emissions_unit")
            value_kind = "value"
        if not _has_emissions_value(value):
            continue
        signatures.append(
            (
                str(gas.get("gas") or "").strip().lower(),
                value_kind,
                f"{_normalize_emissions_value(value)}:{_normalize_unit(unit)}",
            )
        )
    if not signatures:
        return None
    return ("gases", *sorted(signatures))


def _normalize_emissions_value(value: Any) -> str:
    """Normalize numeric-looking emissions values for equality checks."""
    text = str(value).strip()
    try:
        return str(Decimal(text).normalize())
    except Exception:
        return text


def _normalize_unit(value: Any) -> str:
    """Normalize emissions units for equality checks."""
    return str(value or "").strip().lower().replace(" ", "")


def _deterministic_multi_source_proposal(
    row_payload: dict[str, Any],
    candidates: list[dict[str, Any]],
    inventory_year: int | None,
    current_value: dict[str, Any] | None,
    *,
    status: str = "conflict",
) -> dict[str, Any]:
    """Build a multi-source proposal with a ranked recommendation + alternatives."""
    ranked = sorted(
        candidates, key=lambda candidate: _candidate_rank_key(candidate, inventory_year)
    )
    recommended = ranked[0]
    alternatives = ranked[1:]
    recommended_rows = recommended.get("normalized_rows") or []
    proposed_value = (
        {"row": recommended_rows[0], "datasource_id": recommended.get("datasource_id")}
        if recommended_rows
        else None
    )
    geography = str(recommended.get("geography_match") or "unknown")
    year = recommended.get("dataset_year")
    publisher = (
        recommended.get("publisher_name")
        or recommended.get("dataset_name")
        or "the top-ranked source"
    )
    if status == "needs_review":
        rationale = (
            f"{len(candidates)} applicable sources report the same emissions value. "
            f"Recommended {publisher} ({year}, {geography}-level) as the closest "
            "geographic and temporal match; review which source should be attached."
        )
    else:
        rationale = (
            f"{len(candidates)} applicable sources compete for this row. "
            f"Recommended {publisher} ({year}, {geography}-level) as the closest "
            "geographic and temporal match; review the alternatives before saving."
        )

    return {
        "target_ref": row_payload,
        "current_value": current_value,
        "recommended_candidate_id": UUID(str(recommended["candidate_id"])),
        "recommended_datasource_id": recommended.get("datasource_id"),
        "alternative_candidate_ids": [
            str(candidate["candidate_id"])
            for candidate in alternatives
            if candidate.get("candidate_id")
        ],
        "proposed_value": proposed_value,
        "rationale": rationale,
        "status": status,
        "confidence_score": None,
    }


def _candidate_notation_key(candidate: dict[str, Any]) -> str | None:
    """Return a candidate's notation key (e.g. "NO" = not occurring), if any.

    Notation keys come from the global API (source_data.notation_key) and mean
    the activity is confirmed absent/not occurring -- a complete inventory
    answer, distinct from a data gap.
    """
    source_data = candidate.get("source_data")
    if isinstance(source_data, dict):
        key = source_data.get("notation_key")
        if isinstance(key, str) and key.strip():
            return key.strip()
    return None


def _deterministic_notation_proposal(
    row_payload: dict[str, Any],
    candidate: dict[str, Any],
    current_value: dict[str, Any] | None,
) -> dict[str, Any]:
    """Build a "not occurring" proposal from a source that reports a notation key."""
    source_data = candidate.get("source_data") or {}
    notation_key = _candidate_notation_key(candidate)
    explanation = source_data.get("unavailable_explanation")
    explanation_text = (
        explanation.get("en")
        if isinstance(explanation, dict)
        else (explanation if isinstance(explanation, str) else None)
    )
    candidate_id = candidate.get("candidate_id")
    return {
        "target_ref": row_payload,
        "current_value": current_value,
        "recommended_candidate_id": (
            UUID(str(candidate_id)) if candidate_id else None
        ),
        "recommended_datasource_id": candidate.get("datasource_id"),
        "alternative_candidate_ids": [],
        "proposed_value": {
            "notation_key": notation_key,
            "notation_key_name": source_data.get("notation_key_name"),
            "explanation": explanation_text,
            "datasource_id": candidate.get("datasource_id"),
        },
        "rationale": (
            f"Source reports notation key '{notation_key}' "
            f"({_notation_key_label(notation_key, source_data.get('notation_key_name'))})"
            f": {explanation_text or 'see source notation.'}"
        ),
        # No emissions value to draft, but this is a confirmed "not occurring"
        # answer rather than a blind gap; the UI distinguishes it via the
        # proposed_value notation key.
        "status": "gap",
        "confidence_score": None,
    }


def _deterministic_gap_proposal(
    row_payload: dict[str, Any],
    current_value: dict[str, Any] | None,
) -> dict[str, Any]:
    """Build a no-source ("gap") proposal for a row with no matching candidate."""
    return {
        "target_ref": row_payload,
        "current_value": current_value,
        "recommended_candidate_id": None,
        "recommended_datasource_id": None,
        "alternative_candidate_ids": [],
        "proposed_value": None,
        "rationale": "No applicable source candidate is available for this row.",
        "status": "gap",
        "confidence_score": None,
    }


def _deterministic_single_source_proposal(
    row_payload: dict[str, Any],
    candidate: dict[str, Any],
    data_row: Any,
    current_value: dict[str, Any] | None,
) -> dict[str, Any]:
    """Build a "ready" proposal copying a single source's data row verbatim."""
    return {
        "target_ref": row_payload,
        "current_value": current_value,
        "recommended_candidate_id": UUID(str(candidate["candidate_id"])),
        "recommended_datasource_id": candidate.get("datasource_id"),
        "alternative_candidate_ids": [],
        "proposed_value": {
            "row": data_row,
            "datasource_id": candidate.get("datasource_id"),
        },
        "rationale": (
            "Single applicable source; value taken directly from the connected "
            "dataset (no model inference)."
        ),
        "status": "ready",
        "confidence_score": None,
    }


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
