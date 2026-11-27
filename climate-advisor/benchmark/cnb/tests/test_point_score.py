"""Benchmark behavior for a pre-human replay with held-out reference material."""

import pytest
from benchmark.cnb.scripts.score_points import build_rows, metrics


def test_only_allowed_file_evidence_can_earn_point_credit():
    key = {
        "documents_allowed": ["plan.pdf"],
        "points": [
            {
                "key": "population",
                "in_documents": {
                    "status": "found",
                    "value_en": "45,100 residents",
                    "file": "plan.txt",
                    "page": 4,
                    "quote_pl": "45 100",
                },
            }
        ],
    }
    policy = {
        "document_type": "grant",
        "file_categories": {"plan.pdf": "climate"},
        "held_for_review": [],
    }
    point = {
        "key": "population",
        "label": "Population",
        "answer_status": "missing",
        "candidates": [
            {
                "value": 45100,
                "status": "pending",
                "citations": [
                    {
                        "source_label": "CityCatalyst · City profile",
                        "quote": "45,100",
                        "page_number": None,
                    }
                ],
            }
        ],
    }
    workspace = {
        "setup": {"document_type": "grant"},
        "needs": [
            {
                "key": "climate",
                "documents": [
                    {"ready": True, "filename": "plan.md", "source_label": "Plan"}
                ],
            }
        ],
        "points": [point],
    }
    sorting, rows, eligible = build_rows(workspace, key, policy)
    assert sorting[0]["correct"] and rows[0]["outcome"] == "missed" and not eligible
    point["candidates"].append(
        {
            "value": 45100,
            "status": "pending",
            "citations": [
                {
                    "source_label": "Plan",
                    "quote": "45 100",
                    "source_anchor": "page-1/page-4/block-abc",
                    "page_number": None,
                }
            ],
        }
    )
    _, _, eligible = build_rows(workspace, key, policy)
    assert eligible[0]["candidates"] == [{"value": 45100, "quote": "45 100", "page": 4}]
    assert metrics(rows, sorting)["recall"] == 0
    point["answer_status"] = "answered"
    with pytest.raises(ValueError, match="pre-human"):
        build_rows(workspace, key, policy)
