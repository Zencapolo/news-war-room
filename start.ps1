$ErrorActionPreference = "Stop"

$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$node = if (Test-Path $bundledNode) {
  $bundledNode
} else {
  "node"
}

Write-Host "Starting Marketing War Room at http://localhost:4173"
& $node "$PSScriptRoot\server.mjs"
