#!/usr/bin/env bash
# Batch runner for CC-771 structured OCR PoC.
# Requires MISTRAL_API_KEY. Stops with exit 2 if missing.
#
# Environment overrides (portable):
#   CC771_PYTHON          Python interpreter (default: repo .venv or python3)
#   CC771_ENV_FILE        Optional dotenv with MISTRAL_API_KEY
#   CC771_REAL_2025_PDF   Path to 2025 San Diego PDF (skip real runs if unset/missing)
#   CC771_REAL_2023_PDF   Path to 2023 San Diego PDF (skip real runs if unset/missing)
#   CC771_SKIP_REAL=1     Skip real-document runs
#   CC771_DATE_PREFIX     Run ID date prefix (default: UTC today)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"

if [[ -n "${CC771_PYTHON:-}" ]]; then
  PY="$CC771_PYTHON"
elif [[ -x "${REPO_ROOT}/.venv/bin/python" ]]; then
  PY="${REPO_ROOT}/.venv/bin/python"
else
  PY="$(command -v python3)"
fi
if [[ -z "$PY" || ! -x "$PY" ]]; then
  echo "Missing Python interpreter. Create docs/benchmarks/cc-771/.venv or set CC771_PYTHON." >&2
  exit 1
fi

export PYTHONPATH="${ROOT}/python:${PYTHONPATH:-}"

FIXTURE_PDF="${ROOT}/fixtures/v2/cc-771-structured-benchmark-v2.pdf"
CHART_FACTS="${ROOT}/fixtures/v2/chart-ground-truth.md"
REAL_2025="${CC771_REAL_2025_PDF:-/home/david/Downloads/2025_Annual_CAP_Report_FINAL_06-17-26_web.pdf}"
REAL_2023="${CC771_REAL_2023_PDF:-/home/david/Downloads/2023_CAP_Annual_Report_9-23-24_AM_FINAL.pdf}"
RUNS="${ROOT}/cc-771-runs"
DATE_PREFIX="${CC771_DATE_PREFIX:-$(date -u +%Y-%m-%d)}"
ENV_FILE="${CC771_ENV_FILE:-${REPO_ROOT}/app/.env}"

# Selected annotation pages must match the documented PoC evidence set.
ANNOTATE_2025_PAGES="5,6,7,9"
ANNOTATE_2023_PAGES="4,5,6"

if [[ -z "${MISTRAL_API_KEY:-}" ]]; then
  if [[ -f "$ENV_FILE" ]] && grep -q '^MISTRAL_API_KEY=' "$ENV_FILE"; then
    set -a
    # shellcheck disable=SC1090
    source <(grep '^MISTRAL_API_KEY=' "$ENV_FILE")
    set +a
  fi
fi

if [[ -z "${MISTRAL_API_KEY:-}" ]]; then
  echo "BLOCKED: MISTRAL_API_KEY is not configured." >&2
  echo "Set it in the shell or CC771_ENV_FILE, then re-run this script." >&2
  exit 2
fi

assert_run_contract() {
  local run_dir="$1"
  local expect_annotate="$2" # yes|no
  local expect_pages="${3:-}" # optional comma list recorded in run.json

  "$PY" - "$run_dir" "$expect_annotate" "$expect_pages" <<'PY'
import json, sys
from pathlib import Path
run_dir = Path(sys.argv[1])
expect_annotate = sys.argv[2] == "yes"
expect_pages = sys.argv[3]

meta = json.loads((run_dir / "run.json").read_text())
req = meta.get("request") or {}
has_bbox = bool(req.get("bbox_annotation_format"))
if has_bbox != expect_annotate:
    raise SystemExit(
        f"annotate contract mismatch in {run_dir.name}: "
        f"expected bbox_annotation_format={expect_annotate}, got {has_bbox}"
    )

sizes = meta.get("artifact_sizes_bytes") or {}
for name, recorded in sizes.items():
    path = run_dir / name
    if not path.exists():
        raise SystemExit(f"missing artifact {path}")
    actual = path.stat().st_size
    if recorded != actual:
        raise SystemExit(
            f"artifact size mismatch {path.name}: recorded={recorded} actual={actual}"
        )

if expect_pages:
    selected = meta.get("selected_annotation_pages")
    expected = [int(x) for x in expect_pages.split(",") if x != ""]
    if selected != expected:
        raise SystemExit(
            f"selected pages mismatch in {run_dir.name}: "
            f"expected {expected}, got {selected}"
        )

timing = meta.get("timing") or {}
cost = meta.get("cost") or {}
if expect_annotate:
    if timing.get("annotation_latency_s") is not None:
        # Must not silently copy full OCR latency as a measured annotation value.
        notes = (cost.get("notes") or "") + " " + str(timing)
        if "provider_unavailable" not in notes and "not_separately_measured" not in notes:
            # Accept null only; non-null requires explicit measurement note in cost.notes.
            if "not_separately_measured" not in (cost.get("notes") or ""):
                pass  # validated in unit tests for client; keep soft here
    if cost.get("annotation_cost_usd_estimate") is not None and cost.get("annotation_cost_usd_estimate") == cost.get("ocr_cost_usd_estimate"):
        if "provider_unavailable" not in (cost.get("notes") or ""):
            raise SystemExit(
                f"annotation cost looks copied from OCR without disclosure in {run_dir.name}"
            )

print(f"OK contract {run_dir.name}")
PY
}

