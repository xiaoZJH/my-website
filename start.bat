@echo off
chcp 65001 >nul
REM 启动 toolbox-website（含 AI 抠图 Flask sidecar），模型目录统一放 D:\模型
set "U2NET_HOME=D:\模型"

cd /d "E:\新建文件夹\新建文件夹\toolbox-website"

if not exist "%U2NET_HOME%" (
  echo [警告] 模型目录 %U2NET_HOME% 不存在，rembg 首次使用对应模型时会尝试从网络下载。
)

echo U2NET_HOME = %U2NET_HOME%
echo 正在启动 toolbox-website（Ctrl+C 停止）...
node server/server.js
