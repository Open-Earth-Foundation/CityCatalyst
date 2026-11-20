"""Optional data-fidelity contract for numbers shown in a CNB chat visual.

The render-visual tool accepts this metadata next to its HTML. It records, for
every plotted value, the unit, where it came from, and whether it is reported,
missing, conflicting or derived. ``check_visual_data`` returns blocking
``issues`` (the model must repair the metadata) and non-blocking ``warnings``
(the HTML does not visibly show a declared value, unit or gap). A derived
value names its inputs by point label or describes them in words; only a sum
whose inputs all name points is recomputed, and other calculations are accepted
as described without claiming a check. The metadata is
kept in the stored call arguments, so later turns can reuse the same numbers.
"""

from __future__ import annotations

import html as html_lib
import math
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# Bounds keep the metadata small; a long ranking still fits in one series.
MAX_SERIES = 12
MAX_POINTS_PER_SERIES = 100
MAX_ALTERNATIVES = 5
MAX_TEXT_CHARS = 200
MAX_WARNINGS = 20
# Derived sums tolerate only float noise; shown numbers may be rounded instead.
SUM_TOLERANCE = 1e-6

# Strict tool schemas need every field present, so optional values are nullable
# instead of defaulted.


class VisualDataSource(BaseModel):
    """Where one value comes from."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["document", "context", "user"] = Field(
        description=(
            "document = a concept_note_sources_query excerpt; context = "
            "CONCEPT_NOTE_CONTEXT_BUNDLE_JSON; user = stated in this chat."
        )
    )
    source_index: int | None = Field(
        description="One-based source_index of the queried document; null otherwise."
    )
    locator: str | None = Field(
        description="Page ('p. 4') or anchor of the excerpt; required for documents."
    )
    label: str = Field(description="Short human-readable source name shown to users.")


class VisualDataAlternative(BaseModel):
    """One of several disagreeing values for the same point."""

    model_config = ConfigDict(extra="forbid")

    value: float
    source: VisualDataSource


class VisualDataPoint(BaseModel):
    """One plotted value and its status."""

    model_config = ConfigDict(extra="forbid")

    label: str = Field(description="Category or x label, e.g. '2022' or 'Transport'.")
    value: float | None = Field(
        description="Number in the series unit; null when missing or unresolved."
    )
    status: Literal["reported", "missing", "conflicting", "derived"] = Field(
        description=(
            "reported = one sourced value; missing = no value exists (never 0); "
            "conflicting = sources disagree, list them in alternatives; derived = "
            "computed by you, list its inputs in derived_from."
        )
    )
    source: VisualDataSource | None = Field(
        description="Overrides the series source for this point; null to inherit."
    )
    alternatives: list[VisualDataAlternative] | None = Field(
        description="Two or more disagreeing sourced values; only for conflicting."
    )
    derived_from: list[str] | None = Field(
        description=(
            "Inputs of a derived value, only for derived: point labels such as "
            "['2019', '2020'] ('Series name / label' for another series), or a "
            "short description of each input, e.g. 'count of 5, 5, 9 MWh'."
        )
    )
    method: Literal["sum", "other"] | None = Field(
        description=(
            "sum = plain total of the listed points, recomputed when every input "
            "names a point; other or null = any other calculation (difference, "
            "count, product, share), accepted as described."
        )
    )


class VisualDataSeries(BaseModel):
    """One named series of points sharing a unit."""

    model_config = ConfigDict(extra="forbid")

    name: str
    unit: str = Field(description="Unit exactly as shown, e.g. 'tCO2e' or 'EUR'.")
    source: VisualDataSource | None = Field(
        description="Default source for all points; null if every point has one."
    )
    points: list[VisualDataPoint]


class VisualData(BaseModel):
    """Every number the visual shows, with unit, source and status."""

    model_config = ConfigDict(extra="forbid")

    series: list[VisualDataSeries]


def check_visual_data(data: VisualData, html: str) -> dict[str, object]:
    """Validate the metadata and compare it with the visible HTML text.

    Returns ``{"issues": [...], "warnings": [...], "summary": {...}}``. Each
    issue or warning is ``{"path", "code", "message"}``; paths use the tool
    argument shape, e.g. ``series[0].points[2]``.
    """
    issues: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    counts = {"series": len(data.series), "points": 0}
    counts.update(dict.fromkeys(("missing", "conflicting", "derived"), 0))
    # Sums recomputed from named points; other derived values are described.
    counts["derived_checked"] = 0

    def add(target: list[dict[str, str]], path: str, code: str, message: str):
        target.append({"path": path, "code": code, "message": message})

    if not data.series or len(data.series) > MAX_SERIES:
        add(issues, "series", "series_count", f"Use 1 to {MAX_SERIES} series.")
        return {"issues": issues, "warnings": warnings, "summary": counts}

    text = visible_text(html)
    shown_numbers = _numbers(text)
    folded_text = _fold(text)
    # Point lookup per series, so derived inputs can name points in any series.
    by_series = [{p.label.strip(): p for p in s.points} for s in data.series]

    for s_index, series in enumerate(data.series):
        s_path = f"series[{s_index}]"
        if not series.name.strip() or len(series.name) > MAX_TEXT_CHARS:
            add(issues, s_path, "series_name_invalid", "Give the series a short name.")
        if not series.unit.strip():
            add(issues, s_path, "unit_missing", "State the unit of every series.")
        elif _fold(series.unit) not in folded_text:
            add(
                warnings,
                s_path,
                "unit_not_shown",
                f"Unit '{series.unit}' is not visible.",
            )
        if series.source is not None:
            _check_source(series.source, f"{s_path}.source", issues, add)
        if not series.points or len(series.points) > MAX_POINTS_PER_SERIES:
            add(
                issues,
                s_path,
                "point_count",
                f"Use 1 to {MAX_POINTS_PER_SERIES} points.",
            )
            continue

        # Labels must be unique so derived points can reference their inputs.
        by_label: dict[str, VisualDataPoint] = {}
        for point in series.points:
            if point.label.strip() in by_label:
                add(
                    issues, s_path, "duplicate_label", f"Label '{point.label}' repeats."
                )
            by_label[point.label.strip()] = point

        for p_index, point in enumerate(series.points):
            path = f"{s_path}.points[{p_index}]"
            counts["points"] += 1
            if point.status != "reported":
                counts[point.status] += 1
            if not point.label.strip() or len(point.label) > MAX_TEXT_CHARS:
                add(issues, path, "label_invalid", "Give the point a short label.")
            if point.value is not None and not math.isfinite(point.value):
                add(issues, path, "value_invalid", "Values must be finite numbers.")
                continue

            # Every non-derived value needs provenance on the point or series.
            source = point.source or series.source
            if point.source is not None:
                _check_source(point.source, f"{path}.source", issues, add)
            if source is None and point.status in ("reported", "missing"):
                add(issues, path, "source_missing", "Give a series or point source.")
            if point.alternatives and point.status != "conflicting":
                add(
                    issues,
                    path,
                    "alternatives_unexpected",
                    "Only conflicting points list alternatives.",
                )
            if point.derived_from and point.status != "derived":
                add(
                    issues,
                    path,
                    "derived_from_unexpected",
                    "Only derived points list inputs.",
                )

            # Status-specific rules keep missing distinct from zero and keep
            # disagreeing sources visible instead of silently picking one.
            if point.status == "reported":
                if point.value is None:
                    add(
                        issues,
                        path,
                        "value_missing",
                        "Reported points need a value; use status missing.",
                    )
                elif not _shown(point.value, shown_numbers):
                    add(
                        warnings,
                        path,
                        "value_not_shown",
                        f"{_fmt(point.value)} is not printed in the visual.",
                    )
            elif point.status == "missing":
                if point.value is not None:
                    add(
                        issues,
                        path,
                        "missing_has_value",
                        "Missing points must have value null, not 0.",
                    )
                if _fold(point.label) not in folded_text:
                    add(
                        warnings,
                        path,
                        "missing_not_shown",
                        f"Gap '{point.label}' is not labelled in the visual.",
                    )
            elif point.status == "conflicting":
                _check_conflict(point, path, shown_numbers, issues, warnings, add)
            else:
                inputs = _resolve_inputs(point, s_index, data.series, by_series)
                checked = _check_derived(
                    point,
                    path,
                    series.unit,
                    inputs,
                    shown_numbers,
                    issues,
                    warnings,
                    add,
                )
                counts["derived_checked"] += checked

    return {"issues": issues, "warnings": warnings[:MAX_WARNINGS], "summary": counts}


def visible_text(html: str) -> str:
    """Return the text a reader can see: tags, comments and hidden elements removed.

    The hidden set mirrors app/utils/visual_html.py: these are dropped by the
    sanitizer or never painted, so a value only inside them is not "shown".
    """
    without_code = re.sub(
        r"<!--.*?-->|<(script|style|noscript|template|title|desc|metadata|"
        r"foreignObject)\b.*?</\1\s*>",
        " ",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    without_tags = re.sub(r"<[^>]+>", " ", without_code)
    return html_lib.unescape(without_tags)


def _check_source(source, path, issues, add) -> None:
    """Require a document locator so the value can be traced to an excerpt."""
    if not source.label.strip() or len(source.label) > MAX_TEXT_CHARS:
        add(issues, path, "source_label_invalid", "Give the source a short label.")
    if source.kind == "document" and (
        source.source_index is None
        or source.source_index < 1
        or not (source.locator or "").strip()
    ):
        add(
            issues,
            path,
            "source_locator_missing",
            "Document sources need source_index and page or anchor.",
        )


def _check_conflict(point, path, shown_numbers, issues, warnings, add) -> None:
    """Conflicts keep at least two distinct sourced values, each visible."""
    alternatives = point.alternatives or []
    if len({a.value for a in alternatives}) < 2 or len(alternatives) > MAX_ALTERNATIVES:
        add(
            issues,
            path,
            "conflict_alternatives",
            f"List 2 to {MAX_ALTERNATIVES} different sourced values.",
        )
        return
    if point.value is not None and point.value not in {a.value for a in alternatives}:
        add(
            issues,
            path,
            "conflict_value_unlisted",
            "A chosen value must be one of the alternatives.",
        )
    for a_index, alternative in enumerate(alternatives):
        a_path = f"{path}.alternatives[{a_index}]"
        _check_source(alternative.source, f"{a_path}.source", issues, add)
        if not _shown(alternative.value, shown_numbers):
            add(
                warnings,
                a_path,
                "value_not_shown",
                f"{_fmt(alternative.value)} is not printed in the visual.",
            )


def _check_derived(
    point, path, unit, inputs, shown_numbers, issues, warnings, add
) -> bool:
    """Check one derived point; return True when its sum was recomputed.

    ``inputs`` pairs each derived_from entry with the (point, unit) it names, or
    None when the entry describes an input in words (a histogram count, a
    factor from the question, an input missing from ``data``). Descriptions are
    accepted as provenance but never counted as checked: only a sum whose every
    input names a point is machine-checkable.
    """
    entries = [entry.strip() for entry in point.derived_from or []]
    if (
        point.value is None
        or not entries
        or not all(entries)
        or any(len(entry) > MAX_TEXT_CHARS for entry in entries)
    ):
        add(
            issues,
            path,
            "derived_inputs",
            "Derived points need a value and derived_from listing input point "
            "labels or a short description of each input.",
        )
        return False

    # A value computed from a gap or an open conflict would hide it.
    named = [found for found in inputs if found is not None]
    if any(p.value is None or p.status in ("missing", "conflicting") for p, _ in named):
        add(
            issues,
            path,
            "derived_from_unresolved",
            "Do not compute from missing or conflicting values; show them separately.",
        )
        return False

    checked = False
    if point.method == "sum" and len(named) == len(entries):
        if any(_fold(input_unit) != _fold(unit) for _, input_unit in named):
            add(
                issues,
                path,
                "derived_unit_mismatch",
                "A sum needs inputs in the unit of its series.",
            )
            return False
        total = sum(p.value for p, _ in named)
        if not _close(point.value, total):
            add(
                issues,
                path,
                "derived_sum_mismatch",
                f"Inputs sum to {_fmt(total)}, not {_fmt(point.value)}. "
                "If this is not a plain total, use method other.",
            )
            return False
        checked = True
    if not _shown(point.value, shown_numbers):
        add(
            warnings,
            path,
            "value_not_shown",
            f"{_fmt(point.value)} is not printed in the visual.",
        )
    return checked


def _resolve_inputs(point, s_index, all_series, by_series) -> list:
    """Pair each derived_from entry with the (point, unit) it names, or None.

    An entry names a point of its own series by label (see ``_input_label``),
    a point of another series as "Series name / label", or a label matched the
    same way in exactly one other series. A derived point never names itself.
    """
    own_label = point.label.strip()
    same = {k: v for k, v in by_series[s_index].items() if k != own_label}
    resolved = []
    for entry in (e.strip() for e in point.derived_from or []):
        label = _input_label(entry, same)
        if label is not None:
            resolved.append((same[label], all_series[s_index].unit))
            continue
        matches = []
        for index, series in enumerate(all_series):
            if index == s_index:
                continue
            name = series.name.strip()
            qualified = entry[len(name) :].lstrip() if entry.startswith(name) else ""
            if name and qualified.startswith("/"):
                label = qualified[1:].strip()
                if label in by_series[index]:
                    matches = [(by_series[index][label], series.unit)]
                    break
            label = _input_label(entry, by_series[index])
            if label is not None:
                matches.append((by_series[index][label], series.unit))
        resolved.append(matches[0] if len(matches) == 1 else None)
    return resolved


def _input_label(entry: str, by_label: dict[str, VisualDataPoint]) -> str | None:
    """Resolve a derived_from entry to a point label.

    Live runs wrote entries such as "2019: 21.4 ktCO2e (p. 2)", so an entry that
    starts with a label followed by a non-alphanumeric character also counts;
    the longest such label wins.
    """
    entry = entry.strip()
    if entry in by_label:
        return entry
    prefixes = [
        label
        for label in by_label
        if label and entry.startswith(label) and not entry[len(label)].isalnum()
    ]
    return max(prefixes, key=len, default=None)


# Thousands separators are only commas followed by exactly three digits, so a
# list such as "12, 18" stays two numbers.
_NUMBER = re.compile(r"(?<![\d.])[-−]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?")


def _numbers(text: str) -> list[tuple[float, float]]:
    """Return each visible number with half a unit of its last printed digit."""
    numbers = []
    for match in _NUMBER.findall(text):
        decimals = len(match.split(".")[1]) if "." in match else 0
        value = float(match.replace(",", "").replace("−", "-"))
        numbers.append((value, 0.5 * 10**-decimals))
    return numbers


def _shown(value: float, shown_numbers: list[tuple[float, float]]) -> bool:
    """True if some printed number is this value rounded to its precision."""
    # A sign may be carried by words ("reduction of 5"), so compare magnitudes.
    return any(
        abs(abs(value) - abs(n)) <= half_step + SUM_TOLERANCE
        for n, half_step in shown_numbers
    )


def _close(a: float, b: float) -> bool:
    return abs(a - b) <= SUM_TOLERANCE * max(abs(a), abs(b), 1.0)


def _fold(text: str) -> str:
    """Compare units and labels ignoring case, spaces and subscript digits."""
    subscripts = str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789")
    return re.sub(r"\s+", "", text.translate(subscripts).casefold())


def _fmt(value: float) -> str:
    return f"{value:g}"
