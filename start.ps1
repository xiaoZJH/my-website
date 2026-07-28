# 启动 toolbox-website（含 AI 抠图 Flask sidecar）
# 模型目录统一放在 D:\模型，避免占用 C 盘
$ErrorActionPreference = "Stop"

# 让 rembg 从 D:\模型 读取/缓存 ONNX 模型，而不是默认的 C:\Users\10995\.u2net
$env:U2NET_HOME = "D:\模型"

$projectDir = "E:\新建文件夹\新建文件夹\toolbox-website"
Set-Location $projectDir

if (-not (Test-Path $env:U2NET_HOME)) {
    Write-Warning "模型目录 $($env:U2NET_HOME) 不存在，rembg 首次使用对应模型时会尝试从网络下载。"
}

Write-Host "U2NET_HOME = $($env:U2NET_HOME)"
Write-Host "正在启动 toolbox-website （Ctrl+C 停止）..."
& node server/server.js
