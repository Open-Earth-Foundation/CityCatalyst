"""Explicit baseline identity, comparable evaluation contracts, and review summaries."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote

from benchmark.cnb.golden_set.judge import OUTPUT_TYPES
from benchmark.cnb.golden_set.models import STAGES


def content_digest(value: Any) -> str:
    """Hash canonical JSON so equal-length edits cannot appear unchanged."""
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()


def artifact_digest(directory: Path) -> str:
    """Bind an approved run to all its reports, raw outputs and snapshot."""
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
    judge: dict[str, Any] | None,
    judge_prompts: dict[str, str],
) -> dict[str, str]:
    """Fingerprint only what defines a score: the answer key and the judge.

    Pass every fixture in the corpus and all four judge prompts, not just the
    selected ones, so a partial run stays comparable on the scope it covers.
    Approval metadata and report fields are left out: re-approving a fixture or
    adding a report field does not change how outputs are judged.
    """
    corpus = [
        {
            "fixture": item.fixture.model_dump(mode="json", exclude={"approval"}),
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
                "prompts": judge_prompts,
                "judge": judge,
                "comparison_policy": 4,
                # Scoring, judge invocation and input-building code, and the judge's
                # structured-output schemas; not report contracts. A scorer-only change
                # can be applied to saved runs with scripts/rescore.py.
                "scorers": {
                    name: hashlib.sha256(
                        Path(__file__).with_name(name).read_text(encoding="utf-8").encode("utf-8")
                    ).hexdigest()
                    for name in (
                        "core.py", "chapters.py", "verification.py", "editing.py",
                        "judge.py", "workspace.py",
                    )
                },
                "judge_schemas": {
                    stage: content_digest(output.model_json_schema())
                    for stage, output in OUTPUT_TYPES.items()
                },
            }
        ),
    }


def incompatibility(baseline: dict[str, Any], candidate: dict[str, Any]) -> list[str]:
    """Why two saved reports' scores cannot be compared; the viewer applies the same rule."""
    keys = ("corpus_fingerprint", "evaluator_fingerprint")
    if not all(report.get(key) for report in (baseline, candidate) for key in keys):
        return ["a run predates evaluation fingerprints"]
    reasons = []
    if problem := baseline_execution_problem(baseline):
        reasons.append(problem)
    if baseline["corpus_fingerprint"] != candidate["corpus_fingerprint"]:
        reasons.append("fixtures or golden expectations changed")
    if baseline["evaluator_fingerprint"] != candidate["evaluator_fingerprint"]:
        reasons.append("judge model, prompts or scoring changed")
    return reasons


def _validate_baseline_scope(report: dict[str, Any], *, require_approval: bool = True) -> None:
    """Check execution and declared coverage. Promotion also requires human approval."""
    if report.get("completed") is not True or report.get("run_errors"):
        raise ValueError("Baseline evaluation is incomplete or contains run errors")
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
    for fixture in fixtures:
        if require_approval and (fixture.get("approval_status") != "approved" or fixture.get("approval_errors")):
            raise ValueError("Baseline ground truth is not approved")
        if any(
            not isinstance(fixture.get(stage), dict)
            or not fixture[stage].get("judgment")
            or fixture[stage].get("evaluation_errors")
            for stage in stages
        ):
            raise ValueError("Baseline contains unavailable judgments")


def baseline_execution_problem(report: dict[str, Any]) -> str | None:
    """Explain an unusable reference run independently of its promotion status."""
    try:
        _validate_baseline_scope(report, require_approval=False)
    except (ValueError, KeyError, TypeError) as exc:
        return str(exc)
    return None


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
        _validate_baseline_scope(report)
        if manifest.get("fingerprints") != fingerprints:
            return None, {
                "status": "incompatible",
                "reason": "Corpus, stages or judge policy changed",
                "baseline_run_id": run_id,
            }
        if not (directory / "viewer.js").is_file():
            raise ValueError("Approved run has no immutable viewer snapshot")
        repeat_ids = [
            _checked_repeat(results_dir, entry, report)
            for entry in manifest.get("repeats", [])
        ]
        if len(set([run_id, *repeat_ids])) != 1 + len(repeat_ids):
            raise ValueError("Baseline repeats must be distinct runs")
        return directory, {
            "status": "comparable",
            "baseline_run_id": run_id,
            "repeat_run_ids": repeat_ids,
            "approval": approval,
            "report_sha256": manifest["report_sha256"],
            "artifact_sha256": manifest["artifact_sha256"],
        }
    except (OSError, ValueError, KeyError, TypeError) as exc:
        return None, {"status": "incompatible", "reason": str(exc)}


