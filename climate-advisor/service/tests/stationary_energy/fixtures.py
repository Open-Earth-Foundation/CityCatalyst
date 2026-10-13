from __future__ import annotations

import pytest

pytest.importorskip("pgvector.sqlalchemy")
import base64
import json
from typing import Any
from unittest.mock import AsyncMock

from app.services.citycatalyst_client import CityCatalystClientError
from app.services.stationary_energy.stationary_energy_draft_service import (
    COMMIT_ACCEPTED_CAPABILITY,
    COMMIT_NOTATION_KEYS_CAPABILITY,
    LOAD_CONTEXT_CAPABILITY,
)


def _unsigned_jwt(claims: dict[str, Any]) -> str:
    def encode_json(payload: dict[str, Any]) -> str:
        raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

    return (
        f"{encode_json({'alg': 'none', 'typ': 'JWT'})}.{encode_json(claims)}.signature"
    )


def _expired_jwt() -> str:
    return _unsigned_jwt({"sub": "user-1", "exp": 1})


def _active_jwt(user_id: str = "user-1") -> str:
    return _unsigned_jwt({"sub": user_id, "exp": 4102444800})


def _auth_headers(user_id: str = "user-1") -> dict[str, str]:
    return {"Authorization": f"Bearer {_active_jwt(user_id)}"}


def _context_payload() -> dict[str, Any]:
    return {
        "city": {
            "city_id": "city-1",
            "name": "Testopolis",
            "locode": "US TST",
            "country": "United States",
            "country_locode": "US",
            "region": "Test Region",
            "area": "123.4",
        },
        "inventory": {
            "inventory_id": "inventory-1",
            "year": 2024,
            "inventory_type": "community",
            "gwp": "AR5",
            "total_emissions": "1000.5",
        },
        "taxonomy": [
            {
                "sector_id": "I",
                "sector_name": "Stationary Energy",
                "sector_reference_number": "I",
                "subsector_id": "I.1",
                "subsector_name": "Residential buildings",
                "subsector_reference_number": "I.1",
                "scope_id": "1",
                "scope_name": "Scope 1",
            },
            {
                "sector_id": "I",
                "sector_name": "Stationary Energy",
                "sector_reference_number": "I",
                "subsector_id": "I.2",
                "subsector_name": "Commercial buildings",
                "subsector_reference_number": "I.2",
                "scope_id": "1",
                "scope_name": "Scope 1",
            },
        ],
        "current_values": [
            {
                "inventory_value_id": "value-1",
                "subsector_id": "I.1",
                "scope_id": "1",
                "value": "42",
                "unit": "tCO2e",
                "datasource_id": "existing-ds",
            }
        ],
        "source_candidates": [
            {
                "datasource_id": "ds-applicable",
                "name": "Applicable source",
                "publisher_name": "Open Data Publisher",
                "dataset_name": "Building energy",
                "dataset_year": 2024,
                "url": "https://example.test/source",
                "geography_match": "city",
                "source_scope": {
                    "sector_id": "I",
                    "sector_name": "Stationary Energy",
                    "subsector_id": "I.1",
                    "subsector_name": "Residential buildings",
                    "scope_id": "1",
                    "scope_name": "Scope 1",
                },
                "source_data": {"raw": "kept"},
                "normalized_rows": [
                    {
                        "value": 100,
                        "unit": "MWh",
                        "emissions_value_100yr": "1000000",
                        "emissions_unit": "kgCO2e",
                    }
                ],
                "applicability_status": "applicable",
                "applicability_issues": [],
                "quality_score": "0.91",
            },
            {
                "datasource_id": "ds-removed",
                "name": "Removed source",
                "geography_match": "country",
                "source_scope": {"subsector_id": "I.1"},
                "normalized_rows": [],
                "applicability_status": "removed",
                "applicability_issues": ["Wrong geography"],
            },
            {
                "datasource_id": "ds-commercial",
                "name": "Commercial source",
                "geography_match": "city",
                "source_scope": {
                    "sector_id": "I",
                    "sector_name": "Stationary Energy",
                    "subsector_id": "I.2",
                    "subsector_name": "Commercial buildings",
                    "scope_id": "1",
                    "scope_name": "Scope 1",
                },
                "normalized_rows": [
                    {
                        "value": 200,
                        "unit": "MWh",
                        "emissions_value_100yr": "2000000",
                        "emissions_unit": "kgCO2e",
                    }
                ],
                "applicability_status": "applicable",
                "applicability_issues": [],
            },
            {
                "datasource_id": "ds-failed",
                "name": "Failed source",
                "geography_match": "unknown",
                "source_scope": {"subsector_id": "I.1"},
                "normalized_rows": [],
                "applicability_status": "failed",
                "applicability_issues": ["Fetch failed"],
                "failure_reason": "Upstream timeout",
            },
        ],
        "permission_summary": {"can_review": True, "can_commit": False},
        "guidance_context": {
            "sector_overview": "Stationary Energy covers building and facility energy use.",
            "scope_rules": [
                "Use the GPC stationary energy scope mapping provided by CC."
            ],
            "taxonomy_labels": {
                "I.1": "Residential buildings",
                "I.2": "Commercial buildings",
            },
            "methodology_summaries": [
                "Prefer subsector- and scope-matched energy datasets before broader proxies."
            ],
            "unit_conventions": [
                "Keep activity units aligned with the source dataset."
            ],
            "source_selection_rules": [
                "Choose applicable city-level sources before broader regional or country sources."
            ],
            "known_limits_or_gaps": [
                "Commercial coverage can be incomplete for some cities."
            ],
        },
    }


