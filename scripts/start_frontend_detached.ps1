# Start frontend dev server as a detached process (survives AI session/terminal).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start_frontend_detached.ps1
$env:FRONTEND_HOST = '0.0.0.0'
$env:INTERNAL_API_URL = 'http://127.0.0.1:8000'
$env:NEXT_TELEMETRY_DISABLED = '1'
Set-Location -LiteralPath (Join-Path $PSScriptRoot '..\apps\frontend')
Start-Process -FilePath 'node' -ArgumentList 'node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '0.0.0.0', '--port', '3000' -WorkingDirectory (Get-Location) -WindowStyle Hidden | Out-Null
Write-Output 'Frontend started as detached process (0.0.0.0:3000, API proxied to 127.0.0.1:8000)'
