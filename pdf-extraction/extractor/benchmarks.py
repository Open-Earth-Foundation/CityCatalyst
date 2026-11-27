"""Local demo cases and independent answer checks; expected values never enter prompts.

Product case IDs are retained, but this small scorer is not the CityCatalyst
production benchmark scorer. Public reports use separately named cases until their
bytes have been verified against the private canonical benchmark inputs.
"""

import hashlib
import json
import math
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "benchmarks"


def read_json(path: Path):
    """Read local UTF-8 JSON with BOM support."""
    return json.loads(path.read_text(encoding="utf-8-sig"))


def normalized(text) -> str:
    """Compare labels without case, accents, punctuation or repeated spaces."""
    text = unicodedata.normalize("NFKD", str(text))
    text = "".join(
        character for character in text if not unicodedata.combining(character)
    )
    return " ".join(re.findall(r"[a-z0-9]+", text.casefold()))


def matches(actual, expected, tolerance=0) -> bool:
    """Compare typed values, never coercing null/bools/strings into numbers."""
    if type(expected) in {int, float}:
        return (
            type(actual) in {int, float}
            and math.isfinite(actual)
            and abs(actual - expected) <= tolerance + 1e-9
        )
    if isinstance(expected, str):
        return isinstance(actual, str) and normalized(actual) == normalized(expected)
    return type(actual) is type(expected) and actual == expected


def pointer(data: dict, path: str):
    """Resolve RFC 6901 paths, distinguishing an absent value from explicit null."""
    current = data
    for part in path.split("/")[1:]:
        part = part.replace("~1", "/").replace("~0", "~")
        current = current[int(part)] if isinstance(current, list) else current[part]
    return current