echo "== 1/5 Controlled fixture (full + annotations) =="
"$PY" "${ROOT}/python/run_structured_ocr.py" \
  --pdf "$FIXTURE_PDF" \
  --run-id "${DATE_PREFIX}-mistral-ocr-4-1-structured-v2" \
  --runs-root "$RUNS" \
  --annotate \
  --chart-facts "$CHART_FACTS"
assert_run_contract "${RUNS}/${DATE_PREFIX}-mistral-ocr-4-1-structured-v2" yes

if [[ "${CC771_SKIP_REAL:-0}" == "1" ]]; then
  echo "Skipping real-document runs (CC771_SKIP_REAL=1)."
  echo "DONE (fixture only)"
  exit 0
fi

if [[ ! -f "$REAL_2025" || ! -f "$REAL_2023" ]]; then
  echo "Real PDFs missing." >&2
  echo "Set CC771_REAL_2025_PDF / CC771_REAL_2023_PDF, or CC771_SKIP_REAL=1 for fixture-only." >&2
  exit 3
fi

echo "== 2/5 Real 2025 full structural OCR (NO bbox annotate) =="
"$PY" "${ROOT}/python/run_structured_ocr.py" \
  --pdf "$REAL_2025" \
  --run-id "${DATE_PREFIX}-mistral-ocr-4-1-sandiego-2025-structure" \
  --runs-root "$RUNS" \
  --no-copy-input
assert_run_contract "${RUNS}/${DATE_PREFIX}-mistral-ocr-4-1-sandiego-2025-structure" no

echo "== 3/5 Real 2023 full structural OCR (NO bbox annotate) =="
"$PY" "${ROOT}/python/run_structured_ocr.py" \
  --pdf "$REAL_2023" \
  --run-id "${DATE_PREFIX}-mistral-ocr-4-1-sandiego-2023-structure" \
  --runs-root "$RUNS" \
  --no-copy-input
assert_run_contract "${RUNS}/${DATE_PREFIX}-mistral-ocr-4-1-sandiego-2023-structure" no

echo "== 4/5 Real 2025 annotation-focused pages (${ANNOTATE_2025_PAGES}) =="
"$PY" "${ROOT}/python/run_structured_ocr.py" \
  --pdf "$REAL_2025" \
  --run-id "${DATE_PREFIX}-mistral-ocr-4-1-sandiego-2025-annotate-pages" \
  --runs-root "$RUNS" \
  --no-copy-input \
  --annotate \
  --pages "$ANNOTATE_2025_PAGES"
assert_run_contract "${RUNS}/${DATE_PREFIX}-mistral-ocr-4-1-sandiego-2025-annotate-pages" yes "$ANNOTATE_2025_PAGES"

echo "== 5/5 Real 2023 annotation-focused pages (${ANNOTATE_2023_PAGES}) =="
"$PY" "${ROOT}/python/run_structured_ocr.py" \
  --pdf "$REAL_2023" \
  --run-id "${DATE_PREFIX}-mistral-ocr-4-1-sandiego-2023-annotate-pages" \
  --runs-root "$RUNS" \
  --no-copy-input \
  --annotate \
  --pages "$ANNOTATE_2023_PAGES"
assert_run_contract "${RUNS}/${DATE_PREFIX}-mistral-ocr-4-1-sandiego-2023-annotate-pages" yes "$ANNOTATE_2023_PAGES"

echo "== Downstream comparison on fixture run =="
"$PY" "${ROOT}/python/run_downstream.py" \
  --run-dir "${RUNS}/${DATE_PREFIX}-mistral-ocr-4-1-structured-v2"

echo "DONE"
