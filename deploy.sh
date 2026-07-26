#!/usr/bin/env bash
set -e

# ============================================================
# toolbox-website · Gitee WebHook 自动部署脚本
# 由 webhook-server.js 收到 Gitee Push 事件后调用
# ============================================================

APP_DIR="/opt/toolbox-website"
LOG_FILE="/var/log/toolbox-deploy.log"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-}"

# 安全检查：必须由 webhook-server 调用（带 secret）
if [ -z "$WEBHOOK_SECRET" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: 缺少 WEBHOOK_SECRET 环境变量，拒绝执行" >> "$LOG_FILE"
  exit 1
fi

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
  echo "$msg" >> "$LOG_FILE"
  echo "$msg"
}

log "========== 开始自动部署 =========="

# 1. 拉取最新代码
cd "$APP_DIR" || { log "ERROR: 项目目录不存在"; exit 1; }
git fetch gitee
git reset --hard gitee/main
log "代码已更新到 gitee/main"

# 2. 安装依赖（如 package.json 有变化）
if [ -f "package.json" ] && [ ! -d "node_modules" ]; then
  log "安装 Node.js 依赖..."
  npm install --production
fi

# 3. Python 去水印环境（首次或 requirements.txt 变更时）
if [ -f "tools/watermark-remover/requirements.txt" ]; then
  WM_DIR="$APP_DIR/tools/watermark-remover"
  if [ ! -d "$WM_DIR/.venv" ]; then
    log "创建去水印 Python 虚拟环境..."
    python3 -m venv "$WM_DIR/.venv"
  fi
  # 仅当 requirements.txt 最近被修改时才重新安装（避免每次都装）
  if [ "$WM_DIR/.venv/last_req_hash" != "$(md5sum $WM_DIR/requirements.txt | cut -d' ' -f1)" ]; then
    log "更新去水印 Python 依赖..."
    "$WM_DIR/.venv/bin/pip" install -r "$WM_DIR/requirements.txt" -q
    md5sum "$WM_DIR/requirements.txt" | cut -d' ' -f1 > "$WM_DIR/.venv/last_req_hash"
  fi
fi

# 4. 重启应用
if command -v pm2 >/dev/null 2>&1; then
  log "重启 toolbox 应用..."
  pm2 restart toolbox 2>/dev/null || {
    cd "$APP_DIR" && pm2 start ecosystem.config.js
    pm2 save
  }
else
  log "WARNING: pm2 未找到，跳过重启"
fi

log "========== 部署完成 =========="
