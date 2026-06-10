param(
    [switch]$CheckHealth
)

$ErrorActionPreference = "Stop"

$serviceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$requiredFiles = @(
    "Dockerfile",
    ".dockerignore",
    "docker-compose.yml",
    ".env.example",
    "requirements.txt",
    "orv/main.py"
)

foreach ($file in $requiredFiles) {
    $path = Join-Path $serviceDir $file
    if (-not (Test-Path $path)) {
        throw "Missing required ORV Docker file: $file"
    }
}

Push-Location $serviceDir
try {
    docker compose -f docker-compose.yml config | Out-Null
}
finally {
    Pop-Location
}

if ($CheckHealth) {
    $port = if ($env:ORV_PORT) { $env:ORV_PORT } else { "8000" }
    $healthUrl = "http://localhost:$port/health"
    $response = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 5
    if ($response.status -ne "ok") {
        throw "Unexpected ORV health status: $($response.status)"
    }
}

Write-Host "ORV Docker configuration is valid."
