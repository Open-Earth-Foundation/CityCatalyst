"""Bound an experimental grant-field score using previous bilingual judgments offline.

Inputs are a pre-human candidate workspace, the original answer key and policy, and
one or more prior runs containing workspace.json, scores.json and judgments.json.
All runs must use the specified judge, the same source corpus and the same rubric.
No credentials are needed. Prints diagnostic JSON with primary and held counts.

From climate-advisor:
    python -m benchmark.cnb.scripts.point_score_bounds --workspace candidate.json \
        --answer-key key.json --policy policy.json --prior-run results/control \
        --judge-model openai/gpt-6.1-sol
"""

import argparse
import json
from collections import defaultdict
from hashlib import sha256
from pathlib import Path

from benchmark.cnb.scripts.score_points import build_rows, metrics, read_json


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def evidence_set(packet):
    return frozenset(encoded(option) for option in packet["candidates"])


def question(packet):
    return encoded({k: v for k, v in packet.items() if k != "candidates"})


def implied_outcome(candidates, observations):
    """The rubric awards one field when any eligible cited answer is correct."""
    excluded = frozenset().union(*(group for group, match in observations if not match))
    possible_witnesses = [group - excluded for group, match in observations if match]
    if any(not group for group in possible_witnesses):
        return "conflicting"
    if any(group <= candidates for group in possible_witnesses):
        return "right"
    if candidates <= excluded:
        return "wrong"
    return "unjudged"


def load_observations(prior_runs, key_path, policy_path, model):
    key, policy = read_json(key_path), read_json(policy_path)
    key_hash = sha256(key_path.read_bytes()).hexdigest()
    policy_hash = sha256(policy_path.read_bytes()).hexdigest()
    history = defaultdict(list)
    for run in prior_runs:
        workspace_path = run / "workspace.json"
        scores, judgments = (
            read_json(run / "scores.json"),
            read_json(run / "judgments.json"),
        )
        if (
            scores["answer_key_sha256"] != key_hash
            or scores["policy_sha256"] != policy_hash
            or scores["workspace_sha256"]
            != sha256(workspace_path.read_bytes()).hexdigest()
            or judgments["model"] != model
        ):
            raise ValueError(f"Mismatched key, policy, workspace or judge in {run}")
        _, _, packets = build_rows(read_json(workspace_path), key, policy)
        ratings = judgments["rows"]
        if judgments["inputs_sha256"] != sha256(
            encoded(packets).encode()
        ).hexdigest() or set(ratings) != {p["key"] for p in packets}:
            raise ValueError(f"Judgments do not cover the original inputs in {run}")
        recorded = {row["key"]: row["outcome"] for row in scores["points"]}
        for packet in packets:
            field = packet["key"]
            rating = ratings[field]
            verdict = rating["matches"]
            if (
                rating["key"] != field
                or type(verdict) is not bool
                or recorded.get(field) != ("right" if verdict else "wrong")
            ):
                raise ValueError(f"Inconsistent prior verdict for {field} in {run}")
            history[question(packet)].append((evidence_set(packet), verdict))
    return history


def bounds(workspace, key, policy, history):
    sorting, rows, packets = build_rows(workspace, key, policy)
    outcomes = {
        p["key"]: implied_outcome(evidence_set(p), history.get(question(p), []))
        for p in packets
    }
    groups = {}
    for held, label in ((False, "primary"), (True, "held")):
        group = [row for row in rows if row["held"] == held]
        counts = metrics(group, sorting)
        statuses = [outcomes.get(row["key"]) for row in group]
        lower = statuses.count("right")
        groups[label] = {
            "reported_findings": counts["reported_findings"],
            "expected_findings": counts["expected_findings"],
            "minimum_correct": lower,
            "maximum_correct": lower
            + statuses.count("unjudged")
            + statuses.count("conflicting"),
        }
    return {
        "kind": "conditional bounds from prior judgments",
        "sorting": sorting,
        "groups": groups,
        "eligible_field_outcomes": outcomes,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--workspace", required=True, type=Path, help="New pre-human workspace JSON"
    )
    parser.add_argument(
        "--answer-key", required=True, type=Path, help="Original assessment key"
    )
    parser.add_argument(
        "--policy", required=True, type=Path, help="Approved scoring policy"
    )
    parser.add_argument(
        "--prior-run",
        required=True,
        type=Path,
        action="append",
        help="Prior scored run directory; repeat for additional runs",
    )
    parser.add_argument(
        "--judge-model",
        required=True,
        help="Recorded judge model required for all runs",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    history = load_observations(
        args.prior_run, args.answer_key, args.policy, args.judge_model
    )
    report = bounds(
        read_json(args.workspace),
        read_json(args.answer_key),
        read_json(args.policy),
        history,
    )
    report["judge_model"] = args.judge_model
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
