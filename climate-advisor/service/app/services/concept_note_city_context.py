from __future__ import annotations

import asyncio
from collections.abc import Mapping
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from app.models.concept_note_city_context import (
    ConceptNoteCcContext,
    GhgiContext,
    GhgiDataState,
    GhgiEmissions,
    GhgiInventory,
    GhgiSector,
    GhgiTopSource,
    MeedContext,
    MeedPlaceholder,
)
from app.services.citycatalyst_client import CityCatalystClient
from pydantic import TypeAdapter, ValidationError

SECTORS: tuple[tuple[str, str], ...] = (
    ("I", "Stationary Energy"),
    ("II", "Transportation"),
    ("III", "Waste"),
    ("IV", "IPPU"),
    ("V", "AFOLU"),
)
UNIX_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)
MEED_CONTEXT_ADAPTER = TypeAdapter(MeedPlaceholder | MeedContext)


class ConceptNoteCityContextDataError(Exception):
    """Raised when a CityCatalyst capability returns an invalid contract."""


async def load_ghgi_context(
    *,
    cc_client: CityCatalystClient,
    user_id: str,
    city_id: UUID,
    token: str,
) -> GhgiContext:
    """Select the newest accessible inventory and build compact GHGI context."""
    # Load the exact city's complete accessible inventory list.
    inventory_payload = await cc_client.load_inventory_list_accessible(
        request_payload={
            "user_id": user_id,
            "city_id": str(city_id),
            "include_all_city_years": True,
        },
        token=token,
    )
    selected_inventory = select_newest_inventory(
        capability_data(inventory_payload),
        city_id=city_id,
    )
    if selected_inventory is None:
        return GhgiContext(
            availability="missing",
            inventory=None,
            emissions=None,
        )

    # Load status and emissions concurrently for the same immutable selection.
    inventory_id = inventory_uuid(selected_inventory)
    request_payload = {
        "user_id": user_id,
        "city_id": str(city_id),
        "inventory_id": str(inventory_id),
    }
    status_payload, emissions_payload = await asyncio.gather(
        cc_client.load_inventory_status_overview(
            request_payload=request_payload,
            token=token,
        ),
        cc_client.load_inventory_emissions_context(
            request_payload=request_payload,
            token=token,
        ),
    )

    # Normalize the two bounded CC responses into the CNB contract.
    return compact_ghgi_context(
        inventory=selected_inventory,
        status_data=capability_data(status_payload),
        emissions_data=capability_data(emissions_payload),
    )


def select_newest_inventory(
    data: Mapping[str, Any],
    *,
    city_id: UUID,
) -> Mapping[str, Any] | None:
    """Choose by year desc, update time desc, then inventory UUID asc."""
    cities = data.get("cities")
    if not isinstance(cities, list):
        raise ConceptNoteCityContextDataError(
            "Accessible inventory response is missing cities"
        )

    matching_city = next(
        (
            city
            for city in cities
            if isinstance(city, Mapping) and str(city.get("city_id")) == str(city_id)
        ),
        None,
    )
    if matching_city is None:
        return None

    inventories = matching_city.get("inventories")
    if not isinstance(inventories, list):
        raise ConceptNoteCityContextDataError(
            "Accessible inventory response is missing inventories"
        )
    candidates = [item for item in inventories if isinstance(item, Mapping)]
    if not candidates:
        return None

    try:
        return min(candidates, key=inventory_sort_key)
    except (TypeError, ValueError) as exc:
        raise ConceptNoteCityContextDataError(
            "Accessible inventory metadata is invalid"
        ) from exc


