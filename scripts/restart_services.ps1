$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PythonPath = Join-Path $ProjectRoot 'backend\.venv\Scripts\python.exe'
$LogRoot = Join-Path $ProjectRoot 'backend\logs'
New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
# Stop only this checkout's Python launchers and their children.
$Processes = @(Get-CimInstance Win32_Process)
$Targets = @($Processes | Where-Object {
    $_.Name -eq 'python.exe' -and $_.CommandLine -and
    $_.CommandLine.Contains($PythonPath) -and
    $_.CommandLine -match 'uvicorn app_v2:app|scripts[\\/]queue_worker.py|scripts[\\/]dev_gateway.py'
})
foreach ($Target in $Targets) {
    $Processes | Where-Object ParentProcessId -eq $Target.ProcessId | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
    Stop-Process -Id $Target.ProcessId -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2
foreach ($Port in @(8001,8080,47821)) {
    if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw "Port $Port is still occupied. No unrelated process was stopped." }
}
$ShellPath = Join-Path $PSHOME 'powershell.exe'
foreach ($Service in @(@{Name='backend';Script='start_backend.ps1'},@{Name='queue';Script='start_queue_worker.ps1'})) {
    $ScriptPath = Join-Path $PSScriptRoot $Service.Script
    Start-Process -FilePath $ShellPath -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`"" -WorkingDirectory $ProjectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $LogRoot ($Service.Name+'.out.log')) -RedirectStandardError (Join-Path $LogRoot ($Service.Name+'.err.log')) | Out-Null
}
Start-Process -FilePath $PythonPath -ArgumentList 'scripts/dev_gateway.py' -WorkingDirectory $ProjectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $LogRoot 'gateway.out.log') -RedirectStandardError (Join-Path $LogRoot 'gateway.err.log') | Out-Null
Write-Output 'Started backend, queue worker and local gateway in the background. Logs: backend/logs'
