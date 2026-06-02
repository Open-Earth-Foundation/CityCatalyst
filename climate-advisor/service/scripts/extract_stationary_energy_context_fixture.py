"""
Brief: Extract CityCatalyst data into a mock CA Stationary Energy context fixture.

Inputs:
- CLI args: `--base-url` is the CityCatalyst base URL; defaults to `CC_BASE_URL` or `http://localhost:3000`.
- CLI args: `--token` is a CityCatalyst bearer token; defaults to `CA_E2E_CC_TOKEN`.
- CLI args: `--user-id` is the CityCatalyst user ID the fixture is extracted for.
- CLI args: `--city-id` and `--inventory-id` select the target context; when omitted, the first user inventory is used.
- CLI args: `--output` is the fixture JSON path; defaults to `service/tests/fixtures/stationary_energy_load_context_extracted.json`.
- CLI args: `--timeout` is the HTTP timeout in seconds.
- Files/paths: reads the repository GPC reference table to build Stationary Energy taxonomy rows.
- Env vars: `CC_BASE_URL` and `CA_E2E_CC_TOKEN` provide defaults for CityCatalyst access.

Outputs:
- Writes a JSON fixture matching `LoadStationaryEnergyContextResponse`.
- Prints extracted city, inventory, taxonomy, current-value, and source-candidate counts.

Usage (from project root):
- uv run --directory climate-advisor/service python -m scripts.extract_stationary_energy_context_fixture --user-id <cc-user-id>
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

import requests


DEFAULT_OUTPUT = (
    Path(__file__).resolve().parents[1]
    / "tests"
    / "fixtures"
    / "stationary_energy_load_context_extracted.json"
)
GPC_REFERENCE_PATH = (
    Path(__file__).resolve().parents[3]
    / "app"
    / "src"
    / "util"
    / "GHGI"
    / "data"
    / "gpc-reference-table.json"
)


def _fetch_json(
    base_url: str,
    path: str,
    *,
    token: str | None,
    timeout: int,
) -> dict[str, Any]:
    """Fetch and validate a JSON object from a CityCatalyst endpoint."""

    url = f"{base_url.rstrip('/')}{path}"
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    response = requests.get(url, headers=headers, timeout=timeout)
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError(f"Expected object response from {path}")
    return payload


def _unwrap_data(payload: dict[str, Any]) -> Any:
    """Return a CityCatalyst response data wrapper when present."""

    return payload.get("data", payload)


def _first(obj: dict[str, Any] | None, *keys: str) -> Any:
    """Return the first non-empty value for the requested keys."""

    if not isinstance(obj, dict):
        return None
    for key in keys:
        if key in obj and obj[key] not in {None, ""}:
            return obj[key]
    return None


def _friendly_name(value: str | None) -> str | None:
    """Convert a slug-like value into a readable label."""

    if not value:
        return value
    value = value.replace("-", " ").replace("_", " ")
    value = re.sub(r"\s+", " ", value).strip()
    return value[:1].upper() + value[1:] if value else value


def _latest_population(city: dict[str, Any]) -> int | None:
    """Return the latest population value from a city payload."""

    population = city.get("population") or city.get("populations")
    if isinstance(population, list):
        rows = [row for row in population if isinstance(row, dict)]
        if not rows:
            return None
        rows.sort(key=lambda row: row.get("year") or 0, reverse=True)
        value = rows[0].get("population") or rows[0].get("value")
    else:
        value = population
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _build_city_context(city: dict[str, Any], city_id: str) -> dict[str, Any]:
    """Build the fixture city context object."""

    return {
        "city_id": _first(city, "cityId", "city_id", "id") or city_id,
        "name": _first(city, "name", "cityName"),
        "locode": _first(city, "locode", "locodeId"),
        "country": _first(city, "country", "countryName"),
        "country_locode": _first(city, "countryLocode", "countryCode", "country_locode"),
        "region": _first(city, "region", "regionName"),
        "region_locode": _first(city, "regionLocode", "regionCode", "region_locode"),
        "area": _first(city, "area"),
        "population": _latest_population(city),
    }


def _build_inventory_context(
    inventory: dict[str, Any],
    inventory_id: str,
) -> dict[str, Any]:
    """Build the fixture inventory context object."""

    return {
        "inventory_id": _first(inventory, "inventoryId", "inventory_id", "id") or inventory_id,
        "year": _first(inventory, "year"),
        "inventory_type": _first(inventory, "inventoryType", "inventory_type", "type"),
        "gwp": _first(
            inventory,
            "globalWarmingPotentialType",
            "global_warming_potential_type",
            "gwp",
        ),
        "total_emissions": _first(inventory, "totalEmissions", "total_emissions"),
    }


def _build_taxonomy() -> list[dict[str, Any]]:
    """Build Stationary Energy taxonomy rows from the GPC reference table."""

    if not GPC_REFERENCE_PATH.exists():
        return []

    with GPC_REFERENCE_PATH.open("r", encoding="utf-8") as handle:
        rows = json.load(handle)

    taxonomy: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        if not isinstance(row, dict) or row.get("sector") != "stationary-energy":
            continue
        ref = row.get("gpcRefNo")
        if not isinstance(ref, str) or ref in seen:
            continue
        seen.add(ref)
        parts = ref.split(".")
        subsector_ref = ".".join(parts[:2]) if len(parts) >= 2 else None
        taxonomy.append(
            {
                "sector_id": "I",
                "sector_name": "Stationary Energy",
                "sector_reference_number": "I",
                "subsector_id": subsector_ref,
                "subsector_name": _friendly_name(row.get("subsector")),
                "subsector_reference_number": subsector_ref,
                "subcategory_id": ref,
                "subcategory_name": _friendly_name(row.get("subcategoryName")),
                "subcategory_reference_number": ref,
                "scope_id": str(row.get("scope")) if row.get("scope") is not None else None,
                "scope_name": f"Scope {row.get('scope')}" if row.get("scope") is not None else None,
            }
        )
    return taxonomy


def _build_current_values(results: dict[str, Any]) -> list[dict[str, Any]]:
    """Build current-value rows from CityCatalyst inventory results."""

    data = _unwrap_data(results)
    if not isinstance(data, dict):
        return []
    rows = data.get("subsectorResults") or data.get("subsectors") or []
    current_values: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        current_values.append(
            {
                "inventory_value_id": _first(row, "inventoryValueId", "id"),
                "sector_id": "I",
                "subsector_id": _first(row, "subsectorId", "subSectorId", "referenceNumber"),
                "subsector_name": _first(row, "subsectorName", "subSectorName", "name"),
                "value": _first(row, "activityValue", "value"),
                "unit": _first(row, "activityUnit", "unit"),
                "emissions_value": _first(row, "emissions", "totalEmissions"),
                "emissions_unit": "tCO2e",
                "data_source": {"source": "GET /api/v1/inventory/{inventory}/results/stationary-energy"},
            }
        )
    return current_values


def _source_scope(source: dict[str, Any]) -> dict[str, Any]:
    """Build a source scope object from a CityCatalyst source payload."""

    subcategory = _first(source, "subCategory", "subcategory")
    subsector = _first(source, "subSector", "subsector")
    if isinstance(subcategory, dict):
        nested_subsector = _first(subcategory, "subsector", "subSector")
        if isinstance(nested_subsector, dict):
            subsector = nested_subsector

    subcategory = subcategory if isinstance(subcategory, dict) else {}
    subsector = subsector if isinstance(subsector, dict) else {}
    sector = _first(source, "sector")
    sector = sector if isinstance(sector, dict) else {}

    return {
        "sector_id": _first(sector, "sectorId", "sector_id") or "I",
        "sector_name": _first(sector, "sectorName", "name") or "Stationary Energy",
        "sector_reference_number": _first(sector, "referenceNumber") or "I",
        "subsector_id": _first(subsector, "subsectorId", "subSectorId", "id", "referenceNumber"),
        "subsector_name": _first(subsector, "subsectorName", "name"),
        "subsector_reference_number": _first(subsector, "referenceNumber"),
        "subcategory_id": _first(subcategory, "subcategoryId", "subCategoryId", "id", "referenceNumber"),
        "subcategory_name": _first(subcategory, "subcategoryName", "name"),
        "subcategory_reference_number": _first(subcategory, "referenceNumber"),
        "scope_id": str(_first(source, "scopeId", "scope_id") or ""),
        "scope_name": _first(source, "scopeName", "scope_name"),
    }


def _coerce_rows(data: Any) -> list[dict[str, Any]]:
    """Coerce source data into a list of row dictionaries."""

    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]
    if isinstance(data, dict):
        for key in ("rows", "data", "items", "records"):
            rows = data.get(key)
            if isinstance(rows, list):
                return [row for row in rows if isinstance(row, dict)]
        return [data]
    return []


def _build_source_candidate(
    item: dict[str, Any],
    *,
    status: str,
) -> dict[str, Any]:
    """Build one source-candidate fixture object."""

    source = item.get("source") if isinstance(item.get("source"), dict) else item
    publisher = _first(source, "publisher")
    publisher = publisher if isinstance(publisher, dict) else {}
    data = item.get("data")
    datasource_id = _first(source, "datasourceId", "dataSourceId", "id")

    return {
        "datasource_id": str(datasource_id or "unknown-datasource"),
        "name": _first(source, "name", "sourceName", "datasetName"),
        "publisher_name": _first(publisher, "name", "publisherName") or _first(source, "publisherName"),
        "retrieval_method": _first(source, "retrievalMethod", "sourceType", "type"),
        "dataset_name": _first(source, "datasetName", "dataset"),
        "dataset_year": _first(source, "datasetYear", "year"),
        "url": _first(source, "url", "sourceUrl", "source_url"),
        "geography_match": "unknown",
        "source_scope": _source_scope(source),
        "source_data": data if isinstance(data, dict) else None,
        "normalized_rows": _coerce_rows(data) if status == "applicable" else [],
        "applicability_status": status,
        "applicability_issues": [] if status == "applicable" else [str(item.get("error") or status)],
        "failure_reason": str(item.get("error")) if item.get("error") else None,
        "quality_score": None,
        "confidence_notes": "Extracted from existing CityCatalyst datasource endpoints.",
    }


def _build_source_candidates(datasource_payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Build all source candidates from a datasource payload."""

    candidates: list[dict[str, Any]] = []
    for status, key in (
        ("applicable", "data"),
        ("removed", "removedSources"),
        ("failed", "failedSources"),
    ):
        items = datasource_payload.get(key) or []
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, dict):
                candidates.append(_build_source_candidate(item, status=status))
    return candidates


