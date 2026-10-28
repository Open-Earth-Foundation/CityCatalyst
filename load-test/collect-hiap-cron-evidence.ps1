[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$CronApiKey,

  [string]$TargetName = "staging",
  [string]$Namespace = "default",
  [string]$PodSelector = "app=citycatalyst",
  [int]$SampleSeconds = 5,
  [switch]$AllowRemoteTarget,
  [string]$RunId = "cc-752-$((Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ'))",
  [string]$ResultsRoot = (Join-Path $PSScriptRoot "results")
)

$uri = [Uri]$BaseUrl
$localHosts = @("localhost", "127.0.0.1", "::1")
if ($uri.Host -notin $localHosts -and -not $AllowRemoteTarget) {
  throw "Refusing remote target '$BaseUrl'. Re-run with -AllowRemoteTarget after explicit approval."
}

if (-not (Get-Command k6 -ErrorAction SilentlyContinue)) {
  throw "k6 is required. Install it from https://grafana.com/docs/k6/latest/set-up/install-k6/"
}

if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
  throw "kubectl is required to collect pod restarts and memory samples."
}

$resultsDir = Join-Path $ResultsRoot $RunId
New-Item -ItemType Directory -Path $resultsDir -Force | Out-Null

$beforePath = Join-Path $resultsDir "pods-before.json"
$afterPath = Join-Path $resultsDir "pods-after.json"
$topPath = Join-Path $resultsDir "pod-memory-samples.txt"
$summaryPath = Join-Path $resultsDir "k6-summary.json"
$k6StdoutPath = Join-Path $resultsDir "k6.stdout.log"
$k6StderrPath = Join-Path $resultsDir "k6.stderr.log"
$evidencePath = Join-Path $resultsDir "evidence.json"

function Save-PodSnapshot([string]$Path) {
  $json = kubectl get pods -n $Namespace -l $PodSelector -o json
  if ($LASTEXITCODE -ne 0) {
    throw "kubectl could not read pods using selector '$PodSelector' in namespace '$Namespace'."
  }
  Set-Content -Path $Path -Value $json -NoNewline
}

function Get-RestartTotal([string]$Path) {
  if (-not (Test-Path $Path)) { return 0 }
  $snapshot = Get-Content -Raw -Path $Path | ConvertFrom-Json
  $total = 0
  foreach ($pod in @($snapshot.items)) {
    foreach ($container in @($pod.status.containerStatuses)) {
      $total += [int]$container.restartCount
    }
  }
  return $total
}

Save-PodSnapshot $beforePath

$env:BASE_URL = $BaseUrl.TrimEnd("/")
$env:CRON_API_KEY = $CronApiKey
$env:RUN_ID = $RunId

$scriptPath = Join-Path $PSScriptRoot "hiap_cron.js"
$process = Start-Process `
  -FilePath "k6" `
  -ArgumentList @("run", $scriptPath, "--summary-export", $summaryPath) `
  -RedirectStandardOutput $k6StdoutPath `
  -RedirectStandardError $k6StderrPath `
  -NoNewWindow `
  -PassThru

$startedAt = (Get-Date).ToUniversalTime()
while (-not $process.HasExited) {
  $sampleTime = (Get-Date).ToUniversalTime().ToString("o")
  $top = kubectl top pods -n $Namespace -l $PodSelector --no-headers 2>&1
  Add-Content -Path $topPath -Value ("{0}`t{1}" -f $sampleTime, ($top -join " | "))
  Start-Sleep -Seconds $SampleSeconds
}
$process.WaitForExit()
$finishedAt = (Get-Date).ToUniversalTime()

Save-PodSnapshot $afterPath

$evidence = [ordered]@{
  runId = $RunId
  targetName = $TargetName
  baseUrl = $BaseUrl
  startedAt = $startedAt.ToString("o")
  finishedAt = $finishedAt.ToString("o")
  durationSeconds = [Math]::Round(($finishedAt - $startedAt).TotalSeconds, 2)
  k6ExitCode = $process.ExitCode
  podRestartsBefore = Get-RestartTotal $beforePath
  podRestartsAfter = Get-RestartTotal $afterPath
  podRestartDelta = (Get-RestartTotal $afterPath) - (Get-RestartTotal $beforePath)
  summaryFile = (Resolve-Path $summaryPath).Path
  podMemorySamplesFile = (Resolve-Path $topPath).Path
  stdoutFile = (Resolve-Path $k6StdoutPath).Path
  stderrFile = (Resolve-Path $k6StderrPath).Path
}
$evidence | ConvertTo-Json -Depth 5 | Set-Content -Path $evidencePath

Write-Output "Evidence written to $evidencePath"
if ($process.ExitCode -ne 0) {
  throw "k6 exited with code $($process.ExitCode). Review $k6StdoutPath and $k6StderrPath."
}