# Verdict quality per judge vocabulary; an item regresses when its rank drops.
VERDICT_RANK = {
    "covered": 2, "partially_covered": 1, "missing": 0, "contradicted": -1,
    "satisfied": 2, "partially_satisfied": 1, "not_satisfied": 0,
    "flagged": 2, "partially_flagged": 1, "not_flagged": 0, "fabricated": -1,
    "detected": 2, "partially_detected": 1, "missed": 0,
    "in_chapter": 2, "misrouted": 1, "not_extracted": 0,
    "passed": 1, "failed": 0,
    "supported": 2, "partially_supported": 1, "uncertain": 0, "unsupported": 0,
}
LOWER_IS_BETTER = {
    "false_alarm_rate", "clean_false_alarm_rate", "false_alarms", "clean_false_alarms",
    "duplicate_findings",
    "unsupported_changes", "collateral_edits",
}
HIGHER_IS_BETTER_SUFFIXES = (
    "_rate", "_coverage", "_recall", "_validity", "_retained", "_in_chapter",
)


def metric_direction(key: str) -> str | None:
    """``higher``, ``lower``, or None for counts that only give context."""
    if key in LOWER_IS_BETTER:
        return "lower"
    return "higher" if key.endswith(HIGHER_IS_BETTER_SUFFIXES) else None


def verdict_items(stage: dict[str, Any]) -> dict[str, str]:
    """Stable item IDs and verdicts of one stage report, the unit of a regression.

    Items are expected facts, topics, gaps, chapters, seeded defects, edit cases
    and extraction evidence rows. Their IDs come from the golden set, so the
    judge's free-text reasons never decide what changed.
    """
    judgment = stage.get("judgment") or {}
    details = stage.get("details") or {}
    items = {}
    fields = (
        ("facts", "id"),
        ("topics", "id"),
        ("gaps", "id"),
        ("chapters", "chapter_ref"),
        ("defects", "id"),
    )
    for field, key in fields:
        for item in judgment.get(field) or []:
            items[f"{field[:-1]}:{item[key]}"] = item["verdict"]
    for case in details.get("cases") or []:
        if "passed" in case:
            items[f"case:{case['case_id']}"] = "passed" if case["passed"] else "failed"
    for row in details.get("evidence_retention") or []:
        items[f"evidence:{row['id']}"] = row["status"]
    return items


def _output_location(unit_id: str) -> str:
    """Use the receiving chapter and source anchor independently of quotation order."""
    return re.sub(r"^(retained/(?:[^/]+/)?)\d+/", r"\1", unit_id)


def _observed_failures(stage: dict[str, Any]) -> dict[str, str]:
    """Group structured quality failures by output location. Explanatory prose is ignored."""
    items = {f"integrity:{failure}": "failed" for failure in stage.get("integrity_failures", [])}
    judgment = stage.get("judgment") or {}
    for claim in judgment.get("claims", []):
        location = _output_location(claim["output"]["unit_id"])
        if not claim["self_contained"]:
            items[f"claim-context:{location}"] = "failed"
        for field in ("verdict", "supplied_verdict"):
            verdict = claim.get(field)
            if verdict is None or verdict == "supported":
                continue
            key = f"claim-{field}:{location}"
            if VERDICT_RANK[verdict] < VERDICT_RANK[items.get(key, "supported")]:
                items[key] = verdict

    # Multiple distinct conflicts can involve the same output locations. Count each
    # distinct set of cited spans once and compare the counts, ignoring wording/order.
    groups = [("", judgment), *((f"{case['case_id']}:", case) for case in judgment.get("cases", []))]
    for prefix, group in groups:
        conflicts: dict[tuple[str, ...], set[tuple[tuple[str, str], ...]]] = {}
        for conflict in group.get("contradictions", []):
            spans = {(_output_location(ref["unit_id"]), ref["quote"]) for ref in conflict["output_refs"]}
            locations = tuple(sorted({location for location, _ in spans}))
            conflicts.setdefault(locations, set()).add(tuple(sorted(spans)))
        for locations, instances in conflicts.items():
            for index in range(1, len(instances) + 1):
                items[f"contradiction:{prefix}{' + '.join(locations)}#{index}"] = "failed"
    return items


