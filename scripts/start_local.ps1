param([switch]$SeedDemo)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
$python = Join-Path $root '.venv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $python)) { throw 'Create .venv and install requirements-test.lock first.' }
if (!(Test-Path -LiteralPath '.env')) {
    & $python scripts/init_env.py --local
    if ($LASTEXITCODE -ne 0) { throw 'Environment initialization failed.' }
}
$cfg = Get-Content -LiteralPath '.env' | ConvertFrom-StringData
if ($cfg.APP_ENV -ne 'development' -or $cfg.DATABASE_URL -notmatch '@127\.0\.0\.1:55432/') {
    throw 'This helper is for local development on 127.0.0.1:55432 only.'
}
# PostgreSQL Windows tools fail with some non-ASCII binary paths. Use a dedicated ASCII temp path.
$pgTask = Join-Path $env:TEMP 'songmao-m0-pg-20260908'
$pgCtl = Join-Path $pgTask 'native\bin\pg_ctl.exe'
if (!(Test-Path -LiteralPath $pgCtl)) {
    $native = Join-Path $root '.tools\node_modules\@embedded-postgres\windows-x64\native'
    if (!(Test-Path -LiteralPath $native)) { throw 'Install the optional local PostgreSQL binary package described in README.' }
    New-Item -ItemType Directory -Force $pgTask | Out-Null
    Copy-Item -LiteralPath $native -Destination $pgTask -Recurse
}
$data = Join-Path $pgTask 'data'
if (!(Test-Path -LiteralPath (Join-Path $data 'PG_VERSION'))) {
    $passFile = Join-Path $pgTask 'bootstrap-password'
    try {
        Set-Content -LiteralPath $passFile -NoNewline -Encoding ascii $cfg.POSTGRES_PASSWORD
        & (Join-Path $pgTask 'native\bin\initdb.exe') -D $data -U $cfg.POSTGRES_USER -A scram-sha-256 --pwfile $passFile --encoding=UTF8 --locale=C
        if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL initialization failed.' }
    } finally {
        if (Test-Path -LiteralPath $passFile) { Remove-Item -LiteralPath $passFile }
    }
}
$tcp = New-Object System.Net.Sockets.TcpClient
$portOpen = $false
try {
    $tcp.Connect('127.0.0.1', 55432)
    $portOpen = $true
} catch { } finally { $tcp.Dispose() }
if (!$portOpen) {
    & $pgCtl -D $data -l (Join-Path $pgTask 'postgres.log') -o '-h 127.0.0.1 -p 55432' -w start
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL start failed.' }
}
& $python scripts/create_local_databases.py
if ($LASTEXITCODE -ne 0) { throw 'Development database creation failed.' }
if ($SeedDemo) {
    $env:PYTHONPATH = Join-Path $root 'apps/backend'
    & $python -m alembic -c apps/backend/alembic.ini upgrade head
    if ($LASTEXITCODE -ne 0) { throw 'Migration failed.' }
    & $python -m app.cli seed-demo
    if ($LASTEXITCODE -ne 0) { throw 'Demo seed failed.' }
}
# Reuse an already-running M0 instance rather than start conflicting processes.
try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 2
    $page = Invoke-WebRequest -Uri 'http://localhost:3000' -TimeoutSec 3
    if ($health.milestone -eq 'M2' -and $page.Content.Contains('松茂经营管理平台')) {
        Write-Output 'M2 is already running: http://localhost:3000'
        exit 0
    }
} catch { }
& $python scripts/dev.py
exit $LASTEXITCODE
