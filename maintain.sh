#!/bin/bash
# 戴鑫杰个人工具箱网站 - 一键维护面板
# 适用：Ubuntu 22.04 + pm2 + Nginx

set -e

APP_DIR="/opt/toolbox-website"
LOG_LINES=50

red='\033[0;31m'
green='\033[0;32m'
yellow='\033[1;33m'
blue='\033[0;34m'
nc='\033[0m'

show_menu() {
  clear
  echo -e "${blue}===== 戴鑫杰个人工具箱维护面板 =====${nc}"
  echo ""
  echo "  1) 查看网站运行状态"
  echo "  2) 查看最近日志（排错用）"
  echo "  3) 从 GitHub 更新代码并重启"
  echo "  4) 重启网站"
  echo "  5) 查看服务器资源（CPU/内存/磁盘）"
  echo "  6) 备份数据库"
  echo "  7) 查看端口占用"
  echo "  0) 退出"
  echo ""
}

status() {
  echo -e "${yellow}[网站状态]${nc}"

  echo -n "主页          : "
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 http://127.0.0.1:4173/ || echo "000")
  if [ "$CODE" = "200" ]; then
    echo -e "${green}正常 ($CODE)${nc}"
  else
    echo -e "${red}异常 ($CODE)${nc}"
  fi

  echo -n "去水印服务    : "
  WM=$(curl -s --max-time 8 http://127.0.0.1:4173/api/wm-status || echo '{"ok":false}')
  if echo "$WM" | grep -q '"ok":true'; then
    echo -e "${green}正常${nc}"
  else
    echo -e "${red}异常${nc}"
  fi

  echo -n "pm2 进程      : "
  if pm2 describe toolbox >/dev/null 2>&1; then
    echo -e "${green}运行中${nc}"
  else
    echo -e "${red}未运行${nc}"
  fi
}

view_logs() {
  echo -e "${yellow}[最近 $LOG_LINES 行日志]${nc}"
  pm2 logs toolbox --lines "$LOG_LINES" || true
}

update_code() {
  echo -e "${yellow}[更新代码并重启]${nc}"
  cd "$APP_DIR"
  git fetch gitee
  git reset --hard gitee/main
  pm2 restart toolbox
  echo -e "${green}完成${nc}"
}

restart_app() {
  echo -e "${yellow}[重启网站]${nc}"
  pm2 restart toolbox
  echo -e "${green}完成${nc}"
}

resources() {
  echo -e "${yellow}[服务器资源]${nc}"
  echo "--- 内存 ---"
  free -h
  echo ""
  echo "--- 磁盘 ---"
  df -h /
  echo ""
  echo "--- 内存占用 TOP 进程 ---"
  ps aux --sort=-%mem | head -n 6
}

backup_db() {
  BACKUP_DIR="$APP_DIR/backups"
  mkdir -p "$BACKUP_DIR"
  TS=$(date +%Y%m%d_%H%M%S)
  cp "$APP_DIR/data/toolbox.db" "$BACKUP_DIR/toolbox_$TS.db"
  echo -e "${green}已备份到: $BACKUP_DIR/toolbox_$TS.db${nc}"
}

ports() {
  echo -e "${yellow}[端口监听]${nc}"
  ss -tlnp | grep -E '4173|5001|80|443' || true
}

while true; do
  show_menu
  read -p "请选择 [0-7]: " choice
  case $choice in
    1) status; read -p "按回车继续..." ;;
    2) view_logs ;;
    3) update_code; read -p "按回车继续..." ;;
    4) restart_app; read -p "按回车继续..." ;;
    5) resources; read -p "按回车继续..." ;;
    6) backup_db; read -p "按回车继续..." ;;
    7) ports; read -p "按回车继续..." ;;
    0) echo "退出"; exit 0 ;;
    *) echo -e "${red}无效选择${nc}"; read -p "按回车继续..." ;;
  esac
done
