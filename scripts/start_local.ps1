$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PythonPath = Join-Path $ProjectRoot "backend\.venv\Scripts\python.exe"
$BackendRoot = Join-Path $ProjectRoot "backend"
$Encrypted = [IO.File]::ReadAllText((Join-Path $ProjectRoot "backend\.queue-secret.dpapi"))
$Credential = New-Object Management.Automation.PSCredential("worker", (ConvertTo-SecureString $Encrypted))
$env:IM_KING_WORKER_SECRET = $Credential.GetNetworkCredential().Password
$LogRoot = Join-Path $BackendRoot "logs"

if (-not (Test-Path -LiteralPath $PythonPath)) {
    throw "Python environment not found: $PythonPath"
}

New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null

$backend = Start-Process -FilePath $PythonPath `
    -ArgumentList "-m", "uvicorn", "app_v2:app", "--host", "127.0.0.1", "--port", "8001" `
    -WorkingDirectory $BackendRoot `
    -RedirectStandardOutput (Join-Path $LogRoot "local-backend.out.log") `
    -RedirectStandardError (Join-Path $LogRoot "local-backend.err.log") `
    -WindowStyle Hidden -PassThru

$gateway = Start-Process -FilePath $PythonPath `
    -ArgumentList "scripts\dev_gateway.py" `
    -WorkingDirectory $ProjectRoot `
    -RedirectStandardOutput (Join-Path $LogRoot "local-gateway.out.log") `
    -RedirectStandardError (Join-Path $LogRoot "local-gateway.err.log") `
    -WindowStyle Hidden -PassThru

Write-Host "Local festival app started"
Write-Host "Open: http://127.0.0.1:8080"
Write-Host "Backend PID: $($backend.Id)"
Write-Host "Gateway PID: $($gateway.Id)"
