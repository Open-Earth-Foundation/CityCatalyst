param(
    [ValidateSet('help','discovery','install','prepare','layout','legend','ldtr','report','verify')]
    [string]$Phase = 'help'
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$trialPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
$sourcePython = 'C:/Users/WBW/AppData/Local/Temp/pdf-geojson-verification-20261028/.venv/Scripts/python.exe'
$basePython = 'C:/Users/WBW/AppData/Roaming/uv/python/cpython-3.11-windows-x86_64-none/python.exe'
$env:PYTHONDONTWRITEBYTECODE = '1'
$env:UV_CACHE_DIR = Join-Path $PSScriptRoot '.uv-cache'
$env:TEMP = Join-Path $PSScriptRoot 'tmp'
$env:TMP = $env:TEMP

switch ($Phase) {
    'help' {
        Write-Output 'Run selected phases with: pwsh.exe -NoProfile -File ./commands.ps1 -Phase <phase>'
        Write-Output 'Phases: discovery, install, prepare, layout, legend, ldtr, report, verify.'
        Write-Output 'Layout and LDTR are expected to fail with the recorded blockers. Legend is offline only.'
        Write-Output 'Re-running legend archives earlier component bundles in .previous directories.'
    }
    'discovery' {
        & $sourcePython -X utf8 ./scripts/discover.py
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        & $trialPython -X utf8 ./scripts/probe_releases.py
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        & $trialPython -X utf8 ./scripts/probe_components.py
        exit $LASTEXITCODE
    }
    'install' {
        if (-not (Test-Path -LiteralPath $trialPython)) {
            uv venv --python $basePython .venv
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        }
        & $trialPython -X utf8 ./scripts/run_logged.py rerun-install-torch 300 . uv pip install --python $trialPython 'torch==2.0.1' 'torchvision==0.15.2' 'numpy<2' 'setuptools<80' pip wheel poetry-core cython
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        & $trialPython -X utf8 ./scripts/run_logged.py rerun-install-layout 240 ./upstream/uncharted-ta1 uv pip install --python $trialPython --no-build-isolation -e './tasks[segmentation]' -e './pipelines/segmentation'
        $layoutExit = $LASTEXITCODE
        Write-Output "Layout installation exit code: $layoutExit"
        & $trialPython -X utf8 ./scripts/run_logged.py rerun-install-layout-import-deps 120 . uv pip install --python $trialPython 'numpy<2' 'opencv-python==4.11.0.86' 'boto3==1.43.122' 'shapely==2.2.0' 'transformers==4.49.0' 'timm==0.9.16'
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        & $trialPython -X utf8 ./scripts/run_logged.py rerun-install-layout-code-only 60 ./upstream/uncharted-ta1 uv pip install --python $trialPython --no-deps -e './tasks' -e './pipelines/segmentation'
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        & $trialPython -X utf8 ./scripts/run_logged.py rerun-install-legend 120 . uv pip install --python $trialPython -e './upstream/criticalmaas-legend-detection'
        $legendExit = $LASTEXITCODE
        if ($legendExit -ne 0) { exit $legendExit }
        exit $layoutExit
    }
    'prepare' {
        & $sourcePython -X utf8 -B ./scripts/prepare_sources.py
        exit $LASTEXITCODE
    }
    'layout' {
        $layoutExit = 0
        foreach ($layer in 'porto-heat','porto-flood','richfield-inundation-100yr') {
            & $trialPython -X utf8 ./scripts/run_logged.py "rerun-layout-$layer" 60 . $trialPython -X utf8 ./scripts/attempt_layout.py $layer
            if ($LASTEXITCODE -ne 0) { $layoutExit = $LASTEXITCODE }
        }
        exit $layoutExit
    }
    'legend' {
        & $trialPython -X utf8 ./scripts/run_logged.py rerun-offline-legend 90 . $trialPython -X utf8 ./scripts/test_offline_legend.py
        exit $LASTEXITCODE
    }
    'ldtr' {
        & $trialPython -X utf8 ./scripts/run_logged.py rerun-ldtr-cpu-extension 60 ./upstream/LDTR/models/ops $trialPython -X utf8 setup.py build_ext --inplace
        exit $LASTEXITCODE
    }
    'report' {
        & $trialPython -X utf8 ./scripts/finalize_report.py
        exit $LASTEXITCODE
    }
    'verify' {
        & $trialPython -X utf8 ./scripts/validate_artifacts.py
        exit $LASTEXITCODE
    }
}
