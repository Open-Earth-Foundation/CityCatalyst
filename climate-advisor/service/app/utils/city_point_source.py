"""Stable citations for scalar fields in the run's authorised CityCatalyst profile."""

from __future__ import annotations

import hashlib
import json


def city_citation_for_display(citation: dict, field_path: str) -> dict:
    """Render the stored profile snapshot without exposing its serialization."""
    field = field_path.removeprefix("city.")
    labels = {"name": "Municipality", "country": "Country", "population": "Population"}
    if field not in labels:
        return citation
    try:
        details = json.loads(citation["quote"])
        value = details[field]
    except (KeyError, TypeError, ValueError):
        return citation
    if field == "population" and isinstance(value, int):
        value = f"{value:,}"
    year = details.get("population_year")
    quote = f"{labels[field]}: {value}" + (f" ({year})" if year is not None else "")
    return {**citation, "quote": quote, "source_anchor": None}


def city_field_evidence(context: dict, path: str) -> dict | None:
    """Include the reporting year in a population citation and digest."""
    section, _, field = path.partition(".")
    profile = context.get(section)
    if not isinstance(profile, dict):
        return None
    value = profile.get(field)
    if (
        isinstance(value, bool)
        or not isinstance(value, (str, float, int))
        or value == ""
    ):
        return None
    detail = {field: value}
    if field == "population" and profile.get("population_year") is not None:
        detail["population_year"] = profile["population_year"]
    quote = json.dumps(detail, ensure_ascii=False, sort_keys=True)
    return {
        "value": value,
        "quote": quote,
        "sha256": hashlib.sha256(quote.encode()).hexdigest(),
    }
