#!/usr/bin/env bash
set -e

# ============================================================
# 个人工具箱 · 腾讯云轻量服务器一键部署脚本（Ubuntu 22.04）
# 前置要求：root 用户 + 能访问 GitHub
# ============================================================

REPO="https://github.com/xiaoZJH/my-website.git"
APP_DIR="/opt/toolbox-website"
APP_USER="root"
NODE_VERSION="22"
PORT="4173"
WM_PORT="5001"
WM_BASE_PATH="/watermark-remover"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[setup]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
err() { echo -e "${RED}[error]${NC} $1"; exit 1; }

[ "$(id -u)" -eq 0 ] || err "请使用 sudo 运行本脚本：sudo bash setup.sh"

log "更新系统软件包..."
apt-get update -y
apt-get install -y curl wget git ufw build-essential python3 python3-venv python3-pip python3-dev ffmpeg nginx

log "安装 Node.js ${NODE_VERSION}..."
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" != "${NODE_VERSION}" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y nodejs
fi
log "Node.js 版本: $(node -v), npm 版本: $(npm -v)"

log "安装 pm2 进程守护..."
npm install -g pm2

log "准备项目代码..."
# 如果脚本本身就在仓库目录内运行（先 git clone 再 sudo bash setup.sh），
# 则直接使用当前目录，避免重复 clone 浪费时间
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/server/server.js" ]; then
  APP_DIR="${SCRIPT_DIR}"
  log "检测到脚本位于仓库目录内，直接使用：${APP_DIR}"
else
  if [ -d "${APP_DIR}/.git" ]; then
    cd "${APP_DIR}"
    git reset --hard
    git pull origin main
  else
    [ -d "${APP_DIR}" ] && rm -rf "${APP_DIR}"
    git clone "${REPO}" "${APP_DIR}"
  fi
fi

log "配置 Python 去水印环境（需要几分钟，请等待 OpenCV 安装）..."
cd "${APP_DIR}/tools/watermark-remover"
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

log "创建数据目录..."
mkdir -p "${APP_DIR}/data"

log "配置 Nginx 反向代理..."
cat > /etc/nginx/sites-available/toolbox <<EOF
server {
    listen 80;
    server_name _;

    # 允许上传最大 500MB（视频去水印）
    client_max_body_size 500M;

    # 主页与所有 Node.js API 都走这里
    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # 去水印 Flask sidecar 通过子路径暴露
    location ${WM_BASE_PATH}/ {
        proxy_pass http://127.0.0.1:${WM_PORT}${WM_BASE_PATH}/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size 500M;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/toolbox /etc/nginx/sites-enabled/toolbox
nginx -t && systemctl restart nginx

log "配置防火墙（只开放 SSH、HTTP、HTTPS）..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

log "配置 pm2 并启动应用..."
cd "${APP_DIR}"
cat > ecosystem.config.js <<EOF
module.exports = {
  apps: [{
    name: 'toolbox',
    script: './server/server.js',
    cwd: '${APP_DIR}',
    args: '--experimental-sqlite',
    env: {
      NODE_ENV: 'production',
      PORT: ${PORT},
      WM_PORT: ${WM_PORT},
      WM_BASE_PATH: '${WM_BASE_PATH}'
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    restart_delay: 3000
  }]
};
EOF

pm2 delete toolbox 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u "${APP_USER}" 2>/dev/null || true
pm2 save

PUBLIC_IP=$(wget -qO- https://api.ip.sb/ip 2>/dev/null || echo "你的服务器公网IP")

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  部署完成！${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "  网站首页：http://${PUBLIC_IP}"
echo "  去水印工具：http://${PUBLIC_IP}${WM_BASE_PATH}/"
echo ""
echo "  常用管理命令："
echo "    pm2 status            查看运行状态"
echo "    pm2 logs toolbox      查看应用日志"
echo "    pm2 restart toolbox   重启应用"
echo "    nginx -t              检查 Nginx 配置"
echo "    systemctl restart nginx  重启 Nginx"
echo ""
echo "  数据文件位置：${APP_DIR}/data/toolbox.db"
echo "  后续可安装宝塔面板获得图形化管理界面。"
echo ""
echo -e "${YELLOW}重要：若外网仍无法访问，请到 腾讯云控制台 → 轻量应用服务器 → 防火墙，放行 80 与 443 端口${NC}"
echo ""