def compact_ghgi_context(
    *,
    inventory: Mapping[str, Any],
    status_data: Mapping[str, Any],
    emissions_data: Mapping[str, Any],
) -> GhgiContext:
    """Merge status and emissions into five ordered GPC sectors."""
    status_by_sector = records_by_reference(status_data.get("by_sector"))
    emissions_by_sector = records_by_reference(emissions_data.get("by_sector"))

    sectors: list[GhgiSector] = []
    for reference, name in SECTORS:
        status = status_by_sector.get(reference, {})
        emissions = emissions_by_sector.get(reference, {})
        data_state = status.get("data_state")
        if not isinstance(data_state, Mapping):
            data_state = {}

        sectors.append(
            GhgiSector(
                gpc=reference,
                name=name,
                emissions_tco2e=number(emissions.get("emissions_tco2e")),
                share_pct=number(emissions.get("share_percent")),
                completion_pct=bounded_percentage(
                    status.get("completion_percent")
                ),
                required=count(status.get("required")),
                filled=count(status.get("filled")),
                missing=count(status.get("missing")),
                data_state=GhgiDataState(
                    third_party=count(data_state.get("third_party")),
                    manual_or_uploaded=count(
                        data_state.get("manual_or_uploaded")
                    ),
                    not_estimated=count(data_state.get("not_estimated")),
                    not_occurring=count(data_state.get("not_occurring")),
                ),
            )
        )

    completion = status_data.get("completion")
    if completion is not None and not isinstance(completion, Mapping):
        raise ConceptNoteCityContextDataError(
            "Inventory completion must be an object"
        )
    overall_missing = count(completion.get("missing")) if completion else 0
    availability = (
        "partial"
        if overall_missing > 0 or any(sector.missing > 0 for sector in sectors)
        else "available"
    )
    try:
        return GhgiContext(
            availability=availability,
            inventory=GhgiInventory(
                id=inventory_uuid(inventory),
                year=optional_int(inventory.get("year")),
                type=optional_string(inventory.get("type")),
                gwp=optional_string(inventory.get("gwp")),
            ),
            emissions=GhgiEmissions(
                total_tco2e=number(
                    emissions_data.get("total_emissions_tco2e")
                ),
                sectors=sectors,
                top_sources=top_sources(emissions_data.get("top_emitters")),
            ),
        )
    except ValidationError as exc:
        raise ConceptNoteCityContextDataError(
            "GHGI capability data does not match the CNB contract"
        ) from exc


def cached_cc_context(
    context_bundle: Mapping[str, Any],
) -> ConceptNoteCcContext | None:
    """Return an already persisted GHGI and MEED snapshot when valid."""
    cc_context = context_bundle.get("cc_context")
    if not isinstance(cc_context, Mapping):
        return None
    try:
        return ConceptNoteCcContext.model_validate(
            {
                "ghgi": cc_context.get("ghgi"),
                "meed": cc_context.get("meed"),
            }
        )
    except ValidationError:
        return None


def saved_meed_context(
    context_bundle: Mapping[str, Any],
) -> MeedPlaceholder | MeedContext:
    """Return a valid supplied MEED snapshot or the empty placeholder."""
    cc_context = context_bundle.get("cc_context")
    meed = cc_context.get("meed") if isinstance(cc_context, Mapping) else None
    try:
        return MEED_CONTEXT_ADAPTER.validate_python(meed or {})
    except ValidationError:
        return MeedPlaceholder()


def capability_data(payload: Mapping[str, Any]) -> Mapping[str, Any]:
    """Extract a successful CityCatalyst capability data object."""
    if payload.get("success") is not True:
        raise ConceptNoteCityContextDataError(
            "CityCatalyst capability did not report success"
        )
    data = payload.get("data")
    if not isinstance(data, Mapping):
        raise ConceptNoteCityContextDataError(
            "CityCatalyst capability response is missing data"
        )
    return data


def inventory_sort_key(inventory: Mapping[str, Any]) -> tuple[int, float, str]:
    """Return the deterministic newest-first inventory sort key."""
    year = optional_int(inventory.get("year"))
    updated_at = parse_timestamp(inventory.get("updated_at"))
    inventory_id = inventory_uuid(inventory)
    return (
        -(year if year is not None else -1),
        -(updated_at - UNIX_EPOCH).total_seconds(),
        str(inventory_id),
    )


