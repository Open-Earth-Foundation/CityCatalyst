"""Score a completed document workspace's file sorting and point findings.

Inputs: --workspace is a JSON workspace GET immediately after file reading;
--answer-key is the externally maintained grant key; --policy is the file/category,
held-row and threshold agreement; --chapter-report is an existing CNB gold report.
--output is the destination directory. --judgments optionally supplies a previous
semantic review for precisely the same inputs. Without it, the configured golden
judge uses OPENROUTER_API_KEY. No key or reference answers are sent to the reader.
Outputs: scores.json, report.html, and reusable meaning judgments.

From climate-advisor with service on PYTHONPATH:
python -m benchmark.cnb.scripts.score_points --workspace run.json --answer-key key.json
    --policy benchmark/cnb/fixtures/krosno-eucf-scoring.json --output output/point-score
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
from collections import Counter, defaultdict
from datetime import UTC, datetime
from hashlib import sha256
from html import escape
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
DEFAULT_CHAPTER_REPORT = BASE / "results/runs/20261014-232449-five-fixes/report.json"


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def name(stem):
    """Consistently identify the original across PDF, transcript and OCR text."""
    return Path(stem).stem.casefold()


def build_rows(workspace, key, policy):
    """Compare eligible file citations to the key before a bilingual meaning check."""
    if workspace["setup"]["document_type"] != policy["document_type"]:
        raise ValueError("Workspace and scoring policy use different document setups")
    expected_files = {name(f): c for f, c in policy["file_categories"].items()}
    allowed_files = {name(f) for f in key["documents_allowed"]}
    if expected_files.keys() != allowed_files:
        raise ValueError("Policy must name exactly the answer key's allowed files")
    placed = defaultdict(list)
    labels = {}
    for need in workspace["needs"]:
        for file in need["documents"]:
            stem = name(file["filename"])
            if stem not in allowed_files or not file["ready"]:
                raise ValueError(
                    "The snapshot contains an unexpected or unfinished source"
                )
            placed[stem].append(need["key"])
            labels[file["source_label"]] = stem
    if placed.keys() != expected_files.keys():
        raise ValueError("Reading has not finished for every allowed file")
    sorting = [
        {
            "file": f,
            "expected": c,
            "actual": placed[name(f)],
            "correct": placed[name(f)] == [c],
        }
        for f, c in policy["file_categories"].items()
    ]
    points = {p["key"]: p for p in workspace["points"]}
    if points.keys() != {p["key"] for p in key["points"]}:
        raise ValueError("Workspace setup points must match every key point")
    rows = []
    review = []
    for reference in key["points"]:
        point = points[reference["key"]]
        gold = reference["in_documents"]
        expected = gold["status"]
        if point.get("answer_status", "missing") != "missing" or any(
            c["status"] in {"dismissed", "accepted"} for c in point["candidates"]
        ):
            raise ValueError(
                "Use the pre-human snapshot, before any confirmation or rejection"
            )
        claims = []
        for candidate in point["candidates"]:
            if candidate["status"] not in {"pending", "context"}:
                continue
            citations = [
                c for c in candidate["citations"] if c["source_label"] in labels
            ]
            if citations:
                claims.append((candidate, citations))
        observed = (
            "found"
            if any(c["status"] == "pending" for c, _ in claims)
            else "partly"
            if claims
            else "not_found"
        )
        outcome = (
            "missing correctly"
            if expected == observed == "not_found"
            else "missed"
            if observed == "not_found"
            else "wrong"
        )
        row = {
            "key": reference["key"],
            "point": point["label"],
            "expected": expected,
            "observed": observed,
            "outcome": outcome,
            "held": reference["key"] in policy["held_for_review"],
            "distinct_proposed_values": len(
                {
                    json.dumps(c["value"], sort_keys=True)
                    for c, _ in claims
                    if c["status"] == "pending"
                }
            ),
            "reason": "",
            "file": gold.get("file"),
            "page": gold.get("page"),
        }
        if expected == observed and observed != "not_found":
            matches = []
            target_file = name(gold["file"]) if gold.get("file") else None
            for candidate, citations in claims:
                if (candidate["status"] == "context") != (expected == "partly"):
                    continue
                for c in citations:
                    page = c.get("page_number")
                    if not page and (
                        pages := re.findall(
                            r"(?:^|/)page-(\d+)(?=/|$)", c.get("source_anchor") or ""
                        )
                    ):
                        page = int(pages[-1])
                    if (
                        labels[c["source_label"]] == target_file
                        and page
                        and gold.get("page")
                        and abs(page - gold["page"]) <= 1
                    ):
                        matches.append(
                            {
                                "value": candidate["value"],
                                "quote": c["quote"],
                                "page": page,
                            }
                        )
            if matches:
                review.append(
                    {
                        "key": reference["key"],
                        "support": expected,
                        "reference": gold["value_en"],
                        "quote": gold["quote_pl"],
                        "candidates": matches,
                    }
                )
            else:
                row["reason"] = (
                    "No matching citation from the reference file within one page."
                )
        rows.append(row)
    return sorting, rows, review


async def judge(rows):
    """Ask the configured gold judge only about citation-eligible claims."""
    if not rows:
        return {}, None
    from app.config.settings import get_settings
    from app.services.openrouter_client import build_openrouter_client_options
    from openai import AsyncOpenAI

    settings = get_settings()
    model = settings.llm.models.cnb_golden_set_judge
    prompt = (BASE / "prompts/point_meaning.md").read_text(encoding="utf-8")
    options = build_openrouter_client_options(
        settings, missing_api_key_message="A golden-set judge is required"
    )
    ratings = {}
    async with AsyncOpenAI(**options.kwargs) as client:
        for start in range(0, len(rows), 5):
            batch = rows[start : start + 5]
            result = await client.chat.completions.create(
                model=model.name,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": json.dumps(batch, ensure_ascii=False)},
                ],
                extra_body={"reasoning": {"effort": model.reasoning_effort}},
                timeout=180,
            )
            values = json.loads(result.choices[0].message.content)["rows"]
            if len(values) != len(batch) or {r["key"] for r in values} != {
                r["key"] for r in batch
            }:
                raise ValueError("Judge returned different point keys")
            for row in values:
                if not isinstance(row["matches"], bool) or not isinstance(
                    row["reason"], str
                ):
                    raise TypeError("Invalid semantic judgment")
                ratings[row["key"]] = row
    return ratings, model.name


def metrics(rows, sorting):
    counts = Counter(r["outcome"] for r in rows)

    def ratio(n, d):
        return n / d if d else None

    return {
        "points": len(rows),
        "counts": dict(counts),
        "sorting_files": len(sorting),
        "correctly_sorted_files": sum(r["correct"] for r in sorting),
        "reported_findings": counts["right"] + counts["wrong"],
        "expected_findings": sum(r["expected"] != "not_found" for r in rows),
        "points_with_competing_values": sum(
            r["distinct_proposed_values"] > 1 for r in rows
        ),
        "sorting": ratio(sum(r["correct"] for r in sorting), len(sorting)),
        "precision": ratio(counts["right"], counts["right"] + counts["wrong"]),
        "recall": ratio(
            counts["right"], sum(r["expected"] != "not_found" for r in rows)
        ),
    }


def write_html(report, path):
    """Render the real run in a portable file that includes every scored point."""
    esc = lambda x: escape(str(x))

    def table(headers, rows):
        return (
            "<table><thead><tr>"
            + "".join("<th>" + esc(h) + "</th>" for h in headers)
            + "</tr></thead><tbody>"
            + "".join(
                "<tr>" + "".join("<td>" + esc(cell) + "</td>" for cell in row) + "</tr>"
                for row in rows
            )
            + "</tbody></table>"
        )

    def percent(value):
        return "—" if value is None else f"{value:.1%}"

    results = table(
        [
            "Point group",
            "Points",
            "Right",
            "Wrong",
            "Missed",
            "Correct gaps",
            "Precision",
            "Recall",
            "Competing values",
        ],
        [
            [
                label,
                m["points"],
                *(
                    m["counts"].get(k, 0)
                    for k in ("right", "wrong", "missed", "missing correctly")
                ),
                f"{m['counts'].get('right', 0)}/{m['reported_findings']} · {percent(m['precision'])}",
                f"{m['counts'].get('right', 0)}/{m['expected_findings']} · {percent(m['recall'])}",
                m["points_with_competing_values"],
            ]
            for label, m in report["metrics"].items()
        ],
    )
    filing = table(
        ["Source document", "Expected category", "Actual category"],
        [[r["file"], r["expected"], ", ".join(r["actual"])] for r in report["sorting"]],
    )
    chapters = table(
        [
            "Fixture in earlier chapter benchmark",
            "Required fact coverage",
            "Claim support",
        ],
        [
            [r["fixture"], percent(r["coverage"]), percent(r["support"])]
            for r in report["chapter_gold"]["fixtures"]
        ],
    )
    points = table(
        ["Point", "Reference", "Reader", "Verdict", "Reference page", "Review"],
        [
            [
                r["point"],
                r["expected"],
                r["observed"],
                r["outcome"],
                r["page"] or "—",
                "Held · " + r["reason"] if r["held"] else r["reason"],
            ]
            for r in report["points"]
        ],
    )
    page = f"""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Grant evidence benchmark</title>
