#!/usr/bin/env python3
"""Refresh run manifests after offline reprocessing.

Recomputes artifact sizes, regenerates enriched Markdown with current rules,
and normalizes timing/cost fields so annotation values are not fabricated.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))

from cc771.enrich import build_enriched_markdown, build_plain_markdown, dump_json  # noqa: E402


ARTIFACTS = [
    "response.raw.json",
    "document.structured.json",
    "output.md",
    "output.enriched.md",
]


def refresh(run_dir: Path) -> dict:
    meta = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
    document = json.loads(
        (run_dir / "document.structured.json").read_text(encoding="utf-8")
    )

    (run_dir / "output.md").write_text(
        build_plain_markdown(document["pages"]), encoding="utf-8"
    )
    (run_dir / "output.enriched.md").write_text(
        build_enriched_markdown(document), encoding="utf-8"
    )

    annotated = bool((meta.get("request") or {}).get("bbox_annotation_format"))
    timing = dict(meta.get("timing") or {})
    cost = dict(meta.get("cost") or {})

    if annotated:
        timing["annotation_latency_s"] = None
        timing["annotation_latency_status"] = "not_separately_measured"
        cost["annotation_cost_usd_estimate"] = None
        cost["total_cost_usd_estimate"] = None
        cost["total_cost_status"] = "incomplete_annotation_cost_unknown"
        cost["notes"] = (
            "OCR page cost estimated at US$4 / 1,000 pages when annotations are not "
            "requested. When bbox_annotation_format is set, annotation latency and "
            "annotation cost are not_separately_measured / provider_unavailable; "
            "total_cost_usd_estimate is left null rather than pretending the OCR "
            "page rate covers vision calls."
        )
    else:
        timing.setdefault("annotation_latency_s", 0.0)
        timing["annotation_latency_status"] = "not_requested"
        cost.setdefault(
            "ocr_cost_usd_estimate",
            cost.get("ocr_cost_usd_estimate"),
        )
        if cost.get("total_cost_usd_estimate") is None:
            cost["total_cost_usd_estimate"] = cost.get("ocr_cost_usd_estimate")
        cost["total_cost_status"] = "ocr_page_estimate_only"
        cost["notes"] = (
            "OCR page cost estimated at US$4 / 1,000 pages. "
            "No bbox annotation was requested for this run."
        )

    sizes = {
        name: (run_dir / name).stat().st_size if (run_dir / name).exists() else None
        for name in ARTIFACTS
    }
    for name, size in sizes.items():
        path = run_dir / name
        if path.exists() and size != path.stat().st_size:
            raise SystemExit(f"size race on {path}")

    meta["timing"] = timing
    meta["cost"] = cost
    meta["artifact_sizes_bytes"] = sizes
    dump_json(run_dir / "run.json", meta)
    return meta


def assert_sizes(run_dir: Path) -> None:
    meta = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
    sizes = meta.get("artifact_sizes_bytes") or {}
    for name, recorded in sizes.items():
        path = run_dir / name
        if not path.exists():
            raise SystemExit(f"missing {path}")
        actual = path.stat().st_size
        if recorded != actual:
            raise SystemExit(
                f"{run_dir.name}/{name}: recorded={recorded} actual={actual}"
            )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dirs", nargs="+", type=Path)
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    for run_dir in args.run_dirs:
        if args.check_only:
            assert_sizes(run_dir)
            print(f"OK sizes {run_dir}")
        else:
            meta = refresh(run_dir)
            assert_sizes(run_dir)
            print(
                json.dumps(
                    {
                        "run_id": meta["run_id"],
                        "artifact_sizes_bytes": meta["artifact_sizes_bytes"],
                        "annotation_latency_s": meta["timing"].get(
                            "annotation_latency_s"
                        ),
                        "total_cost_usd_estimate": meta["cost"].get(
                            "total_cost_usd_estimate"
                        ),
                    },
                    indent=2,
                )
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