def _mock_cc_client() -> AsyncMock:
    mock_client = AsyncMock()
    mock_client.refresh_token = AsyncMock(return_value=("fresh-token", 3600))
    mock_client.get_stationary_energy_allowed_capabilities = AsyncMock(
        side_effect=lambda **kwargs: (
            [LOAD_CONTEXT_CAPABILITY]
            if kwargs.get("workflow_step") == "draft"
            else [COMMIT_ACCEPTED_CAPABILITY, COMMIT_NOTATION_KEYS_CAPABILITY]
        )
    )
    mock_client.load_stationary_energy_context = AsyncMock(
        return_value=_context_payload()
    )
    mock_client.commit_stationary_energy_accepted = AsyncMock(
        side_effect=_mock_commit_response
    )
    mock_client.list_stationary_energy_notation_keys = AsyncMock(
        return_value={**_notation_targets_payload(), "targets": []}
    )
    mock_client.commit_stationary_energy_notation_keys = AsyncMock(
        side_effect=_mock_notation_commit_response
    )
    return mock_client


def _mock_subject_mismatch_cc_client() -> AsyncMock:
    mock_client = _mock_cc_client()
    mock_client.get_stationary_energy_allowed_capabilities = AsyncMock(
        side_effect=CityCatalystClientError(
            "token subject does not match request user",
            status_code=403,
        )
    )
    return mock_client


async def _mock_commit_response(
    *,
    request_payload: dict[str, Any],
    token: str | None = None,
) -> dict[str, Any]:
    rows = request_payload.get("rows") or []
    return {
        "draft_run_id": request_payload.get("draft_run_id"),
        "inventory_id": request_payload.get("inventory_id"),
        "results": [
            {
                "proposal_id": row["proposal_id"],
                "decision_version": row["decision_version"],
                "row_type": row.get("row_type"),
                "selected_source_id": row.get("selected_source_id"),
                "manual_value": row.get("manual_value"),
                "manual_unit": row.get("manual_unit"),
                "status": "committed",
                "token_present": bool(token),
            }
            for row in rows
        ],
    }


async def _mock_notation_commit_response(
    *,
    request_payload: dict[str, Any],
    token: str | None = None,
) -> dict[str, Any]:
    rows = request_payload.get("rows") or []
    return {
        "draft_run_id": request_payload.get("draft_run_id"),
        "inventory_id": request_payload.get("inventory_id"),
        "results": [
            {
                "proposal_id": row["proposal_id"],
                "decision_version": row["decision_version"],
                "target_id": row.get("target_id"),
                "notation_key": row.get("notation_key"),
                "status": "committed",
                "token_present": bool(token),
            }
            for row in rows
        ],
    }


def _notation_targets_payload() -> dict[str, Any]:
    return {
        "allowed_notation_keys": [
            {
                "notation_key": "NO",
                "label": "NO",
                "meaning": "Not occurring",
                "unavailable_reason": "no-occurrance",
            },
            {
                "notation_key": "NE",
                "label": "NE",
                "meaning": "Not estimated",
                "unavailable_reason": "not-estimated",
            },
            {
                "notation_key": "IE",
                "label": "IE",
                "meaning": "Included elsewhere",
                "unavailable_reason": "included-elsewhere",
            },
            {
                "notation_key": "C",
                "label": "C",
                "meaning": "Confidential",
                "unavailable_reason": "confidential-information",
            },
        ],
        "targets": [
            {
                "target_id": "I.1.2",
                "target_label": "Residential buildings / Scope 2",
                "target_ref": {
                    "subcategory_id": "I.1.2",
                    "subcategory_name": "Residential buildings",
                    "scope_id": "2",
                },
                "current_notation_key": None,
            }
        ],
    }
