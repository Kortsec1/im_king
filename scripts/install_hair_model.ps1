$ErrorActionPreference='Stop'
$ProjectRoot=Split-Path -Parent $PSScriptRoot
$PythonPath=Join-Path $ProjectRoot 'backend/.venv/Scripts/python.exe'
# MediaPipe's ImageSegmenter uses the existing OpenCV core. Avoid installing a
# second distribution over the pinned opencv-python-headless package.
& $PythonPath -m pip install --no-deps mediapipe==1.0.1
if($LASTEXITCODE){throw 'MediaPipe install failed'}
& $PythonPath -m pip install 'absl-py~=2.3' 'sounddevice~=0.5' 'flatbuffers~=25.9'
if($LASTEXITCODE){throw 'Hair dependencies install failed'}
$ModelDirectory=Join-Path $ProjectRoot 'backend/models'
New-Item -ItemType Directory -Force -Path $ModelDirectory | Out-Null
$ModelPath=Join-Path $ModelDirectory 'hair_segmenter-v1.tflite'
$ExpectedHash='2628CF3CE5F695F604CBEA2841E00BEFCAA3624BF80CAF3664BEF2656D59BF84'
if(!(Test-Path -LiteralPath $ModelPath)){
    Invoke-WebRequest -UseBasicParsing 'https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/1/hair_segmenter.tflite' -OutFile $ModelPath
}
if((Get-FileHash -LiteralPath $ModelPath -Algorithm SHA256).Hash -ne $ExpectedHash){throw 'Hair model checksum mismatch'}
Write-Output 'Hair model ready. Run backend/scripts/prepare_reference_features.py, then restart_services.ps1.'
