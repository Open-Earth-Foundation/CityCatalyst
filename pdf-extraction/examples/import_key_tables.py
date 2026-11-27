"""Brief: Convert locally saved Product sheet tables into private benchmark JSON.

Inputs: --source-dir PATH with paired <n>-Files.md and <n>-Answer_keys.md exported
from the connected Sheets reader; --output PATH for local answer-keys.json.
Outputs: normalized JSON compatible with the demo's independent check scorer.
Does not contact Google, edit sheets, or supply keys to an extraction agent.
Usage (from repository root): cd pdf-extraction, then
.venv\\Scripts\\python.exe -m examples.import_key_tables
--source-dir benchmarks/.local/source-sheets --output benchmarks/.local/answer-keys.json
"""

import argparse
import json
import logging
import re
from pathlib import Path

LOGGER = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    """Parse local exported table directory and private JSON destination."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--source-dir",
        type=Path,
        required=True,
        help="Directory of paired Files/Answer_keys Markdown exports",
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Destination for private answer-key JSON",
    )
    return parser.parse_args()


def table(text: str) -> list[dict]:
    """Read a Markdown table from the Sheets connector, rejecting shifted columns."""
    header = None
    records = []
    for line in text.splitlines():
        if not line.startswith("|"):
            continue
        cells = [
            cell.strip().replace("\\|", "|")
            for cell in re.split(r"(?<!\\)\|", line.strip("|"))
        ]
        if cells[0] == "File ID":
            header = cells
        elif header and cells[0].startswith("C-"):
            if len(cells) > len(header):
                raise ValueError(
                    "Unexpected unescaped table delimiter; re-export the affected sheet."
                )
            records.append(dict(zip(header, cells + [""] * (len(header) - len(cells)))))
    if not header:
        raise ValueError("No File ID header found in exported table.")
    return records


def number(value: str) -> float | None:
    """Parse English-formatted numeric answer cells without interpreting prose."""
    value = value.replace(",", "").replace("−", "-").strip()
    return (
        float(value) if value and re.fullmatch(r"[-+]?\d+(?:\.\d*)?", value) else None
    )


def example_numbers(text: str) -> list[float]:
    """Mirror upstream parseNumbers for diagnostic distractor matching only.

    The upstream diagnostic parser extracts unsigned numbers, including years
    and GPC digits in prose. These are approximate flags, not extra precision
    penalties or proof that an unexpected value came from a particular passage.
    """
    result = []
    for token in re.findall(r"\d[\d.,]*\d|\d", text):
        dot, comma = token.rfind("."), token.rfind(",")
        if dot >= 0 and comma >= 0:
            decimal = "." if dot > comma else ","
            group = "," if decimal == "." else "."
            normalized = token.replace(group, "").replace(decimal, ".")
        elif dot >= 0 or comma >= 0:
            separator = "." if dot >= 0 else ","
            parts = token.split(separator)
            grouped = (
                len(parts) > 2
                or (len(parts) == 2 and len(parts[1]) == 3 and separator == ".")
                or (separator == "," and re.fullmatch(r"\d{1,3}(,\d{3})+", token))
            )
            normalized = "".join(parts) if grouped else ".".join(parts)
        else:
            normalized = token
        try:
            result.append(float(normalized))
        except ValueError:
            continue
    return result


def convert(source: Path) -> dict:
    """Combine all exported workbooks, preserving source notes and scored flags."""
    result = {
        "files": {},
        "provenance": "Product sheets read through the connected Google Sheets tool, 2026-11-17; private local snapshot.",
    }
    for path in sorted(source.glob("*-Files.md")):
        files = table(path.read_text(encoding="utf-8"))
        rows = table(
            path.with_name(path.name.replace("-Files.md", "-Answer_keys.md")).read_text(
                encoding="utf-8"
            )
        )
        for file in files:
            year_match = re.search(r"\d{4}", file.get("Year to select", ""))
            if not year_match:
                raise ValueError("Missing inventory year for " + file["File ID"])
            tolerance = file.get("Tolerance", "")
            numbers = re.findall(r"±\s*([\d,.]+)\s*t", tolerance)
            total_match = re.search(r"total\s*±\s*([\d,.]+)\s*t", tolerance, re.I)
            result["files"][file["File ID"]] = {
                "id": file["File ID"],
                "city": file.get("City"),
                "country": file.get("Country"),
                "year": int(year_match.group()),
                "expectedTotal": number(file.get("Expected total (tCO2e)", "")),
                "tolerance": number(numbers[0]) if numbers else 0,
                "totalTolerance": (
                    number(total_match[1])
                    if total_match
                    else number(numbers[0]) if numbers else 0
                ),
                "toleranceText": tolerance,
                "rows": [],
                "distractors": [],
                "distractorsImported": False,
            }
            for column, field in [
                ("Printed unit", "printedUnit"),
                ("Printed decimals", "printedDecimals"),
                ("Total printed decimals", "totalPrintedDecimals"),
            ]:
                value = file.get(column, "").strip()
                if value:
                    result["files"][file["File ID"]][field] = (
                        value if field == "printedUnit" else int(value)
                    )
        for row in rows:
            target = result["files"].get(row["File ID"])
            if target is None:
                raise ValueError("Answer row has no file record: " + row["File ID"])
            flag = row.get("Scored", "").strip().lower()
            year = number(row.get("Year", ""))
            target["rows"].append(
                {
                    "row": number(row.get("Row", "")),
                    "description": row.get("Description in source", ""),
                    "year": int(year) if year else None,
                    "value": number(row.get("Expected value (tCO2e)", "")),
                    "gpc": row.get("Expected GPC ref", ""),
                    "scope": row.get("Expected GPC scope", ""),
                    "ambiguous": row.get("Ambiguous?", "").lower() == "yes",
                    "rowType": row.get("Row type", ""),
                    "notation": row.get("Expected notation key", ""),
                    "scored": (
                        flag == "yes"
                        if flag
                        else row.get("Row type", "").startswith("Value")
                    ),
                    "note": row.get("Note / rule applied", ""),
                }
            )
        distractor_path = path.with_name(
            path.name.replace("-Files.md", "-Distractors.md")
        )
        if distractor_path.exists():
            for file in files:
                result["files"][file["File ID"]]["distractorsImported"] = True
            for item in table(distractor_path.read_text(encoding="utf-8")):
                # Match the upstream exporter: a composite File ID cell is not
                # silently expanded into guessed case IDs.
                target = result["files"].get(item["File ID"].strip())
                if target is not None:
                    examples = item.get("Example value(s)", "")
                    target["distractors"].append(
                        {
                            "where": item.get("Where", ""),
                            "what": item.get("What it is", ""),
                            "examples": examples,
                            "numbers": example_numbers(examples),
                            "failureMode": item.get("Failure mode if stored", ""),
                        }
                    )
    if not result["files"]:
        raise ValueError("No Product files were found.")
    return result


def main() -> None:
    """Write the private local key snapshot and print only counts, never key values."""
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    result = convert(args.source_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    LOGGER.info(
        "Saved %s case keys (%s rows) to %s",
        len(result["files"]),
        sum(len(file["rows"]) for file in result["files"].values()),
        args.output,
    )


if __name__ == "__main__":
    main()
