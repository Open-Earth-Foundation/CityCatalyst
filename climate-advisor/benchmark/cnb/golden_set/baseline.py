"""Explicit baseline identity, comparable evaluation contracts, and review summaries."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote

from benchmark.cnb.golden_set.models import STAGES


def content_digest(value: Any) -> str:
    """Hash canonical JSON so equal-length edits cannot appear unchanged."""
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()


def artifact_digest(directory: Path) -> str:
    """Bind an approved run to all its reports, raw outputs, snapshot and PDFs."""
    return content_digest(
        {
            path.relative_to(directory).as_posix(): hashlib.sha256(
                path.read_bytes()
            ).hexdigest()
            for path in sorted(directory.rglob("*"))
            if path.is_file()
        }
    )


def evaluation_fingerprints(
    fixtures: list[Any],
    report: dict[str, Any],
    stages: list[str],
    input_path: str = "markdown",
) -> dict[str, str]:
    """Separate producer changes from the corpus and judge policy that must match."""
    corpus = [
        {
            "fixture": item.fixture.model_dump(mode="json"),
            "source": item.markdown,
            "drafting_input": item.drafting_input.model_dump(mode="json")
            if item.drafting_input
            else None,
            "reference_draft": item.reference_draft.model_dump(mode="json")
            if item.reference_draft
            else None,
        }
        for item in fixtures
    ]
    return {
        "corpus": content_digest(corpus),
        "judge_policy": content_digest(
            {
                "prompts": report.get("judge_prompt_versions"),
                "judge": report.get("models", {}).get("judge"),
                "stages": stages,
                "input_path": input_path,
                "comparison_policy": 1,
                "scorers": {
                    name: hashlib.sha256(
                        Path(__file__).with_name(name).read_text(encoding="utf-8").encode("utf-8")
                    ).hexdigest()
                    for name in (
                        "core.py",
                        "chapters.py",
                        "verification.py",
                        "editing.py",
                        "models.py",
                    )
                },
            }
        ),
    }


def load_approved_baseline(
    manifest_path: Path, results_dir: Path, fingerprints: dict[str, str]
) -> tuple[Path | None, dict[str, Any]]:
    """Validate approval, immutable content and evaluation compatibility; never promote runs."""
    if not manifest_path.exists():
        return None, {
            "status": "unavailable",
            "reason": "No approved baseline manifest",
        }
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if not isinstance(manifest, dict):
            raise ValueError("Baseline manifest must be a JSON object")
        if manifest.get("status") != "approved":
            return None, {
                "status": "unavailable",
                "reason": "Baseline is pending human approval",
            }
        approval = manifest.get("approval") or {}
        if not isinstance(approval, dict) or not all(
            isinstance(approval.get(key), str) and approval[key].strip()
            for key in ("reviewer", "approved_at", "reference")
        ):
            raise ValueError("Approved baseline lacks approval provenance")
        approved_at = datetime.fromisoformat(
            approval["approved_at"].replace("Z", "+00:00")
        )
        if approved_at.replace(tzinfo=approved_at.tzinfo or UTC) > datetime.now(UTC):
            raise ValueError("Baseline approval date is in the future")
        run_id = manifest["run_id"]
        if not isinstance(run_id, str) or not re.fullmatch(
            r"[A-Za-z0-9][A-Za-z0-9._-]{0,99}", run_id
        ):
            raise ValueError("Invalid baseline run ID")
        directory = results_dir / "runs" / run_id
        if not directory.resolve().is_relative_to(results_dir.resolve()):
            raise ValueError("Baseline run escapes the approved results directory")
        report_path = directory / "report.json"
        if (
            hashlib.sha256(report_path.read_bytes()).hexdigest()
            != manifest["report_sha256"]
        ):
            raise ValueError("Approved report content changed")
        if artifact_digest(directory) != manifest["artifact_sha256"]:
            raise ValueError("Approved run artifacts changed")
        report = json.loads(report_path.read_text(encoding="utf-8"))
        if not isinstance(report, dict):
            raise ValueError("Baseline report must be a JSON object")
        recorded = {
            "corpus": report.get("corpus_fingerprint"),
            "judge_policy": report.get("evaluator_fingerprint"),
        }
        if report.get("run_id") != run_id or recorded != manifest.get("fingerprints"):
            raise ValueError(
                "Baseline manifest does not match the saved report identity and fingerprints"
            )
        if not all(
            isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value)
            for value in recorded.values()
        ):
            raise ValueError("Baseline lacks evaluation fingerprints")
        if report.get("completed") is not True or report.get("run_errors"):
            raise ValueError("An incomplete evaluation cannot be an approved baseline")
        fixtures = report.get("fixtures", [])
        if not isinstance(fixtures, list) or not all(
            isinstance(item, dict) for item in fixtures
        ):
            raise ValueError("Baseline fixture reports must be JSON objects")
        expected = report.get("expected_fixture_ids", [])
        actual = [item["fixture_id"] for item in fixtures]
        stages = report.get("requested_stages", [])
        if (
            not expected
            or len(set(actual)) != len(actual)
            or set(actual) != set(expected)
            or not stages
            or set(stages) - set(STAGES)
        ):
            raise ValueError("Baseline report scope is incomplete")
        applicable = [item for item in fixtures if not item.get("inapplicable_reason")]
        if not applicable:
            raise ValueError("Baseline has no applicable fixtures")
        for fixture in applicable:
            if fixture.get("approval_status") != "approved" or fixture.get(
                "approval_errors"
            ):
                raise ValueError("Baseline ground truth is not approved")
            if any(
                not isinstance(fixture.get(stage), dict)
                or not fixture[stage].get("judgment")
                or fixture[stage].get("evaluation_errors")
                for stage in stages
            ):
                raise ValueError("Baseline contains unavailable judgments")
        if manifest.get("fingerprints") != fingerprints:
            return None, {
                "status": "incompatible",
                "reason": "Corpus, stages, input path or judge policy changed",
                "baseline_run_id": run_id,
            }
        if not (directory / "viewer.js").is_file():
            raise ValueError("Approved run has no immutable viewer snapshot")
        return directory, {
            "status": "comparable",
            "baseline_run_id": run_id,
            "approval": approval,
            "report_sha256": manifest["report_sha256"],
            "artifact_sha256": manifest["artifact_sha256"],
        }
    except (OSError, ValueError, KeyError, TypeError) as exc:
        return None, {"status": "incompatible", "reason": str(exc)}


def compare_reports(
    candidate: dict[str, Any], baseline: dict[str, Any] | None
) -> dict[str, Any]:
    """Keep quality findings and unavailable coverage independent, including mixed runs."""
    old = {f["fixture_id"]: f for f in (baseline or {}).get("fixtures", [])}
    new = {f["fixture_id"]: f for f in candidate.get("fixtures", [])}
    rows = []
    fixture_ids = (
        old.keys() | new.keys() | set(candidate.get("expected_fixture_ids", []))
    )
    for fid in sorted(fixture_ids):
        if new.get(fid, {}).get("inapplicable_reason"):
            continue
        for stage in STAGES:
            before, after = old.get(fid, {}).get(stage), new.get(fid, {}).get(stage)
            if (
                before is None
                and after is None
                and stage not in candidate.get("requested_stages", [])
            ):
                continue
            a, b = before or {}, after or {}
            failures_a = set(
                a.get("integrity_failures", []) + a.get("semantic_failures", [])
            )
            failures_b = set(
                b.get("integrity_failures", []) + b.get("semantic_failures", [])
            )
            failures_a.update(
                f"mandatory_pair:{pair}"
                for pair in a.get("details", {}).get("missing_mandatory_pairs", [])
            )
            failures_b.update(
                f"mandatory_pair:{pair}"
                for pair in b.get("details", {}).get("missing_mandatory_pairs", [])
            )
            errors = list(b.get("evaluation_errors", []))
            if not after or not b.get("judgment"):
                errors.append("Stage or valid judgment unavailable")
            comparable = bool(
                baseline
                and a.get("judgment")
                and not a.get("evaluation_errors")
                and b.get("judgment")
                and not errors
            )
            missing_a = set(a.get("details", {}).get("missing_mandatory_pairs", []))
            missing_b = set(b.get("details", {}).get("missing_mandatory_pairs", []))
            metrics = {
                key: {
                    "baseline": a.get("metrics", {}).get(key),
                    "candidate": b.get("metrics", {}).get(key),
                    "delta": b.get("metrics", {})[key] - a.get("metrics", {})[key]
                    if comparable
                    and key in a.get("metrics", {})
                    and key in b.get("metrics", {})
                    else None,
                }
                for key in sorted(
                    a.get("metrics", {}).keys() | b.get("metrics", {}).keys()
                )
            }
            rows.append(
                {
                    "fixture_id": fid,
                    "stage": stage,
                    "quality_failures": sorted(failures_b),
                    "new_failures": sorted(failures_b - failures_a)
                    if comparable
                    else [],
                    "resolved_failures": sorted(failures_a - failures_b)
                    if comparable
                    else [],
                    "new_missing_mandatory_ids": sorted(missing_b - missing_a)
                    if comparable
                    else [],
                    "resolved_mandatory_ids": sorted(missing_a - missing_b)
                    if comparable
                    else [],
                    "evaluation_errors": errors,
                    "metrics": metrics,
                    "details": b.get("details", {}),
                    "missing_mandatory_ids": b.get("details", {}).get(
                        "missing_mandatory_pairs", []
                    ),
                    "baseline_usage": old.get(fid, {}).get("usage", {}).get(stage),
                    "candidate_usage": new.get(fid, {}).get("usage", {}).get(stage),
                }
            )
    return {
        "candidate_run_id": candidate.get("run_id"),
        "rows": rows,
        "quality_regression": any(
            row["new_failures"] or row["new_missing_mandatory_ids"] for row in rows
        )
        if baseline
        else None,
        "quality_failures": any(row["quality_failures"] for row in rows),
        "evaluation_unavailable": candidate.get("completed") is False
        or bool(candidate.get("run_errors"))
        or not rows
        or any(row["evaluation_errors"] for row in rows),
        "baseline_wall_seconds": (baseline or {}).get("wall_seconds"),
        "candidate_wall_seconds": candidate.get("wall_seconds"),
    }


def render_comparison(comparison: dict[str, Any], delivery: dict[str, Any]) -> str:
    """Render the same comparison data consumed by the downloadable viewer."""
    selection = delivery.get("baseline", {})
    lines = [
        "# CNB benchmark review",
        "",
        f"Execution: **{delivery.get('execution', 'unknown')}**.",
        f"Approved baseline comparison: **{selection.get('status', 'unavailable')}** — {selection.get('reason', '')}",
        f"Ground truth awaiting approval: {delivery.get('approval_pending', [])}. Publication: **{delivery.get('publication', {}).get('status', 'preparing')}**.",
        f"Quality regression: **{comparison['quality_regression']}**; quality failures: **{comparison['quality_failures']}**; evaluation unavailable: **{comparison['evaluation_unavailable']}**.",
        "",
    ]
    lines.extend(f"- Execution error: {error}" for error in delivery.get("errors", []))
    for row in comparison["rows"]:
        fid, stage = row["fixture_id"], row["stage"]
        candidate = quote(str(comparison["candidate_run_id"]), safe="")
        link = f"index.html?run={candidate}#/f/{quote(fid, safe='')}/{stage}"
        lines += [f"## {fid} / {stage}", "", f"[Candidate evidence]({link})"]
        if selection.get("baseline_run_id"):
            lines.append(
                f"[Baseline evidence](index.html?run={quote(selection['baseline_run_id'], safe='')}#/f/{quote(fid, safe='')}/{stage})"
            )
        for key in (
            "new_failures",
            "resolved_failures",
            "new_missing_mandatory_ids",
            "resolved_mandatory_ids",
            "quality_failures",
            "evaluation_errors",
        ):
            lines.extend(
                f"- {key}: {' '.join(str(item).split())[:500]}" for item in row[key]
            )
        lines += [
            "",
            "| Metric | Baseline | Candidate | Delta |",
            "| --- | ---: | ---: | ---: |",
        ]
        lines.extend(
            f"| {key} | {values['baseline']} | {values['candidate']} | {values['delta']} |"
            for key, values in row["metrics"].items()
        )
        lines.append(
            f"\nUsage (baseline → candidate): `{json.dumps(row['baseline_usage'])}` → `{json.dumps(row['candidate_usage'])}`"
        )
        lines.append(
            f"\nChapter/mandatory evidence: `{json.dumps(row['details'], ensure_ascii=False)}`\n"
        )
    return "\n".join(lines) + "\n"