def _choose_inventory(
    user_inventories: dict[str, Any],
) -> tuple[str | None, str | None]:
    """Choose the first city and inventory IDs from a user inventory response."""

    data = _unwrap_data(user_inventories)
    if not isinstance(data, list) or not data:
        return None, None
    inventory = data[0]
    if not isinstance(inventory, dict):
        return None, None
    city = inventory.get("city") if isinstance(inventory.get("city"), dict) else {}
    return (
        _first(city, "cityId", "city_id") or _first(inventory, "cityId", "city_id"),
        _first(inventory, "inventoryId", "inventory_id"),
    )


def main() -> int:
    """Extract the fixture and return a process exit code."""

    parser = argparse.ArgumentParser(
        description="Extract CC city/inventory data into a CA Stationary Energy mock fixture.",
    )
    parser.add_argument("--base-url", default=os.getenv("CC_BASE_URL", "http://localhost:3000"))
    parser.add_argument("--token", default=os.getenv("CA_E2E_CC_TOKEN"))
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--city-id", default=None)
    parser.add_argument("--inventory-id", default=None)
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--timeout", type=int, default=120)
    args = parser.parse_args()

    city_id = args.city_id
    inventory_id = args.inventory_id
    if not city_id or not inventory_id:
        inventories = _fetch_json(
            args.base_url,
            "/api/v1/user/inventories",
            token=args.token,
            timeout=args.timeout,
        )
        city_id, inventory_id = _choose_inventory(inventories)

    if not city_id or not inventory_id:
        print("Unable to determine city_id and inventory_id", file=sys.stderr)
        return 1

    city = _unwrap_data(
        _fetch_json(args.base_url, f"/api/v1/city/{city_id}", token=args.token, timeout=args.timeout)
    )
    inventory = _unwrap_data(
        _fetch_json(
            args.base_url,
            f"/api/v1/inventory/{inventory_id}",
            token=args.token,
            timeout=args.timeout,
        )
    )
    results = _fetch_json(
        args.base_url,
        f"/api/v1/inventory/{inventory_id}/results/stationary-energy",
        token=args.token,
        timeout=args.timeout,
    )
    datasources = _fetch_json(
        args.base_url,
        f"/api/v1/datasource/{inventory_id}",
        token=args.token,
        timeout=args.timeout,
    )

    fixture = {
        "city": _build_city_context(city if isinstance(city, dict) else {}, city_id),
        "inventory": _build_inventory_context(
            inventory if isinstance(inventory, dict) else {},
            inventory_id,
        ),
        "taxonomy": _build_taxonomy(),
        "current_values": _build_current_values(results),
        "source_candidates": _build_source_candidates(datasources),
        "permission_summary": {
            "can_review": True,
            "can_commit": False,
            "fixture": True,
            "extracted_for_user_id": args.user_id,
            "note": "Generated from existing CityCatalyst endpoints for CA mock-flow testing.",
        },
    }

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as handle:
        json.dump(fixture, handle, indent=2, ensure_ascii=True)

    print(f"Wrote extracted fixture to {output}")
    print(f"City: {fixture['city'].get('name')} ({fixture['city'].get('city_id')})")
    print(f"Inventory: {fixture['inventory'].get('inventory_id')}")
    print(f"Taxonomy rows: {len(fixture['taxonomy'])}")
    print(f"Current values: {len(fixture['current_values'])}")
    print(f"Source candidates: {len(fixture['source_candidates'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
