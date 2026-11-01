# PowerShell7 non-login. Run from this trial directory; preserve frozen inputs.
# Initial environment commands and stdout are retained in logs/install-*.log.
# Environment: uv venv .venv --python ../loam/.venv/Scripts/python.exe
# uv pip install --python .venv/Scripts/python.exe -r requirements-base.txt
# uv pip install --python .venv/Scripts/python.exe torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cu124
# Initial only: python -B -X utf8 setup_trial.py; python -B -X utf8 prepare_inputs.py
# Initial only: python -B -X utf8 preprocess.py porto-heat
# Canonical probe: python -B -u -X utf8 infer.py porto-heat --probe
# Completed layer inference is skipped when resuming.
$env:TEMP = Join-Path $PSScriptRoot 'tmp'
$env:TMP = $env:TEMP
$env:PYTHONDONTWRITEBYTECODE = '1'
& "$PSScriptRoot/.venv/Scripts/python.exe" -B -u -X utf8 "$PSScriptRoot/run_trials.py"
if ($LASTEXITCODE -ne 0) {exit $LASTEXITCODE}
& "$PSScriptRoot/.venv/Scripts/python.exe" -B -u -X utf8 "$PSScriptRoot/evaluate.py"
if ($LASTEXITCODE -ne 0) {exit $LASTEXITCODE}
& "$PSScriptRoot/.venv/Scripts/python.exe" -B -u -X utf8 "$PSScriptRoot/make_artifacts.py"
if ($LASTEXITCODE -ne 0) {exit $LASTEXITCODE}
& "$PSScriptRoot/.venv/Scripts/python.exe" -B -u -X utf8 "$PSScriptRoot/validate.py"
if ($LASTEXITCODE -ne 0) {exit $LASTEXITCODE}
& "$PSScriptRoot/.venv/Scripts/python.exe" -B -u -X utf8 "$PSScriptRoot/build_report.py"
exit $LASTEXITCODE
