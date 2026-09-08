#!/usr/bin/env bash
# Batch runner for CC-771 structured OCR PoC.
# Requires MISTRAL_API_KEY. Stops with exit 2 if missing.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
PY="${REPO_ROOT}/.venv/bin/python"
if [[ ! -x "$PY" ]]; then
  echo "Missing venv python at $PY" >&2
  exit 1
fi
export PYTHONPATH="${ROOT}/python:${PYTHONPATH:-}"

FIXTURE_PDF="${ROOT}/fixtures/v2/cc-771-structured-benchmark-v2.pdf"
CHART_FACTS="${ROOT}/fixtures/v2/chart-ground-truth.md"
REAL_2025="/home/david/Downloads/2025_Annual_CAP_Report_FINAL_06-17-26_web.pdf"
REAL_2023="/home/david/Downloads/2023_CAP_Annual_Report_9-23-24_AM_FINAL.pdf"
RUNS="${ROOT}/cc-771-runs"
DATE_PREFIX="$(date -u +%Y-%m-%d)"

if [[ -z "${MISTRAL_API_KEY:-}" ]]; then
  # Load from CC app/.env if present
  ENV_FILE="/home/david/work/projects/open-earth/CityCatalyst/app/.env"
  if [[ -f "$ENV_FILE" ]] && grep -q '^MISTRAL_API_KEY=' "$ENV_FILE"; then
    set -a
    # shellcheck disable=SC1090
    source <(grep '^MISTRAL_API_KEY=' "$ENV_FILE")
    set +a
  fi
fi

if [[ -z "${MISTRAL_API_KEY:-}" ]]; then
  echo "BLOCKED: MISTRAL_API_KEY is not configured." >&2
  echo "Set it in the shell or untracked app/.env, then re-run this script." >&2
  exit 2
fi

echo "== 1/5 Controlled fixture (full + annotations) =="
"$PY" "${ROOT}/python/run_structured_ocr.py" \
  --pdf "$FIXTURE_PDF" \
  --run-id "${DATE_PREFIX}-mistral-ocr-4-1-structured-v2" \
  --runs-root "$RUNS" \
  --annotate \
  --chart-facts "$CHART_FACTS"

echo "== 2/5 Real 2025 full structural OCR (no page filter) =="
"$PY" "${ROOT}/python/run_structured_ocr.py" \
  --pdf "$REAL_2025" \
  --run-id "${DATE_PREFIX}-mistral-ocr-4-1-sandiego-2025-structure" \
  --runs-root "$RUNS" \
  --no-copy-input \
  --annotate

echo "== 3/5 Real 2023 full structural OCR =="
"$PY" "${ROOT}/python/run_structured_ocr.py" \
  --pdf "$REAL_2023" \
  --run-id "${DATE_PREFIX}-mistral-ocr-4-1-sandiego-2023-structure" \
  --runs-root "$RUNS" \
  --no-copy-input \
  --annotate

# Target chart/figure pages are recorded in run.json; defaults below are initial
# selections based on prior CC-771 reviews and may be refined after structure runs.
echo "== 4/5 Real 2025 annotation-focused pages =="
"$PY" "${ROOT}/python/run_structured_ocr.py" \
  --pdf "$REAL_2025" \
  --run-id "${DATE_PREFIX}-mistral-ocr-4-1-sandiego-2025-annotate-pages" \
  --runs-root "$RUNS" \
  --no-copy-input \
  --annotate \
  --pages "0,4,5,6,7,8"

echo "== 5/5 Real 2023 annotation-focused pages =="
"$PY" "${ROOT}/python/run_structured_ocr.py" \
  --pdf "$REAL_2023" \
  --run-id "${DATE_PREFIX}-mistral-ocr-4-1-sandiego-2023-annotate-pages" \
  --runs-root "$RUNS" \
  --no-copy-input \
  --annotate \
  --pages "0,3,4,5,6"

echo "== Downstream comparison on fixture run =="
"$PY" "${ROOT}/python/run_downstream.py" \
  --run-dir "${RUNS}/${DATE_PREFIX}-mistral-ocr-4-1-structured-v2"

echo "DONE"
