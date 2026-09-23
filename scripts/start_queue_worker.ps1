$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Encrypted = [IO.File]::ReadAllText((Join-Path $ProjectRoot "backend\.queue-secret.dpapi"))
$Credential = New-Object Management.Automation.PSCredential("worker", (ConvertTo-SecureString $Encrypted))
$env:IM_KING_WORKER_SECRET = $Credential.GetNetworkCredential().Password
$env:IM_KING_QUEUE_URL = "https://im-king-analysis-queue.im-king-analysis-queue.workers.dev"
$env:IM_KING_LOCAL_API = "http://127.0.0.1:8001/api/v1/matches"
$PythonPath = Join-Path $ProjectRoot "backend\.venv\Scripts\python.exe"
Set-Location -LiteralPath $ProjectRoot
& $PythonPath "scripts\queue_worker.py"
