"""Source-only GHGI consistency checks; never read benchmark answer keys.

These checks apply only to the supplied versioned demo schema. They provide
repair feedback on signs, roles, scope provenance and self-reported totals.
They do not independently establish whether a source value is correct.
"""

import math

SCHEMA_ID = "urn:oef:ghgi-extraction:2"


def numeric(value) -> bool:
    """Accept finite real numbers, excluding booleans and nulls."""
    return type(value) in {int, float} and math.isfinite(value)


def consistency_issues(data: dict, schema: dict) -> list[str]:
    """Return deterministic, answer-free issues for the GHGI v2 contract."""
    if schema.get("$id") != SCHEMA_ID:
        return []
    issues = []
    rows = data.get("rows", [])
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            continue
        prefix = f"/rows/{index}"
        value = row.get("emissions_tco2e")
        role = row.get("row_role")
        if numeric(value) and (
            (role == "removal" and value > 0) or (role == "emission" and value < 0)
        ):
            issues.append(
                prefix
                + ": row_role contradicts the signed emissions value; verify the source before changing either."
            )
        if row.get("scope_basis") == "combined" and row.get("scope") is not None:
            issues.append(
                prefix
                + "/scope: a combined-scope amount cannot be assigned one scope without a source-supported split."
            )
        if row.get("scope") is not None and row.get("scope_basis") == "unknown":
            issues.append(
                prefix
                + "/scope_basis: a populated scope needs an explicit or source-inferred basis."
            )
        if row.get("notation_key") is not None and value is not None:
            issues.append(
                prefix + ": notation and numeric value must not both be populated."
            )
        if (
            data.get("total_kind") == "gross"
            and role == "removal"
            and row.get("total_inclusion") == "included"
        ):
            issues.append(
                prefix
                + "/total_inclusion: removals cannot be included in a gross emissions total; retain the row and mark it excluded."
            )
    removals = data.get("reported_removals_tco2e")
    if numeric(removals) and removals > 0:
        issues.append(
            "/reported_removals_tco2e: represent reported removals as a negative amount, preserving the printed sign convention in evidence."
        )
    if "reconciliation_tolerance_tco2e" in data:
        included = [
            row
            for row in rows
            if isinstance(row, dict)
            and row.get("total_inclusion") == "included"
            and numeric(row.get("emissions_tco2e"))
        ]
        unclear = [
            row
            for row in rows
            if isinstance(row, dict) and row.get("total_inclusion") == "unclear"
        ]
        reported, tolerance = data.get("reported_total_tco2e"), data.get(
            "reconciliation_tolerance_tco2e"
        )
        if unclear:
            issues.append(
                "/rows: the selected total has unclear row-inclusion decisions; revisit source boundaries and keep genuine uncertainty explicit."
            )
        elif numeric(reported) and included:
            if not numeric(tolerance):
                issues.append(
                    "/reconciliation_tolerance_tco2e: establish the source's printed precision before claiming row-total reconciliation; keep null if unavailable."
                )
            else:
                total = sum(row["emissions_tco2e"] for row in included)
                if abs(total - reported) > tolerance + 1e-9:
                    issues.append(
                        f"/rows: source-based included row sum {total:.9g} differs from printed selected total {reported:.9g} beyond declared rounding tolerance {tolerance:.9g}. Recheck omissions, units, duplicates and boundaries. Preserve contradictory source facts; never alter them or enlarge tolerance to force equality."
                    )
    return issues


def repair_issues(envelope: dict) -> list[dict]:
    """Classify current output issues for durable per-turn comparison and review."""
    validation = envelope.get("validation", {})
    issues = []
    for category, values in [
        ("schema", validation.get("data_schema_errors", [])),
        ("coverage", validation.get("warnings", [])),
        ("consistency", validation.get("consistency_errors", [])),
    ]:
        issues.extend(
            {
                "category": category,
                "field_id": value.split(":", 1)[0] if value.startswith("/") else None,
                "message": value,
            }
            for value in values
        )
    for field in (envelope.get("result") or {}).get("fields", []):
        if field["status"] in {"ambiguous", "unreadable", "not_searched"}:
            issues.append(
                {
                    "category": field["status"],
                    "field_id": field["field_id"],
                    "message": f"{field['field_id']}: {field['status']}. {field['explanation']}",
                }
            )
    for issue in issues:
        issue["key"] = issue["category"] + ":" + (issue["field_id"] or issue["message"])
    return issues


def changed_fields(before: dict | None, after: dict | None) -> list[str]:
    """List changed data leaves without treating array reordering as field identity."""
    from extractor.schema import leaf_paths

    old, new = (before or {}).get("data", {}), (after or {}).get("data", {})

    def flatten(value):
        """Resolve JSON pointers generated by the schema's leaf iterator."""
        result = {}
        for path in leaf_paths(value, include_null=True):
            current = value
            for part in path.split("/")[1:]:
                part = part.replace("~1", "/").replace("~0", "~")
                current = (
                    current[int(part)] if isinstance(current, list) else current[part]
                )
            result[path] = current
        return result

    a, b = flatten(old), flatten(new)
    return sorted(
        path
        for path in a.keys() | b.keys()
        if path not in a or path not in b or a[path] != b[path]
    )