class BenchmarkCatalog:
    """Resolve a fixed case catalogue under one directory, without arbitrary file access."""

    def __init__(self, root: Path = ROOT):
        """Load public fixture metadata and the pinned upstream 27-case manifest."""
        self.root = root.resolve()
        self.cases = {case["id"]: case for case in read_json(self.root / "cases.json")}
        for item in read_json(self.root / "references/real-cases.json"):
            self.cases[item["id"]] = {
                "id": item["id"],
                "group": "real",
                "label": f"{item['id']} · {item['city']} · {item['year']} · canonical",
                "city": item["city"],
                "year": item["year"],
                "pdf": ".local/pdfs/" + item["fileName"],
                "schema": "schemas/ghgi.schema.json",
                "prompt": "prompts/ghgi.md",
                "block": item["block"],
                "round": item.get("round"),
                "guidance": item.get(
                    "guidance",
                    (
                        "For this total-only target, select the explicitly reported gross community emissions total, keeping net emissions and removals separate. Do not choose a net headline in place of the requested gross boundary."
                        if item["totalOnly"]
                        else "Select the report's requested GPC inventory total and preserve its declared reporting boundary. Keep gross emissions, removals and net emissions separate; do not discard relevant AFOLU rows merely because their values are negative."
                    ),
                ),
                "total_only": item["totalOnly"],
                "source": "CityCatalyst Product PDF benchmark; canonical PDFs/keys supplied separately",
            }

    def get(self, case_id: str) -> dict:
        """Return known metadata only; caller-supplied IDs are never used as paths."""
        if case_id not in self.cases:
            raise ValueError("Unknown benchmark case.")
        return self.cases[case_id]

    def path(self, relative: str) -> Path:
        """Reject parent traversal and symlinks escaping the benchmark directory."""
        result = (self.root / relative).resolve()
        if not result.is_relative_to(self.root):
            raise ValueError("Benchmark file must stay inside its directory.")
        return result

    def product_key(self, case_id: str) -> dict | None:
        """Read private Product keys locally, never from a request or agent output."""
        path = self.root / ".local/answer-keys.json"
        return read_json(path).get("files", {}).get(case_id) if path.exists() else None

    def expected(self, case: dict) -> dict | None:
        """Read fixture/public spot checks or adapt a private Product key conservatively."""
        if case.get("expected"):
            path = self.path(case["expected"])
            expected = read_json(path) if path.exists() else None
            if (
                expected
                and case.get("related_case")
                and case["related_case"] in self.cases
            ):
                related = self.expected(self.get(case["related_case"]))
                if related:
                    expected["checks"].extend(
                        check
                        for check in related["checks"]
                        if "row" in check or "group" in check
                    )
                    expected[
                        "provenance"
                    ] += " Row checks use the related Product key; PDF byte identity is unverified."
            return expected
        key = self.product_key(case.get("key_case", case["id"]))
        if key is None:
            return None
        checks = [{"path": "/reporting_year", "value": key["year"]}]
        if key.get("expectedTotal") is not None:
            checks.append(
                {
                    **(
                        {"path": "/reported_total_tco2e"}
                        if case.get("total_only")
                        else {"aggregate": "inventory_total"}
                    ),
                    "value": key["expectedTotal"],
                    "tolerance": key.get("totalTolerance", 0),
                    "label": (
                        "Product total-only target"
                        if case.get("total_only")
                        else "Product inventory total from rows, with GPC exclusions (not necessarily the printed total)"
                    ),
                }
            )
        skipped = 0
        if not case.get("total_only"):
            for row in key.get("rows", []):
                # Ambiguous/unscored rows do not become precise scoring claims.
                if (
                    not row.get("scored")
                    or (
                        row.get("ambiguous")
                        and ".x" not in row.get("gpc", "").lower()
                        and "all scopes" not in row.get("gpc", "").lower()
                    )
                    or row.get("year") not in {None, key["year"]}
                ):
                    skipped += 1
                    continue
                code = re.match(r"[IVX]+\.\d+(?:\.\d+)?", row.get("gpc", ""))
                selector = {
                    "gpc_ref": code.group() if code else None,
                    "scope": (
                        int(row["scope"])
                        if str(row.get("scope", "")) in {"1", "2", "3"}
                        else None
                    ),
                }
                if not selector["gpc_ref"]:
                    skipped += 1
                    continue
                if row.get("value") is not None:
                    if (
                        ".x" in row.get("gpc", "").lower()
                        or "all scopes" in row.get("gpc", "").lower()
                    ):
                        checks.append(
                            {
                                "group": selector["gpc_ref"],
                                "value": row["value"],
                                "tolerance": key.get("tolerance", 0),
                                "label": row.get("description", ""),
                            }
                        )
                    else:
                        checks.append(
                            {
                                "row": selector,
                                "value": row["value"],
                                "tolerance": key.get("tolerance", 0),
                                "label": row.get("description", ""),
                            }
                        )
                elif row.get("notation"):
                    checks.append(
                        {
                            "row": selector,
                            "notation": row["notation"],
                            "label": row.get("description", ""),
                        }
                    )
        return {
            "provenance": "Local Product keys; demo check scorer, not production benchmark metrics.",
            "checks": checks,
            "skipped_key_rows": skipped,
        }

    def summary(self, case: dict) -> dict:
        """Expose readiness without expected answers or local absolute paths."""
        expected = self.expected(case)
        return {
            key: case.get(key)
            for key in (
                "id",
                "group",
                "label",
                "city",
                "year",
                "source",
                "block",
                "related_case",
            )
        } | {
            "pdf_ready": self.path(case["pdf"]).is_file(),
            "answers_ready": bool(expected and expected.get("checks")),
            "canonical_bytes_verified": False if case["group"] == "public" else None,
        }

    def listing(self) -> list[dict]:
        """List all cases, including missing canonical inputs rather than hiding them."""
        return [self.summary(case) for case in self.cases.values()]

    def load(self, case_id: str) -> dict:
        """Return only report instructions/schema; keep answer keys separate."""
        case = self.get(case_id)
        context = {key: case.get(key) for key in ("city", "year", "guidance")}
        prompt = (
            self.path(case["prompt"]).read_text(encoding="utf-8")
            + "\ncase_context: "
            + json.dumps(context)
        )
        return {
            **self.summary(case),
            "data_schema": read_json(self.path(case["schema"])),
            "user_prompt": prompt,
            "report_label": case["label"],
        }

    def verify(self, case_id: str, data: bytes) -> None:
        """Ensure automatic scoring is tied to exactly the selected PDF bytes."""
        case = self.get(case_id)
        path = self.path(case["pdf"])
        if (
            not path.is_file()
            or hashlib.sha256(data).digest()
            != hashlib.sha256(path.read_bytes()).digest()
        ):
            raise ValueError(
                "The report does not match this benchmark case. Load the case again or clear benchmark mode."
            )

    def evaluate(self, case_id: str, envelope: dict) -> dict:
        """Score a completed candidate independently; never feed expected values into repair."""
        case = self.get(case_id)
        expected = self.expected(case)
        if not expected or not expected.get("checks"):
            return {
                "case_id": case_id,
                "status": "unscored",
                "reason": "No expected answers installed. Extraction is available for manual review.",
            }
        data = (envelope.get("result") or {}).get("data", {})
        rows = data.get("rows", []) if isinstance(data.get("rows"), list) else []
        checks = []
        # Match row checks to distinct output rows. Use maximum bipartite matching,
        # so duplicate source rows cannot be counted repeatedly and order is irrelevant.
        candidates = {}
        for index, check in enumerate(expected["checks"]):
            if "aggregate" in check or "group" in check:
                selected = []
                invalid = False
                for row in rows:
                    if not isinstance(row, dict):
                        invalid = True
                        continue
                    value, code = row.get("emissions_tco2e"), row.get("gpc_ref")
                    if value is None:
                        continue
                    if type(value) not in {int, float} or not code:
                        invalid = True
                        continue
                    if check.get("group"):
                        if code != check["group"] and not code.startswith(
                            check["group"] + "."
                        ):
                            continue
                    elif (
                        code == "I.4.4"
                        or code.startswith("VI.")
                        or re.fullmatch(r"III\.\d+\.3", code)
                    ):
                        continue
                    selected.append(value)
                actual = sum(selected) if selected and not invalid else None
                checks.append(
                    {
                        **check,
                        "actual": actual,
                        "passed": matches(
                            actual, check["value"], check.get("tolerance", 0)
                        ),
                    }
                )
                continue
            if "path" in check:
                try:
                    actual = pointer(data, check["path"])
                    passed = matches(actual, check["value"], check.get("tolerance", 0))
                except (KeyError, IndexError, TypeError, ValueError):
                    actual, passed = "<missing>", False
                checks.append({**check, "actual": actual, "passed": passed})
                continue
            found = []
            selector = check["row"]
            for row_index, row in enumerate(rows):
                if not isinstance(row, dict):
                    continue
                if any(
                    value is not None and not matches(row.get(key), value)
                    for key, value in selector.items()
                    if key != "description_contains"
                ):
                    continue
                if selector.get("description_contains") and normalized(
                    selector["description_contains"]
                ) not in normalized(row.get("source_label", "")):
                    continue
                field, value = (
                    ("notation_key", check["notation"])
                    if "notation" in check
                    else ("emissions_tco2e", check["value"])
                )
                if matches(row.get(field), value, check.get("tolerance", 0)):
                    found.append(row_index)
            candidates[index] = found
            checks.append({**check, "actual": None, "passed": False})
        assigned = {}

        def assign(index, seen):
            """Find an unused matching row, moving prior assignments when needed."""
            for row_index in candidates[index]:
                if row_index in seen:
                    continue
                seen.add(row_index)
                if row_index not in assigned or assign(assigned[row_index], seen):
                    assigned[row_index] = index
                    return True
            return False

        for index in candidates:
            assign(index, set())
        for row_index, index in assigned.items():
            checks[index].update(
                actual=rows[row_index], passed=True, matched_row=row_index
            )
        passed = sum(check["passed"] for check in checks)
        return {
            "case_id": case_id,
            "status": "passed" if passed == len(checks) else "failed",
            "passed": passed,
            "total": len(checks),
            "checks": checks,
            "provenance": expected.get("provenance"),
            "skipped_key_rows": expected.get("skipped_key_rows", 0),
            "note": "Independent expected-value checks only. Not CityCatalyst production recall/precision, source verification, or evidence verification.",
        }