def _include_observed_failures(stages: list[dict[str, Any]], items: list[dict[str, str]]) -> None:
    """Compare the union of observed issues, using a healthy verdict for an absent issue."""
    observations = [_observed_failures(stage) for stage in stages]
    for key in set().union(*(mapping.keys() for mapping in observations)):
        healthy = "supported" if key.startswith(("claim-verdict:", "claim-supplied_verdict:")) else "passed"
        for verdicts, observed in zip(items, observations, strict=True):
            verdicts[key] = observed.get(key, healthy)


def _metric_change(key: str, values: list[float], candidate: float | None) -> dict[str, Any]:
    """Delta against the baseline, and a status against the baseline runs' spread."""
    baseline = values[0] if values else None
    change: dict[str, Any] = {
        "baseline": baseline,
        "candidate": candidate,
        "delta": None,
        "range": None,
        "status": None,
    }
    if baseline is None or candidate is None:
        return change
    change["delta"] = candidate - baseline
    change["range"] = [min(values), max(values)]
    direction = metric_direction(key)
    if direction is None:
        return change
    low, high = change["range"]
    if low <= candidate <= high:
        change["status"] = "within_noise" if low < high else "same"
    else:
        up = candidate > high
        change["status"] = "better" if up == (direction == "higher") else "worse"
    return change


def repeat_problems(baseline: dict[str, Any], repeat: dict[str, Any]) -> list[str]:
    """Only independent runs of the same producer and scope can measure noise."""
    reasons = incompatibility(baseline, repeat)
    if not repeat.get("run_id") or repeat.get("run_id") == baseline.get("run_id"):
        reasons.append("repeat must have its own run ID")
    for key in ("code_version", "analysis_contract_version", "producer_prompt_versions",
                "models", "llm_config_sha256", "dependency_lock_sha256"):
        if not baseline.get(key) or baseline[key] != repeat.get(key):
            reasons.append(f"repeat producer identity differs or is unknown: {key}")
    for key in ("expected_fixture_ids", "requested_stages"):
        if set(baseline.get(key, [])) != set(repeat.get(key, [])):
            reasons.append(f"repeat scope differs: {key}")
    try:
        _validate_baseline_scope(repeat)
    except (ValueError, KeyError, TypeError) as exc:
        reasons.append(str(exc))
    return reasons


def _checked_repeat(results_dir: Path, entry: Any, baseline: dict[str, Any]) -> str:
    """Validate one repeat run of the baseline configuration and return its run ID.

    A repeat must be committed unchanged, complete, and scored under the same
    fingerprints; it only measures noise and is never a baseline on its own.
    """
    run_id = entry["run_id"]
    if not isinstance(run_id, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,99}", run_id):
        raise ValueError("Invalid baseline repeat run ID")
    directory = results_dir / "runs" / run_id
    report_path = directory / "report.json"
    if hashlib.sha256(report_path.read_bytes()).hexdigest() != entry["report_sha256"]:
        raise ValueError(f"Baseline repeat {run_id} report changed")
    if artifact_digest(directory) != entry["artifact_sha256"]:
        raise ValueError(f"Baseline repeat {run_id} artifacts changed")
    report = json.loads(report_path.read_text(encoding="utf-8"))
    if report.get("run_id") != run_id:
        raise ValueError(f"Baseline repeat {run_id} report identity differs")
    problems = repeat_problems(baseline, report)
    if problems:
        raise ValueError(f"Baseline repeat {run_id}: {', '.join(problems)}")
    return run_id


