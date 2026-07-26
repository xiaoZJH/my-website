# toolbox-website 部署指南 · 本地 → Gitee → 服务器

> **架构**：本地 `git push gitee` → Gitee WebHook 通知服务器 → `webhook-server.js` 接收并验证 → `deploy.sh` 拉代码 + 重启 pm2

---

## 一、首次部署（在服务器上执行一次）

### 前置条件
- 腾讯云轻量服务器 Ubuntu 22.04（root 用户）
- 域名已解析到服务器 IP（可选，没有就用 IP 访问）

### 步骤

```bash
# 1. SSH 登录服务器
ssh root@你的服务器IP

# 2. 克隆代码（从 Gitee）
cd /opt
git clone https://gitee.com/Python-Z/my-website.git toolbox-website
cd toolbox-website

# 3. 执行一键部署脚本（装 Node.js / Python / Nginx / pm2 / 防火墙）
sudo bash setup.sh

# 4. 修改 WebHook 密码（重要！改成你自己的强密码）
# 编辑 ecosystem.config.js，把 WEBHOOK_SECRET 改掉：
nano ecosystem.config.js
# 找到这行，改值：
#   WEBHOOK_SECRET: 'CHANGE_ME_TO_A_STRONG_SECRET',
# 改成类似：
#   WEBHOOK_SECRET: 'your-random-secret-here-2026',

# 5. 给部署脚本执行权限
chmod +x deploy.sh

# 6. 重启 pm2 使 webhook 进程生效
pm2 restart all
pm2 save
```

### 验证首次部署
```bash
# 检查两个进程都在跑
pm2 status
# 应该看到：toolbox ✓ 和 toolbox-webhook ✓

# 检查 WebHook 端口是否监听
curl http://localhost:9000/hooks/deploy?health=1
# 应返回 JSON：{"ok":true,"service":"toolbox-webhook",...}

# 检查网站是否可访问
curl http://localhost:4173/
```

---

## 二、配置 Gitee WebHook（一次性操作）

1. 打开 Gitee 仓库页面：`https://gitee.com/Python-Z/my-website`
2. 点击顶部 **管理** → 左侧 **WebHooks**
3. 点击 **添加 WebHook**，填写：
   - **URL**：`http://你的服务器IP:9000/hooks/deploy`
     - 如果有域名 + HTTPS：`https://你的域名/hooks/deploy`
   - **密码**：填你在 `ecosystem.config.js` 里设的 `WEBHOOK_SECRET`
   - **勾选事件**：✅ Push 事件（只勾这个就够了）
4. 点击 **确定** 保存

### 测试 WebHook 是否通
在 Gitee WebHook 列表点刚创建的 WebHook 右边的 **测试** 按钮。
然后看服务器日志：
```bash
pm2 logs toolbox-webhook --lines 20
# 应该看到 "收到推送" 和 "开始执行部署脚本"
```

---

## 三、日常使用流程（本地开发 → 自动上线）

```bash
# 本地开发完成后：
cd E:\新建文件夹\新建文件夹\toolbox-website

git add -A
git commit -m "feat: 新功能描述"
git push gitee main

# ✅ 推送后 10~30 秒内，Gitee 会自动触发服务器部署
# 不需要 SSH 上服务器手动操作！
```

### 查看部署状态
```bash
# 在服务器上：
sudo pm2 status          # 看进程状态
sudo pm2 logs toolbox    # 看主应用日志
sudo pm2 logs toolbox-webhook  # 看 WebHook / 部署日志
cat /var/log/toolbox-deploy.log  # 看 deploy.sh 详细日志
```

也可以用维护面板（SSH 到服务器后运行）：
```bash
bash /opt/toolbox-website/maintain.sh
```

---

## 四、文件说明

| 文件 | 用途 | 运行位置 |
|------|------|---------|
| `setup.sh` | 首次一键部署（装环境 + 克隆代码 + 配 Nginx） | 服务器，仅首次 |
| `deploy.sh` | WebHook 触发的自动部署脚本（拉代码 + 重启） | 服务器，自动调用 |
| `webhook-server.js` | 接收 Gitee WebHook 的 Node.js 服务 | 服务器，pm2 守护 |
| `ecosystem.config.js` | pm2 配置（主应用 + WebHook 两个进程） | 服务器 |
| `maintain.sh` | 手动维护面板（查看状态/日志/重启） | 服务器，按需 |

---

## 五、安全建议（重要！）

1. **WebHook 密码必须改**：默认的 `CHANGE_ME_TO_A_STRONG_SECRET` 绝对不能用于生产环境
2. **防火墙限制 9000 端口**：如果不需要从外网直接访问 WebHook，用 ufw 只允许本机：
   ```bash
   ufw deny in on eth0 to any port 9000
   # 或者用 Nginx 反代到 HTTPS + IP 白名单
   ```
3. **推荐用 Nginx 反代 WebHook**（可选但更安全）：
   ```nginx
   # 在 /etc/nginx/sites-available/toolbox 的 server 块里加：
   location /hooks/ {
       proxy_pass http://127.0.0.1:9000;
       # 限制只有 Gitee 的 IP 能访问（查 Gitee 官方文档获取 IP 段）
       allow 你的服务器自身IP;
       deny all;
   }
   ```
   这样 Gitee WebHook URL 就变成：`https://你的域名/hooks/deploy`

---

## 六、故障排查

| 问题 | 排查命令 | 解决方法 |
|------|---------|---------|
| WebHook 不触发 | `pm2 logs toolbox-webhook` | 检查密码是否一致、端口是否开放 |
| git pull 报错 | `cd /opt/toolbox-website && git fetch gitee` | 检查网络、SSH key 或 HTTPS 凭证 |
| pm2 进程挂了 | `pm2 status` | `pm2 restart all && pm2 save` |
| 网站打不开 | `nginx -t && systemctl status nginx` | 检查 Nginx 配置和防火墙 |
| 端口被占用 | `ss -tlnp \| grep 4173` | `pm2 delete toolbox; pm2 start ecosystem.config.js` |
