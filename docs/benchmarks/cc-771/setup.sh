#!/usr/bin/env bash
# Portable setup for the CC-771 structured OCR PoC.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
PYTHON_BIN="${CC771_PYTHON:-python3}"
VENV="${ROOT}/.venv"

if [[ ! -d "$VENV" ]]; then
  "$PYTHON_BIN" -m venv "$VENV" || {
    echo "python -m venv failed. On Debian/Ubuntu install python3-venv, or use:" >&2
    echo "  uv venv $VENV && uv pip install --python $VENV/bin/python -r $ROOT/requirements.txt" >&2
    exit 1
  }
fi

if [[ -x "$VENV/bin/pip" ]]; then
  "$VENV/bin/pip" install -r "$ROOT/requirements.txt"
else
  uv pip install --python "$VENV/bin/python" -r "$ROOT/requirements.txt"
fi

echo "OK: $VENV/bin/python"
echo "Run tests with:"
echo "  $VENV/bin/python -m pytest $ROOT/tests -v"
echo "Run fixture-only battery with:"
echo "  CC771_PYTHON=$VENV/bin/python CC771_SKIP_REAL=1 $ROOT/python/run_all.sh"