def load_repeat_reports(baseline_dir: Path, selection: dict[str, Any]) -> list[dict[str, Any]]:
    """Reports of the validated baseline repeats, which set the noise range."""
    return [
        json.loads((baseline_dir.parent / run_id / "report.json").read_text(encoding="utf-8"))
        for run_id in selection.get("repeat_run_ids", [])
    ]


def compare_reports(
    candidate: dict[str, Any],
    baseline: dict[str, Any] | None,
    repeats: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Compare a candidate with the baseline by item verdicts and metrics.

    ``repeats`` are other runs of the baseline configuration. Their spread is the
    noise range: a metric inside it is ``within_noise``, and an item whose verdict
    differs between the baseline runs is ``flaky`` rather than improved or
    regressed. Without repeats every change counts and ``noise_measured`` is false.
    ``outcome`` is improved, regressed, mixed, unchanged or unavailable.
    """
    baselines = [baseline, *(repeats or [])] if baseline else []
    execution_problem = baseline_execution_problem(baseline) if baseline else None
    old = [{f["fixture_id"]: f for f in report.get("fixtures", [])} for report in baselines]
    new = {f["fixture_id"]: f for f in candidate.get("fixtures", [])}
    rows = []
    # Compare only the candidate's scope; a partial run is not missing the rest.
    fixture_ids = set(candidate.get("expected_fixture_ids") or new.keys())
    stages = [s for s in STAGES if s in (candidate.get("requested_stages") or STAGES)]
    for fid in sorted(fixture_ids):
        for stage in stages:
            before = [report.get(fid, {}).get(stage) or {} for report in old]
            after = new.get(fid, {}).get(stage) or {}
            errors = list(after.get("evaluation_errors", []))
            if execution_problem:
                errors.append(execution_problem)
            if not after.get("judgment"):
                errors.append("Stage or valid judgment unavailable")
            usable = [a for a in before if a.get("judgment") and not a.get("evaluation_errors")]
            if len(usable) < len(before):
                errors.append(f"Baseline or repeat lacks a valid {fid}/{stage} judgment")
            comparable = bool(before) and not errors

            # A missing expected item makes the comparison incomplete.
            regressed, improved, flaky = [], [], []
            if comparable:
                base_items = [verdict_items(a) for a in usable]
                candidate_items = verdict_items(after)
                if any(previous.keys() != candidate_items.keys() for previous in base_items):
                    errors.append("Golden item IDs differ within the same fixture and stage")
                    comparable = False
                else:
                    _include_observed_failures([*usable, after], [*base_items, candidate_items])
                    for item, verdict in sorted(candidate_items.items()):
                        previous = [items[item] for items in base_items]
                        ranks = [VERDICT_RANK[v] for v in previous]
                        rank = VERDICT_RANK[verdict]
                        record = {"id": item, "before": previous[0], "after": verdict}
                        if rank < min(ranks):
                            regressed.append(record)
                        elif rank > max(ranks):
                            improved.append(record)
                        elif len(set(previous)) > 1:
                            flaky.append(record)

            # Step 2: metrics with direction and noise status.
            keys = sorted(
                {key for a in usable for key in a.get("metrics", {})}
                | after.get("metrics", {}).keys()
            )
            metrics = {
                key: _metric_change(
                    key,
                    [a["metrics"][key] for a in usable if key in a.get("metrics", {})]
                    if comparable
                    else [],
                    after.get("metrics", {}).get(key),
                )
                for key in keys
            }
            rows.append(
                {
                    "fixture_id": fid,
                    "stage": stage,
                    "regressed_items": regressed,
                    "improved_items": improved,
                    "flaky_items": flaky,
                    "quality_failures": sorted(
                        after.get("integrity_failures", []) + after.get("semantic_failures", [])
                    ),
                    "evaluation_errors": errors,
                    "metrics": metrics,
                    "baseline_usage": old[0].get(fid, {}).get("usage", {}).get(stage)
                    if old
                    else None,
                    "candidate_usage": new.get(fid, {}).get("usage", {}).get(stage),
                }
            )

    # Step 3: one outcome for the whole run.
    unavailable = (
        not baseline
        or candidate.get("completed") is False
        or bool(candidate.get("run_errors"))
        or not rows
        or any(row["evaluation_errors"] for row in rows)
    )
    worse = any(
        row["regressed_items"] or any(m["status"] == "worse" for m in row["metrics"].values())
        for row in rows
    )
    better = any(
        row["improved_items"] or any(m["status"] == "better" for m in row["metrics"].values())
        for row in rows
    )
    if not baseline or unavailable:
        outcome = "unavailable"
    elif worse:
        outcome = "mixed" if better else "regressed"
    else:
        outcome = "improved" if better else "unchanged"
    return {
        "candidate_run_id": candidate.get("run_id"),
        "baseline_run_ids": [report.get("run_id") for report in baselines],
        "noise_measured": len(baselines) > 1,
        "outcome": outcome,
        "rows": rows,
        "quality_regression": outcome in {"regressed", "mixed"} if baseline else None,
        "quality_failures": any(row["quality_failures"] for row in rows),
        "evaluation_unavailable": unavailable,
        "baseline_wall_seconds": (baseline or {}).get("wall_seconds"),
        "candidate_wall_seconds": candidate.get("wall_seconds"),
    }


def render_comparison(comparison: dict[str, Any], delivery: dict[str, Any]) -> str:
    """A short review summary: outcome, changed items, and directed metric changes."""
    selection = delivery.get("baseline", {})
    runs = len(comparison["baseline_run_ids"])
    noise = (
        f"noise range from {runs} baseline runs"
        if comparison["noise_measured"]
        else "noise not measured (one baseline run), so treat small changes as unconfirmed"
    )
    lines = [
        "# CNB benchmark review",
        "",
        f"**Outcome: {comparison['outcome']}**; {noise}.",
        f"Execution: **{delivery.get('execution', 'unknown')}**. Baseline: "
        f"**{selection.get('status', 'unavailable')}**: {selection.get('reason', '')}",
        f"Ground truth awaiting approval: {delivery.get('approval_pending', [])}. "
        f"Publication: **{delivery.get('publication', {}).get('status', 'preparing')}**.",
        "",
    ]
    lines.extend(f"- Execution error: {error}" for error in delivery.get("errors", []))
    candidate = quote(str(comparison["candidate_run_id"]), safe="")
    for row in comparison["rows"]:
        fid, stage = row["fixture_id"], row["stage"]
        link = f"index.html?run={candidate}#/f/{quote(fid, safe='')}/{stage}"
        lines += [f"## {fid} / {stage}", "", f"[Candidate evidence]({link})"]
        for key, label in (
            ("regressed_items", "Regressed"),
            ("improved_items", "Improved"),
            ("flaky_items", "Flaky across baseline runs"),
        ):
            lines.extend(
                f"- {label}: `{item['id']}` {item['before']} → {item['after']}"
                for item in row[key]
            )
        lines.extend(
            f"- Evaluation unavailable: {' '.join(str(e).split())[:300]}"
            for e in row["evaluation_errors"]
        )
        changed = {k: v for k, v in row["metrics"].items() if v["delta"]}
        if changed:
            lines += ["", "| Metric | Baseline | Candidate | Change |", "| --- | ---: | ---: | --- |"]
            lines.extend(
                f"| {key} | {_fmt(v['baseline'])} | {_fmt(v['candidate'])} | {v['status'] or 'context'} |"
                for key, v in changed.items()
            )
        lines.append("")
    return "\n".join(lines) + "\n"


def _fmt(value: float | None) -> str:
    """Short numeric table cell."""
    return "–" if value is None else f"{value:.2f}"