def parse_timestamp(value: Any) -> datetime:
    """Parse an ISO timestamp, treating missing values as the oldest."""
    if value is None:
        return datetime.min.replace(tzinfo=UTC)
    if not isinstance(value, str):
        raise TypeError("updated_at must be an ISO timestamp")
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def records_by_reference(value: Any) -> dict[str, Mapping[str, Any]]:
    """Index known GPC records while ignoring unknown sector rows."""
    if value is None:
        return {}
    if not isinstance(value, list):
        raise ConceptNoteCityContextDataError("Sector data must be an array")
    indexed: dict[str, Mapping[str, Any]] = {}
    for item in value:
        if not isinstance(item, Mapping):
            raise ConceptNoteCityContextDataError(
                "Sector data contains a non-object row"
            )
        reference = optional_string(item.get("reference"))
        if reference in {sector[0] for sector in SECTORS}:
            indexed[reference] = item
    return indexed


def top_sources(value: Any) -> list[GhgiTopSource]:
    """Return at most five emitters ordered by emissions descending."""
    if value is None:
        return []
    if not isinstance(value, list):
        raise ConceptNoteCityContextDataError("Top emitters must be an array")

    normalized: list[GhgiTopSource] = []
    for item in value:
        if not isinstance(item, Mapping):
            raise ConceptNoteCityContextDataError(
                "Top emitters contains a non-object row"
            )
        normalized.append(
            GhgiTopSource(
                sector=required_string(item.get("sector"), "sector"),
                subsector=required_string(item.get("subsector"), "subsector"),
                scope=optional_string(item.get("scope")),
                emissions_tco2e=number(item.get("emissions_tco2e")),
                share_pct=number(item.get("share_percent")),
            )
        )

    return sorted(
        normalized,
        key=lambda item: (
            -item.emissions_tco2e,
            item.sector,
            item.subsector,
            item.scope or "",
        ),
    )[:5]


def inventory_uuid(inventory: Mapping[str, Any]) -> UUID:
    """Return a valid inventory UUID."""
    value = inventory.get("inventory_id")
    try:
        return UUID(str(value))
    except (TypeError, ValueError, AttributeError) as exc:
        raise ConceptNoteCityContextDataError(
            "Inventory id is missing or invalid"
        ) from exc


def number(value: Any) -> float:
    """Return a finite number rounded to two decimal places."""
    if value is None:
        return 0.0
    if isinstance(value, bool):
        raise ConceptNoteCityContextDataError("Boolean is not a numeric value")
    try:
        numeric = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ConceptNoteCityContextDataError("Numeric GHGI value is invalid") from exc
    if not numeric.is_finite():
        raise ConceptNoteCityContextDataError("Numeric GHGI value must be finite")
    return float(round(numeric, 2))


def count(value: Any) -> int:
    """Return a non-negative integer count."""
    if value is None:
        return 0
    if isinstance(value, bool):
        raise ConceptNoteCityContextDataError("Boolean is not a count")
    try:
        result = int(value)
    except (TypeError, ValueError) as exc:
        raise ConceptNoteCityContextDataError("GHGI count is invalid") from exc
    if result < 0 or result != Decimal(str(value)):
        raise ConceptNoteCityContextDataError(
            "GHGI count must be a non-negative integer"
        )
    return result


def bounded_percentage(value: Any) -> int:
    """Return an integer percentage in the inclusive 0-100 range."""
    result = count(value)
    if result > 100:
        raise ConceptNoteCityContextDataError(
            "GHGI completion percentage exceeds 100"
        )
    return result


def optional_int(value: Any) -> int | None:
    """Return an optional integer without accepting booleans or fractions."""
    if value is None:
        return None
    if isinstance(value, bool):
        raise ConceptNoteCityContextDataError("Boolean is not an integer")
    try:
        result = int(value)
    except (TypeError, ValueError) as exc:
        raise ConceptNoteCityContextDataError("Value is not an integer") from exc
    if result != Decimal(str(value)):
        raise ConceptNoteCityContextDataError("Value is not an integer")
    return result


def optional_string(value: Any) -> str | None:
    """Return an optional string, rejecting other upstream types."""
    if value is None:
        return None
    if not isinstance(value, str):
        raise ConceptNoteCityContextDataError("Expected a string value")
    return value


def required_string(value: Any, field: str) -> str:
    """Return a required non-empty string."""
    result = optional_string(value)
    if result is None or not result.strip():
        raise ConceptNoteCityContextDataError(
            f"Top emitter {field} is missing"
        )
    return result
