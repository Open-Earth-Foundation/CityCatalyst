"""The offline evaluator reports uncertainty whenever recorded verdicts cannot decide a field."""

import json
from hashlib import sha256

import pytest

from benchmark.cnb.scripts.point_score_bounds import (
    evidence_set,
    implied_outcome,
    load_observations,
    question,
)


@pytest.mark.parametrize(
    ("observations", "candidate", "expected"),
    [
        ([({"a", "b"}, True)], {"b", "a", "c"}, "right"),
        ([({"a", "b"}, True)], {"a"}, "unjudged"),
        ([({"a", "b"}, True), ({"a"}, False)], {"b"}, "right"),
        ([({"a"}, False), ({"b"}, False)], {"a", "b"}, "wrong"),
        ([({"a"}, False)], {"a", "c"}, "unjudged"),
        ([({"a", "b"}, True), ({"a", "b"}, False)], {"b"}, "conflicting"),
        ([], {"new"}, "unjudged"),
    ],
)
def test_bounds_from_existential_verdicts(observations, candidate, expected):
    assert implied_outcome(candidate, observations) == expected


def test_prior_evidence_keeps_the_exact_value_quote_page_and_reference():
    packet = {
        "key": "emissions",
        "support": "found",
        "reference": "19 kt",
        "quote": "19 tys. ton",
        "candidates": [{"value": "19 kt", "quote": "19 tys. ton", "page": 5}],
    }
    original = packet["candidates"][0]
    for replacement in ({"page": 6}, {"value": "19 t"}, {"quote": "około 19 tys. ton"}):
        changed = {**packet, "candidates": [{**original, **replacement}]}
        assert question(packet) == question(changed)
        assert evidence_set(packet).isdisjoint(evidence_set(changed))
    assert question(packet) != question({**packet, "support": "partly"})


def test_rejects_judgments_from_another_workspace(tmp_path):
    def write(name, data):
        path = tmp_path / name
        path.write_text(json.dumps(data), encoding="utf-8")
        return path

    key = write("key.json", {"documents_allowed": [], "points": []})
    policy = write("policy.json", {"document_type": "grant", "file_categories": {}})
    workspace = write(
        "workspace.json",
        {"setup": {"document_type": "grant"}, "needs": [], "points": []},
    )
    write(
        "scores.json",
        {
            "answer_key_sha256": sha256(key.read_bytes()).hexdigest(),
            "policy_sha256": sha256(policy.read_bytes()).hexdigest(),
            "workspace_sha256": sha256(workspace.read_bytes()).hexdigest(),
            "points": [],
        },
    )
    write(
        "judgments.json",
        {"inputs_sha256": sha256(b"[]").hexdigest(), "model": "test", "rows": {}},
    )
    assert not load_observations([tmp_path], key, policy, "test")
    write("workspace.json", {"setup": {"document_type": "a different grant"}})
    with pytest.raises(ValueError, match="Mismatched"):
        load_observations([tmp_path], key, policy, "test")
