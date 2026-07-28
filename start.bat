@echo off
chcp 65001 >nul
REM Launch toolbox-website (includes AI remove-bg Flask sidecar). Models live in D:\模型.
set "U2NET_HOME=D:\模型"

cd /d "E:\新建文件夹\新建文件夹\toolbox-website"

if not exist "%U2NET_HOME%" (
  echo [WARNING] Model directory %U2NET_HOME% does not exist. rembg will try to download models on first use.
)

echo U2NET_HOME = %U2NET_HOME%
echo Starting toolbox-website (press Ctrl+C to stop)...
node server/server.js
