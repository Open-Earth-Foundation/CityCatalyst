param([ValidateSet('Verify','Commands','Reprobe')][string]$Phase = 'Verify')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if ($Phase -eq 'Verify') {
    $manifest = Get-Content -Raw -LiteralPath 'artifact-hashes.json' | ConvertFrom-Json
    foreach ($entry in $manifest.files) {
        $actual = (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $entry.path) -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne $entry.sha256) { throw "Artifact changed: $($entry.path)" }
    }
    Write-Output "Verified $($manifest.files.Count) trial file hashes."
    return
}
if ($Phase -eq 'Commands') {
    Get-ChildItem -LiteralPath 'logs' -Filter '*.json' | Sort-Object Name | ForEach-Object {
        $record = Get-Content -Raw -LiteralPath $_.FullName | ConvertFrom-Json
        [pscustomobject]@{ argv=$record.argv; cwd=$record.cwd; exit_code=$record.exit_code; elapsed_s=$record.elapsed_s }
    } | ConvertTo-Json -Depth 5
    return
}
if ($Phase -eq 'Reprobe') {
    $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ')
    $items = @()
    foreach ($name in @('seed','expanded','targeted','author','assets','final')) {
        $items += @(Get-Content -Raw -LiteralPath "configs\$name-probes.json" | ConvertFrom-Json)
    }
    foreach ($item in $items) { $item.name = "$stamp-$($item.name)" }
    $config = "configs\reprobe-$stamp.json"
    if (Test-Path -LiteralPath $config) { throw 'Timestamp collision; preserving prior evidence.' }
    $items | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $config -Encoding utf8
    python -X utf8 scripts\run_logged.py "reprobe-$stamp" python -X utf8 scripts\probe.py $config
    if ($LASTEXITCODE -ne 0) { throw "Reprobe process failed: $LASTEXITCODE" }
}
