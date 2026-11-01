$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$env:PYTHONDONTWRITEBYTECODE = '1'
$env:UV_CACHE_DIR = Join-Path $PSScriptRoot 'cache/uv'
$env:TEMP = Join-Path $PSScriptRoot 'tmp'
$env:TMP = $env:TEMP
$trialPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
& $trialPython -X utf8 prepare_inputs.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
# Explicit force reruns the trained model, overwriting only this trial's own predictions.
& $trialPython -X utf8 run_trials.py --force
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $trialPython -X utf8 evaluate.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $trialPython -X utf8 plot_results.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $trialPython -X utf8 make_artifacts.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $trialPython -X utf8 validate_artifacts.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $trialPython -X utf8 collect_provenance.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $trialPython -X utf8 build_report.py
exit $LASTEXITCODE
