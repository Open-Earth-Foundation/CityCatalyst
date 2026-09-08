#!/usr/bin/env python3
"""Run the CC-771 Mistral-first structured OCR proof of concept.

Does not modify CityCatalyst production OCR services.
Requires MISTRAL_API_KEY in the environment or untracked app/.env.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PYTHON_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(PYTHON_DIR))

from cc771.enrich import build_enriched_markdown, build_plain_markdown, dump_json
from cc771.mistral_client import MistralConfigError, MODEL, require_api_key, run_ocr
from cc771.normalize import load_schema, normalize_mistral_response, validate_structured_document
from cc771.overlays import render_overlays
from cc771.sanitize import sanitize_for_persistence, sha256_bytes


SCHEMA_DIR = ROOT / "schemas"
DEFAULT_BBOX_SCHEMA = SCHEMA_DIR / "bbox-annotation-request.schema.json"
DEFAULT_DOC_SCHEMA = SCHEMA_DIR / "document.structured.schema.json"
DEFAULT_VISUAL_SCHEMA = SCHEMA_DIR / "visual-annotation.schema.json"


def classify_retryability(error: str | None) -> dict[str, object]:
    """Record whether a provider failure is worth automatic retry."""
    if not error:
        return {"retryable": None, "reason": "no_error"}
    lower = error.lower()
    if any(
        token in lower
        for token in (
            "http 401",
            "http 403",
            "unauthorized",
            "invalid api key",
            "invalid_api_key",
            "authentication",
        )
    ):
        return {
            "retryable": False,
            "reason": "authentication_or_authorization_failure",
        }
    if any(
        token in lower
        for token in (
            "http 429",
            "rate limit",
            "too many requests",
            "timeout",
            "timed out",
            "temporarily unavailable",
            "http 500",
            "http 502",
            "http 503",
            "http 504",
            "connection reset",
            "connection refused",
            "network",
            "incompleteread",
        )
    ):
        return {"retryable": True, "reason": "transient_provider_or_network_failure"}
    if "http 4" in lower:
        return {"retryable": False, "reason": "client_or_request_error"}
    return {"retryable": True, "reason": "unknown_provider_failure_default_retry"}


def build_failure_document(
    *,
    pdf_path: Path,
    input_sha: str,
    run_id: str,
    created_at: str,
    raw: dict,
    error: str | None,
) -> dict:
    """Schema-shaped empty document used when OCR/normalization cannot proceed."""
    warning = error or "provider_or_normalize_failure"
    return {
        "schema_version": "cc-771.1",
        "document": {
            "source_filename": pdf_path.name,
            "source_sha256": input_sha,
            "requested_model": MODEL,
            "returned_model": raw.get("model"),
            "page_count": len(raw.get("pages") or []),
            "run_id": run_id,
            "created_at": created_at,
        },
        "pages": [],
        "relationships": [],
        "validation": {
            "schema_valid": True,
            "warnings": [warning],
            "missing_fields": [],
            "unsupported_provider_features": [],
        },
    }


def write_evaluation(
    path: Path,
    *,
    run_id: str,
    document: dict,
    run_meta: dict,
    chart_facts_path: Path | None,
) -> None:
    retry = run_meta.get("retryability") or {}
    lines = [
        f"# Evaluation — {run_id}",
        "",
        f"- Status: `{run_meta.get('status')}`",
        f"- Error: {run_meta.get('error')}",
        f"- Retryable: {retry.get('retryable')}",
        f"- Retryability reason: {retry.get('reason')}",
        f"- Model requested: `{run_meta.get('model_requested')}`",
        f"- Model returned: `{run_meta.get('model_returned')}`",
        f"- Input SHA-256: `{run_meta.get('input_sha256')}`",
        f"- Pages: {run_meta.get('page_count')}",
        f"- Selected annotation pages: {run_meta.get('selected_annotation_pages')}",
        f"- OCR latency (s): {run_meta.get('timing', {}).get('ocr_latency_s')}",
        f"- Annotation latency (s): {run_meta.get('timing', {}).get('annotation_latency_s')}",
        f"- Total latency (s): {run_meta.get('timing', {}).get('total_latency_s')}",
        f"- OCR cost USD (est.): {run_meta.get('cost', {}).get('ocr_cost_usd_estimate')}",
        f"- Annotation cost USD (est.): {run_meta.get('cost', {}).get('annotation_cost_usd_estimate')}",
        f"- Total cost USD (est.): {run_meta.get('cost', {}).get('total_cost_usd_estimate')}",
        "",
        "## Validation",
        "",
        f"- schema_valid: {document['validation']['schema_valid']}",
        f"- warnings: {len(document['validation']['warnings'])}",
        f"- missing_fields: {document['validation']['missing_fields']}",
        f"- unsupported_provider_features: {document['validation']['unsupported_provider_features']}",
        "",
        "## Structural summary",
        "",
    ]
    for page in document["pages"]:
        type_counts: dict[str, int] = {}
        for block in page["blocks"]:
            type_counts[block["cc_type"]] = type_counts.get(block["cc_type"], 0) + 1
        lines.append(
            f"- page {page['page_index']}: blocks={len(page['blocks'])}; "
            f"images={len(page['images'])}; tables={len(page['tables'])}; "
            f"types={type_counts}; header={'yes' if page.get('header') else 'no'}; "
            f"footer={'yes' if page.get('footer') else 'no'}"
        )
    if not document["pages"]:
        lines.append("- none (no pages normalized)")
    lines.extend(["", "## Relationships", ""])
    if document["relationships"]:
        for rel in document["relationships"]:
            lines.append(
                f"- {rel['id']}: {rel['type']} "
                f"({rel['from_block_id']} -> {rel['to_block_id']}) "
                f"provenance={rel['provenance']} rule={rel.get('rule')}"
            )
    else:
        lines.append("- none")

    lines.extend(["", "## Visual annotations", ""])
    any_image = False
    for page in document["pages"]:
        for image in page["images"]:
            any_image = True
            ann = image.get("annotation")
            lines.append(
                f"- page {page['page_index']} `{image['image_id']}`: "
                f"kind={None if not ann else ann.get('kind')}; "
                f"error={image.get('annotation_error')}"
            )
            if ann and ann.get("chart"):
                chart = ann["chart"]
                lines.append(
                    f"  - chart_type={chart.get('chart_type')}; "
                    f"targets={chart.get('targets')}; callouts={chart.get('callouts')}"
                )
            if ann and ann.get("uncertainties"):
                lines.append(f"  - uncertainties={ann['uncertainties']}")
    if not any_image:
        lines.append("- no images extracted")

    lines.extend(
        [
            "",
            "## Semantic / chart facts",
            "",
            "Evaluate expected versus observed against chart ground truth when this run includes the controlled fixture chart.",
            "",
        ]
    )
    if chart_facts_path and chart_facts_path.exists():
        lines.append(f"Ground truth reference: `{chart_facts_path}`")
        lines.append("")
        lines.append(chart_facts_path.read_text(encoding="utf-8"))
    else:
        lines.append("No chart ground-truth file attached for this input.")

    if run_meta.get("status") == "failed":
        lines.extend(
            [
                "",
                "## Provider failure",
                "",
                f"- error: {run_meta.get('error')}",
                f"- retryable: {retry.get('retryable')}",
                f"- reason: {retry.get('reason')}",
                "- No pages were normalized because the provider call failed.",
                "",
                "## Verdict",
                "",
                "Failed run. Artifacts above record the failure for audit; do not treat outputs as usable OCR.",
                "",
            ]
        )
    else:
        lines.extend(
            [
                "",
                "## Verdict",
                "",
                "Fill after manual review of overlays and chart facts. A partial or negative result is valid when evidence is complete.",
                "",
            ]
        )
    path.write_text("\n".join(lines), encoding="utf-8")


def process_run(
    *,
    pdf_path: Path,
    run_dir: Path,
    run_id: str,
    annotate: bool,
    selected_pages: list[int] | None,
    copy_input: bool,
    chart_facts_path: Path | None,
) -> dict:
    api_key = require_api_key()
    run_dir.mkdir(parents=True, exist_ok=True)
    pdf_bytes = pdf_path.read_bytes()
    input_sha = sha256_bytes(pdf_bytes)

    if copy_input:
        shutil.copy2(pdf_path, run_dir / "input.pdf")
    else:
        (run_dir / "input.sha256.txt").write_text(
            f"{input_sha}  {pdf_path.name}\n", encoding="utf-8"
        )

    bbox_schema = DEFAULT_BBOX_SCHEMA if annotate else None
    try:
        ocr = run_ocr(
            api_key,
            pdf_path,
            bbox_schema_path=bbox_schema,
            include_image_base64=True,
            pages=selected_pages if selected_pages else None,
        )
        status = "ok"
        error = None
        raw = ocr["response"]
    except Exception as exc:  # noqa: BLE001 - persist failure metadata
        status = "failed"
        error = str(exc)
        ocr = {
            "http_status": None,
            "response": {"pages": [], "model": None, "error": error},
            "file_id": None,
            "request_for_metadata": {
                "model": MODEL,
                "include_blocks": True,
                "confidence_scores_granularity": "block",
                "extract_header": True,
                "extract_footer": True,
                "table_format": "markdown",
                "include_image_base64": True,
                "pages": selected_pages,
            },
            "timing": {
                "ocr_latency_s": None,
                "annotation_latency_s": None,
                "total_latency_s": None,
            },
            "cost": {
                "ocr_cost_usd_estimate": None,
                "annotation_cost_usd_estimate": None,
                "total_cost_usd_estimate": None,
            },
            "usage_info": None,
        }
        raw = ocr["response"]

    created_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    sanitized_raw = sanitize_for_persistence(raw)
    dump_json(run_dir / "response.raw.json", sanitized_raw)

    document = None
    schema_errors: list[str] = []
    if status == "ok":
        try:
            document = normalize_mistral_response(
                raw,
                run_id=run_id,
                source_filename=pdf_path.name,
                source_sha256=input_sha,
                requested_model=MODEL,
                created_at=created_at,
            )
            doc_schema = load_schema(DEFAULT_DOC_SCHEMA)
            ok, schema_errors = validate_structured_document(document, doc_schema)
            document["validation"]["schema_valid"] = ok
            if schema_errors:
                document["validation"]["warnings"].extend(
                    f"schema: {msg}" for msg in schema_errors
                )
                status = "partial"

            # Validate annotations against visual schema when present.
            visual_schema = load_schema(DEFAULT_VISUAL_SCHEMA)
            from jsonschema import Draft202012Validator

            visual_validator = Draft202012Validator(visual_schema)
            for page in document["pages"]:
                for image in page["images"]:
                    ann = image.get("annotation")
                    if not ann:
                        continue
                    errs = sorted(
                        visual_validator.iter_errors(ann), key=lambda e: list(e.path)
                    )
                    if errs:
                        image["annotation_error"] = "; ".join(
                            e.message for e in errs[:5]
                        )
                        status = "partial"
        except Exception as exc:  # noqa: BLE001
            status = "partial" if status == "ok" else status
            error = f"{error + '; ' if error else ''}normalize_error: {exc}"
            document = build_failure_document(
                pdf_path=pdf_path,
                input_sha=input_sha,
                run_id=run_id,
                created_at=created_at,
                raw=raw,
                error=error,
            )
            document["validation"]["schema_valid"] = False

    if document is None:
        # API/network failures never entered normalization; still emit an
        # auditable structured artifact so the run bundle is complete.
        document = build_failure_document(
            pdf_path=pdf_path,
            input_sha=input_sha,
            run_id=run_id,
            created_at=created_at,
            raw=raw,
            error=error,
        )
        doc_schema = load_schema(DEFAULT_DOC_SCHEMA)
        ok, schema_errors = validate_structured_document(document, doc_schema)
        document["validation"]["schema_valid"] = ok
        if schema_errors:
            document["validation"]["warnings"].extend(
                f"schema: {msg}" for msg in schema_errors
            )

    dump_json(run_dir / "document.structured.json", document)
    plain = build_plain_markdown(document["pages"] or [
        {"page_index": p.get("index", i), "markdown": p.get("markdown", "")}
        for i, p in enumerate(raw.get("pages") or [])
    ])
    (run_dir / "output.md").write_text(plain, encoding="utf-8")
    (run_dir / "output.enriched.md").write_text(
        build_enriched_markdown(document), encoding="utf-8"
    )

    overlay_pages = selected_pages
    if overlay_pages is None:
        overlay_pages = [page["page_index"] for page in document["pages"]]
    try:
        render_overlays(
            pdf_path,
            document,
            run_dir / "overlays",
            page_indexes=overlay_pages,
        )
    except Exception as exc:  # noqa: BLE001
        (run_dir / "overlays" / "ERROR.txt").parent.mkdir(parents=True, exist_ok=True)
        (run_dir / "overlays" / "ERROR.txt").write_text(str(exc), encoding="utf-8")
        status = "partial"

    artifact_sizes = {
        name: (run_dir / name).stat().st_size if (run_dir / name).exists() else None
        for name in [
            "response.raw.json",
            "document.structured.json",
            "output.md",
            "output.enriched.md",
        ]
    }

    retryability = classify_retryability(error)
    run_meta = {
        "run_id": run_id,
        "status": status,
        "error": error,
        "retryability": retryability,
        "provider": "Mistral",
        "endpoint": "https://api.mistral.ai/v1/ocr",
        "model_requested": MODEL,
        "model_returned": raw.get("model"),
        "input_file": pdf_path.name,
        "input_sha256": input_sha,
        "input_bytes": len(pdf_bytes),
        "source_mode": "Mistral Files API upload plus signed document URL",
        "request": ocr["request_for_metadata"],
        "selected_annotation_pages": selected_pages,
        "include_blocks": True,
        "confidence_scores_granularity": "block",
        "extract_header": True,
        "extract_footer": True,
        "table_format": "markdown",
        "include_image_base64": True,
        "http_status": ocr.get("http_status"),
        "page_count": document["document"]["page_count"],
        "usage_info": ocr.get("usage_info"),
        "timing": ocr.get("timing"),
        "cost": ocr.get("cost"),
        "mistral_file_id": ocr.get("file_id"),
        "schema_versions": {
            "document": "cc-771.1",
            "visual_annotation": "cc-771.visual.1",
        },
        "schema_errors": schema_errors,
        "artifact_sizes_bytes": artifact_sizes,
        "secret_persisted": False,
        "created_at": created_at,
    }
    dump_json(run_dir / "run.json", run_meta)
    write_evaluation(
        run_dir / "evaluation.md",
        run_id=run_id,
        document=document,
        run_meta=run_meta,
        chart_facts_path=chart_facts_path,
    )
    return run_meta


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument(
        "--runs-root",
        type=Path,
        default=ROOT / "cc-771-runs",
    )
    parser.add_argument(
        "--annotate",
        action="store_true",
        help="Include bbox_annotation_format using the versioned schema.",
    )
    parser.add_argument(
        "--pages",
        type=str,
        default=None,
        help="Optional 0-based page list, e.g. 0,1,4-6",
    )
    parser.add_argument(
        "--no-copy-input",
        action="store_true",
        help="Store input hash only (for large real PDFs).",
    )
    parser.add_argument(
        "--chart-facts",
        type=Path,
        default=None,
    )
    args = parser.parse_args()

    selected_pages = None
    if args.pages:
        selected_pages = []
        for part in args.pages.split(","):
            part = part.strip()
            if "-" in part:
                start_s, end_s = part.split("-", 1)
                selected_pages.extend(range(int(start_s), int(end_s) + 1))
            else:
                selected_pages.append(int(part))

    try:
        require_api_key()
    except MistralConfigError as exc:
        print(f"BLOCKED: {exc}", file=sys.stderr)
        return 2

    run_dir = args.runs_root / args.run_id
    meta = process_run(
        pdf_path=args.pdf,
        run_dir=run_dir,
        run_id=args.run_id,
        annotate=args.annotate,
        selected_pages=selected_pages,
        copy_input=not args.no_copy_input,
        chart_facts_path=args.chart_facts,
    )
    print(json.dumps({k: meta[k] for k in [
        "run_id", "status", "model_returned", "page_count", "timing", "cost", "input_sha256"
    ]}, ensure_ascii=False, indent=2))
    return 0 if meta["status"] in {"ok", "partial"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
