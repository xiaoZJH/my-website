# Launch toolbox-website (includes AI remove-bg Flask sidecar)
# ONNX models live in D:\模型 to avoid using C: drive space
$ErrorActionPreference = "Stop"

# Force rembg to load/cache ONNX models from D:\模型 instead of the default C:\Users\10995\.u2net
$env:U2NET_HOME = "D:\模型"

$projectDir = "E:\新建文件夹\新建文件夹\toolbox-website"
Set-Location $projectDir

if (-not (Test-Path $env:U2NET_HOME)) {
    Write-Warning "Model directory $($env:U2NET_HOME) does not exist. rembg will try to download models from the internet on first use."
}

Write-Host "U2NET_HOME = $($env:U2NET_HOME)"
Write-Host "Starting toolbox-website (press Ctrl+C to stop)..."
& node server/server.js
