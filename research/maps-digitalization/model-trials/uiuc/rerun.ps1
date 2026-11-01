$ErrorActionPreference = 'Stop'
$trial = $PSScriptRoot
$env:PYTHONDONTWRITEBYTECODE = '1'
$env:UV_CACHE_DIR = Join-Path $trial '.uv-cache'
$env:TMP = Join-Path $trial 'tmp'
$env:TEMP = $env:TMP
New-Item -ItemType Directory -Path $env:TMP -Force | Out-Null
$python = Join-Path $trial '.venv/Scripts/python.exe'
# Existing pinned environment and frozen source preparation are reused.
# Completed layers are skipped only when their frozen-config hash matches.
& $python -X utf8 (Join-Path $trial 'infer.py') *> (Join-Path $trial 'logs/rerun-inference.log')
if ($LASTEXITCODE -ne 0) { throw "Inference failed: $LASTEXITCODE" }
& $python -X utf8 (Join-Path $trial 'evaluate.py') *> (Join-Path $trial 'logs/rerun-evaluation.log')
if ($LASTEXITCODE -ne 0) { throw "Evaluation failed: $LASTEXITCODE" }
& $python -X utf8 (Join-Path $trial 'verify_outputs.py') *> (Join-Path $trial 'logs/rerun-verification.log')
if ($LASTEXITCODE -ne 0) { throw "Output verification failed: $LASTEXITCODE" }
& $python -X utf8 (Join-Path $trial 'visualize.py') *> (Join-Path $trial 'logs/rerun-visualization.log')
if ($LASTEXITCODE -ne 0) { throw "Visualization failed: $LASTEXITCODE" }
& $python -X utf8 (Join-Path $trial 'report.py')
if ($LASTEXITCODE -ne 0) { throw "Report failed: $LASTEXITCODE" }
