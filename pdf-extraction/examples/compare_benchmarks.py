"""Brief: Compare saved demo outputs with the recorded CityCatalyst PDF benchmark.

Inputs:
- --run-dir PATH: repeatable saved runner directories; defaults to benchmarks/runs/*.
- --output PATH: report directory, default benchmarks/runs/comparison-current.
- Private local snapshots: .local/answer-keys.json, recorded-benchmark.json,
  comparison-source.json, and upstream/ with unchanged scorer TypeScript files.
- Node and the repository's app/node_modules/tsx; no environment keys required.
Outputs: comparison.md, scores.json and scoring-input.json in --output (replaced
on repeat). No API calls, new extraction turns, or feedback to agents.
Usage (from pdf-extraction):
.venv\\Scripts\\python.exe -m examples.compare_benchmarks
"""

import argparse
import hashlib
import json
import logging
import shutil
import subprocess
from pathlib import Path
from statistics import mean

from extractor.benchmarks import ROOT, read_json

LOGGER = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    """Parse saved run directories and the offline report destination."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--run-dir",
        type=Path,
        action="append",
        help="Saved run directory; repeat to combine runs",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "runs/comparison-current",
        help="Directory for replaceable offline reports",
    )
    return parser.parse_args()


def verify_sources(root: Path, manifest: dict) -> None:
    """Reject missing/modified cached upstream scoring logic using Git blob hashes."""
    sources = {
        root / ".local/upstream/app/src/backend/ingestion-benchmark" / name: sha
        for name, sha in manifest["scorer_files"].items()
    }
    sources[root / ".local/upstream/app/src/util/notation-keys.ts"] = manifest[
        "notation_sha"
    ]
    for path, expected in sources.items():
        data = path.read_bytes()
        actual = hashlib.sha1(
            b"blob " + str(len(data)).encode() + b"\0" + data
        ).hexdigest()
        if actual != expected:
            raise ValueError(f"Upstream source checksum mismatch: {path}")


def collect_attempts(
    root: Path, directories: list[Path]
) -> tuple[list[dict], list[dict]]:
    """Read completed jobs once, keeping original failures and revalidation visible."""
    cases = {item["id"]: item for item in read_json(root / "cases.json")}
    legacy = root / ".local/archive/cases.json"
    if legacy.exists():
        cases.update({item["id"]: item for item in read_json(legacy)})
    canonical = {
        item["id"]: item for item in read_json(root / "references/real-cases.json")
    }
    attempts, fixtures, seen = [], [], set()
    for directory in directories:
        run = read_json(directory / "run.json")
        for case_id in run["cases"]:
            if case_id not in cases and case_id not in canonical:
                raise ValueError(f"Unknown saved case: {case_id}")
            folder = directory / case_id
            original = (
                read_json(folder / "result.json")
                if (folder / "result.json").exists()
                else {"result": None, "execution_status": "failed"}
            )
            revalidated = folder / "revalidated-result.json"
            path = revalidated if revalidated.exists() else folder / "result.json"
            envelope = read_json(path)
            job_id = envelope.get("job_id")
            identity = (case_id, job_id or str(folder.resolve()))
            if identity in seen:
                continue
            seen.add(identity)
            metadata = cases.get(case_id, canonical.get(case_id))
            related = metadata.get("related_case", case_id)
            if related not in canonical:
                fixtures.append(
                    {
                        "case": case_id,
                        "checks": envelope.get("benchmark"),
                        "resultPath": str(path.resolve()),
                    }
                )
                continue
            attempts.append(
                {
                    "caseId": case_id,
                    "canonicalId": related,
                    "city": canonical[related]["city"],
                    "year": canonical[related]["year"],
                    "totalOnly": canonical[related]["totalOnly"],
                    "jobId": job_id,
                    "options": run.get("options", {}),
                    "resultPath": str(path.resolve()),
                    "revalidated": revalidated.exists(),
                    "originalPipelineAccepted": bool(original.get("result")),
                    "repair": envelope.get("repair", original.get("repair", {})),
                    "preprocessing": envelope.get(
                        "preprocessing", original.get("preprocessing", {})
                    ),
                    "envelope": envelope,
                }
            )
    if not attempts:
        raise ValueError(
            "No saved real-city results found in the selected directories."
        )
    return attempts, fixtures


def run_bridge(payload: dict, output: Path, root: Path = ROOT) -> dict:
    """Invoke the unchanged TypeScript scorer locally; fail without Node/tsx."""
    node = shutil.which("node")
    tsx = root.parents[1] / "app/node_modules/tsx/dist/cli.mjs"
    if not node or not tsx.exists():
        raise ValueError(
            "Node and app/node_modules/tsx are required; install app dependencies first."
        )
    output.mkdir(parents=True, exist_ok=True)
    input_path, score_path = output / "scoring-input.json", output / "scores.json"
    input_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    subprocess.run(
        [
            node,
            str(tsx),
            "--tsconfig",
            str(root / ".local/upstream/tsconfig.json"),
            str(root / "comparison-bridge.ts"),
            str(input_path.resolve()),
            str(score_path.resolve()),
        ],
        check=True,
        cwd=root,
    )
    return read_json(score_path)


def percent(value: float | None) -> str:
    """Format a measured rate without turning unavailable metrics into zeros."""
    return "N/A" if value is None else f"{value:.1%}"


def average(scores: list[dict], field: str) -> float | None:
    """Average available per-attempt metrics; do not invent total-only row scores."""
    values = [score[field] for score in scores if score.get(field) is not None]
    return mean(values) if values else None


def render_report(
    result: dict, manifest: dict, baseline: dict, fixtures: list[dict]
) -> str:
    """Explain per-case scores, original failures, adapter limits, and baseline scope."""
    lines = [
        "# Saved-output comparison with CityCatalyst",
        "",
        f"Recorded baseline: [{manifest['recorded_run']}]({manifest['recorded_report_url']}).",
        f"Baseline extraction model: `{baseline['extractionModel']}`; OCR: `{baseline['ocrModel']}`; {baseline['runsPerFile']} attempts per case.",
        "Demo initial runs: `gpt-6.1-sol`, medium reasoning, one attempt per city, at most one repair. See saved job settings when adding later runs.",
        "",
        "The same upstream PDF scorer and Product keys score both saved row arrays. This is an offline artifact comparison, not a fresh production run or CityCatalyst import test.",
        "",
        "| Case | Output | Attempts | Row recall | Row precision | Value accuracy | Classification | Row total passes |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for attempt in result["comparisons"]:
        old = [run["rescored"] for run in attempt["baseline"]]
        score = attempt["score"]
        for label, scores in [
            ("Recorded baseline", old),
            (
                "Demo accepted artifact" if attempt["revalidated"] else "Demo",
                [score] if score else [],
            ),
        ]:
            metrics = [
                percent(average(scores, field))
                for field in [
                    "rowRecall",
                    "rowPrecision",
                    "valueAccuracy",
                    "classificationAccuracy",
                ]
            ]
            count = len(old) if label == "Recorded baseline" else 1
            passed = sum(item["totalMatched"] for item in scores)
            lines.append(
                f"| {attempt['city']} {attempt['year']} ({attempt['canonicalId']}) | {label} | {count} | "
                + " | ".join(metrics)
                + f" | {passed}/{count} |"
            )

    for attempt in result["comparisons"]:
        score = attempt["score"]
        lines.extend(
            [
                "",
                f"### {attempt['caseId']} · {Path(attempt['resultPath']).parent.parent.name}",
                "",
            ]
        )
        if score:
            lines.append(
                f"Row sum: **{score['storedTotal']:,.0f} tCO2e**; key target: **{score['expectedTotal']:,.0f} tCO2e**; difference: **{score['totalDiffPct']:+.2f}%**."
            )
            lines.append(
                f"Printed total extracted: **{attempt['adapted']['reportedTotal']}**; matches key: **{attempt['reportedTotalMatched']}**. The printed total is a separate diagnostic, not the benchmark row-total test."
            )
            lines.append(
                f"Ambiguous field outcomes: **{attempt['ambiguousFields']}**; repairs used: **{attempt['repair'].get('repairs', 'unknown')}**; Mistral preprocessing: **{attempt['preprocessing'].get('ocr_provider', 'see run settings')}**."
            )
            if attempt["totalOnly"]:
                lines.append(
                    "This is a total-only case: row recall, precision and classification are intentionally N/A."
                )
            elif score["valueAccuracy"] != score["classificationAccuracy"]:
                lines.append(
                    f"Value accuracy among located references: {percent(score['valueAccuracy'])}; correct value-and-mapping matches: {score['matchedRows']}/{score['keyValueRows']}; subsector recall: {percent(score['subsectorRecall'])}. Matching numbers alone does not establish correct GPC/scope mapping."
                )
            if score["totalWithinTolerance"] is False:
                lines.append(
                    "The extracted rows do not reproduce the benchmark total. Check boundaries, omissions, duplicates and removals; a correct printed total does not resolve this failure."
                )
        else:
            lines.append(
                "No accepted result artifact: pipeline failed; accuracy is unavailable and total does not pass."
            )
        if attempt["revalidated"]:
            lines.append(
                f"**Revalidated artifact**: original pipeline accepted = {attempt['originalPipelineAccepted']}. The original failed output is preserved. A validator fix accepted the same final artifact without another agent turn or answer-key feedback. This is not an original end-to-end success."
            )
        if attempt["adapted"]["warnings"]:
            lines.extend(
                ["", "Adapter diagnostics:", ""]
                + [f"- {warning}" for warning in attempt["adapted"]["warnings"]]
            )
        lines.extend(["", f"Saved result: `{attempt['resultPath']}`."])
    lines.extend(
        [
            "",
            "## Interpretation and limits",
            "",
            "- Recall measures recovered expected rows; precision measures correct stored groups. Value accuracy is conditional on finding the expected references, so 100% does not establish full numeric coverage. Classification measures mapping among value matches. These follow the upstream scorer's aggregation rules. Subsector recall is broader and does not establish scope-level correctness.",
            "- Demo rows are adapted to stored-value shape. Missing GPC mappings remain unique UNMAPPED rows and count in totals/precision; they are not silently dropped. Only the scorer's fixed GPC exclusions set omit. No answer-row labels are used to remove demo values.",
            "- Kyoto's saved rows contain -247,000 tCO2e of removals: gross 5,923,000 becomes net 5,676,000. Its printed gross total passes, but this adapter's row sum fails the gross benchmark target. This exposes a boundary/aggregation gap.",
            "- Toronto has all 12 expected numbers and 100% subsector recall, but only 3 exact GPC/scope matches. Nine rows retain parent GPC codes with null scopes. The Product key expects explicit scope mappings; the scorer therefore gives 25% row recall and precision. This may reflect conservative abstention or a mapping gap and requires source review.",
            "- The publisher PDFs have not been verified byte-for-byte against the original shared Drive files. One attempt on two cities is not an overall quality comparison or evidence that either model is better. Toronto's revalidation also limits end-to-end claims.",
            "- Repair loops never saw expected answers. Evidence/quotes and ambiguous field decisions have not been independently checked by this scorer.",
            "- Product distractor diagnostics are not imported into this comparison; empty distractor arrays are not evidence of zero distractor errors. Row recall, precision, classification and totals do not depend on those diagnostic arrays.",
            f"- The current develop baseline snapshot had {manifest['current_develop_baseline_entries']} entries; the reference here is the latest recorded run located in PR #3424, not a verified current deployment.",
            "- No new extraction or OCR calls were made. The JSON files preserve the exact scoring inputs, detailed missing/unexpected rows, upstream file hashes, and source snapshot.",
        ]
    )
    if fixtures:
        lines.extend(["", "## Synthetic checks (no production baseline)", ""])
        for fixture in fixtures:
            check = fixture["checks"] or {}
            lines.append(
                f"- {fixture['case']}: {check.get('passed', '?')}/{check.get('total', '?')} selected checks; not a row-accuracy percentage."
            )
    return "\n".join(lines) + "\n"


def main() -> None:
    """Verify local inputs, score saved artifacts, and write a readable comparison."""
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    try:
        manifest = read_json(ROOT / ".local/comparison-source.json")
        verify_sources(ROOT, manifest)
        baseline = read_json(ROOT / ".local/recorded-benchmark.json")
        directories = (
            args.run_dir
            if args.run_dir is not None
            else sorted(path.parent for path in (ROOT / "runs").glob("*/run.json"))
        )
        attempts, fixtures = collect_attempts(ROOT, directories)
        payload = {
            "demo": attempts,
            "keys": read_json(ROOT / ".local/answer-keys.json")["files"],
            "baseline": baseline,
        }
        result = run_bridge(payload, args.output)
        result["source"] = manifest
        result["distractorDiagnostics"] = "not measured"
        (args.output / "scores.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        (args.output / "comparison.md").write_text(
            render_report(result, manifest, baseline, fixtures), encoding="utf-8"
        )
        LOGGER.info(
            "Compared %s real-city attempts. Report: %s",
            len(attempts),
            (args.output / "comparison.md").resolve(),
        )
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        LOGGER.error("Cannot compare saved runs: %s", error)
        raise SystemExit(2) from error


if __name__ == "__main__":
    main()
