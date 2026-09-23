$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PythonPath = Join-Path $ProjectRoot "backend\.venv\Scripts\python.exe"
$BackendRoot = Join-Path $ProjectRoot "backend"
$Encrypted = [IO.File]::ReadAllText((Join-Path $ProjectRoot "backend\.queue-secret.dpapi"))
$Credential = New-Object Management.Automation.PSCredential("worker", (ConvertTo-SecureString $Encrypted))
$env:IM_KING_WORKER_SECRET = $Credential.GetNetworkCredential().Password
$LogRoot = Join-Path $ProjectRoot "backend\logs"
New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
Set-Location -LiteralPath $BackendRoot
& $PythonPath -m uvicorn app_v2:app --host 127.0.0.1 --port 8001