<style>body{{font:16px/1.45 system-ui,sans-serif;color:#172b39;background:#f9fbfa;margin:36px auto;max-width:1180px;padding:0 20px}}h1{{font-size:38px;margin-bottom:8px}}h2{{margin:26px 0 8px;font-size:21px}}p{{max-width:90ch}}table{{border-collapse:collapse;width:100%;background:white}}th,td{{padding:9px 12px;text-align:left;border-bottom:1px solid #d7e0dc}}th{{background:#e5efe9;color:#174637}}.status{{font-weight:650;color:#855719}}</style>
<h1>Grant evidence benchmark</h1><p>{esc(report["case"])}</p><p class="status">{esc(report["decision"])}</p><h2>Point finding</h2>{results}
<h2>Document sorting · {percent(report["metrics"]["All points"]["sorting"])}</h2>{filing}
<h2>Scoring policy</h2><p>{esc(report["policy"].get("approval_scope", ""))}</p><p>Reference status: {esc(report["answer_key_status"])}</p>
<h2>Earlier per-chapter gold benchmark</h2><p>Separate fixture results from {esc(report["chapter_gold"]["run"])}.</p>{chapters}
<h2>Point-by-point evidence</h2>{points}</html>"""
    path.write_text(page, encoding="utf-8")


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ["workspace", "answer-key", "policy", "output"]:
        parser.add_argument("--" + key, required=True, type=Path)
    parser.add_argument("--chapter-report", type=Path, default=DEFAULT_CHAPTER_REPORT)
    parser.add_argument(
        "--judgments", type=Path, help="Reuse judgments with the same input fingerprint"
    )
    return parser.parse_args()


def main():
    args = parse_args()
    workspace, key, policy = (
        read_json(p) for p in (args.workspace, args.answer_key, args.policy)
    )
    sorting, rows, review = build_rows(workspace, key, policy)
    digest = sha256(
        json.dumps(review, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()
    if args.judgments:
        judged = read_json(args.judgments)
        if judged["inputs_sha256"] != digest:
            raise ValueError("Judgments are for different inputs")
    else:
        ratings, model = asyncio.run(judge(review))
        judged = {"inputs_sha256": digest, "model": model, "rows": ratings}
    for row in rows:
        if row["key"] in judged["rows"]:
            rating = judged["rows"][row["key"]]
            row.update(
                outcome="right" if rating["matches"] else "wrong",
                reason=rating["reason"],
            )
    if set(judged["rows"]) != {r["key"] for r in review}:
        raise ValueError("Semantic judgments must cover every eligible point")
    results = {
        "Scorable points": metrics([r for r in rows if not r["held"]], sorting),
        "Held for Polish review": metrics([r for r in rows if r["held"]], sorting),
        "All points": metrics(rows, sorting),
    }
    chapter = read_json(args.chapter_report)
    passed = all(
        results["Scorable points"][k] is not None and results["Scorable points"][k] >= v
        for k, v in policy["thresholds"].items()
    )
    decision = (
        ("PASS" if passed else "BELOW THRESHOLDS")
        if policy.get("approved_by")
        else "Diagnostic run · answer key and pass marks pending approval"
    )
    report = {
        "case": key["case"],
        "created_at": datetime.now(UTC).isoformat(),
        "decision": decision,
        "answer_key_status": key["status"],
        "workspace_revision": workspace["revision"],
        "workspace_sha256": sha256(args.workspace.read_bytes()).hexdigest(),
        "setup_fingerprint": workspace["setup"]["fingerprint"],
        "answer_key_sha256": sha256(args.answer_key.read_bytes()).hexdigest(),
        "policy_sha256": sha256(args.policy.read_bytes()).hexdigest(),
        "policy": policy,
        "metrics": results,
        "sorting": sorting,
        "points": rows,
        "chapter_gold": {
            "run": chapter["run_id"],
            "fixtures": [
                {
                    "fixture": r["fixture_id"],
                    "coverage": r["extraction"]["metrics"].get(
                        "required_fact_coverage"
                    ),
                    "support": r["extraction"]["metrics"].get("claim_support_rate"),
                }
                for r in chapter["fixtures"]
            ],
        },
    }
    args.output.mkdir(parents=True, exist_ok=True)
    for filename, data in [("scores.json", report), ("judgments.json", judged)]:
        (args.output / filename).write_text(
            json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
        )
    write_html(report, args.output / "report.html")
    print(decision)
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
