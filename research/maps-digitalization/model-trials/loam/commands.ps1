# Setup/reproduction ledger. Run from this directory with PowerShell 7 -NoProfile.
# Do not recreate over an active trial; the existing environment and checkout are retained.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$env:UV_CACHE_DIR = Join-Path $PSScriptRoot 'cache/uv'
$env:TEMP = Join-Path $PSScriptRoot 'tmp'
$env:TMP = $env:TEMP
$env:PYTHONDONTWRITEBYTECODE = '1'
New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
if (-not (Test-Path -LiteralPath 'upstream')) {
    git clone --depth 1 https://github.com/Fandel-Lin/LOAM.git upstream
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
git -C upstream cat-file -e 8176ace4f1d5af56baa8d3bd8481c7ed8cccf048
if ($LASTEXITCODE -ne 0) {
    git -C upstream fetch --depth 1 origin 8176ace4f1d5af56baa8d3bd8481c7ed8cccf048
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
git -C upstream checkout 8176ace4f1d5af56baa8d3bd8481c7ed8cccf048
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if (-not (Test-Path -LiteralPath '.venv/Scripts/python.exe')) {
    uv venv --python 'C:/Users/WBW/AppData/Roaming/uv/python/cpython-3.11-windows-x86_64-none/python.exe' .venv
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
uv pip install --python '.venv/Scripts/python.exe' -r requirements-lock.txt --extra-index-url https://download.pytorch.org/whl/cpu --index-strategy unsafe-best-match
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if (-not (Test-Path -LiteralPath 'checkpoint_epoch14.pth')) {
    $env:USERPROFILE = $PSScriptRoot
    & '.venv/Scripts/python.exe' -X utf8 -m gdown 'https://drive.google.com/uc?id=1eqbLoJ2XkWBe9mlZ4hpttc9rFpYUXrGK' -O checkpoint_epoch14.pth
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
$weightHash = (Get-FileHash -Algorithm SHA256 -LiteralPath 'checkpoint_epoch14.pth').Hash.ToLowerInvariant()
if ($weightHash -ne '3ad85414a951ece88bf9a14daaf74b5b98ea6333695b45e410ce519262b32f73') { throw 'Checkpoint hash mismatch' }
Write-Output 'Setup ready. Run ./rerun.ps1 for fresh inference and evaluation.'
