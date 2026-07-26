/**
 * toolbox-website · Gitee WebHook 接收端
 *
 * 监听 Gitee Push 事件，验证密码后触发 deploy.sh 自动部署。
 * 由 pm2 守护运行，与主应用 server.js 并存。
 *
 * 环境变量：
 *   WEBHOOK_PORT   - 监听端口（默认 9000）
 *   WEBHOOK_SECRET - Gitee WebHook 密码（必须与 Gitee 后台一致）
 *   DEPLOY_SCRIPT  - 部署脚本路径（默认 /opt/toolbox-website/deploy.sh）
 */

const http = require('node:http');
const { execFile } = require('node:child_process');
const fs = require('node:fs');

const PORT = parseInt(process.env.WEBHOOK_PORT || '9000', 10);
const SECRET = process.env.WEBHOOK_SECRET || '';
const DEPLOY_SCRIPT = process.env.DEPLOY_SCRIPT || '/opt/toolbox-website/deploy.sh';
const LOG_FILE = '/var/log/toolbox-webhook.log';

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}\n`;
  // 尝试写文件日志，失败时静默
  try { fs.appendFileSync(LOG_FILE, line); } catch (_) {}
  console.log(line.trimEnd());
}

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Powered-By': 'toolbox-webhook/1.0'
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  // 只接受 POST /hooks/deploy
  if (req.method !== 'POST' || req.url !== '/hooks/deploy') {
    return send(res, 404, { ok: false, error: 'not found' });
  }

  // 验证 WebHook 密码
  const token = (req.headers['x-gitee-token'] || '').trim();
  if (!SECRET) {
    log('ERROR: 未设置 WEBHOOK_SECRET 环境变量，拒绝所有请求');
    return send(res, 500, { ok: false, error: 'server not configured' });
  }
  if (token !== SECRET) {
    log(`WARN: 密码不匹配 (received: "${token.substring(0, 4)}...")`);
    return send(res, 403, { ok: false, error: 'invalid token' });
  }

  // 读取请求体
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString());
    } catch (e) {
      return send(res, 400, { ok: false, error: 'invalid json' });
    }

    // 仅处理 Push 事件（Gitee hook 的 hook 字段）
    const eventType = body.hook || req.headers['x-gitee-event'] || '';
    if (eventType !== 'push_hooks') {
      log(`忽略非 push 事件: ${eventType}`);
      return send(res, 200, { ok: true, message: `event "${eventType}" ignored` });
    }

    const ref = body.ref || '';
    const commit = body.after ? body.after.substring(0, 8) : 'unknown';
    const pusher = body.pusher?.name || 'unknown';
    log(`收到推送: ${ref} by ${pusher} (${commit})`);

    // 检查是否是 main 分支的推送
    if (ref !== 'refs/heads/main') {
      log(`跳过非 main 分支: ${ref}`);
      return send(res, 200, { ok: true, message: `branch "${ref}" skipped` });
    }

    // 异步执行部署脚本，立即返回避免 Gitee 超时
    log('开始执行部署脚本...');
    send(res, 200, { ok: true, message: 'deploy triggered', commit });

    const env = { ...process.env, WEBHOOK_SECRET: SECRET };
    const child = execFile(
      '/bin/bash',
      [DEPLOY_SCRIPT],
      { env, timeout: 120_000 },
      (error, stdout, stderr) => {
        if (error) {
          log(`部署失败: ${error.message}`);
          if (stderr) log(`stderr: ${stderr}`);
          return;
        }
        log(`部署成功: ${stdout?.trim() || '(no output)'}`);
      }
    );
  });
});

// 健康检查路由：GET /hooks/deploy?health=1
// 用于 Nginx upstream check 或人工确认服务存活
server.on('request', (req, res) => {
  if (req.method === 'GET' && req.url === '/hooks/deploy') {
    const qs = new URL(req.url, `http://localhost:${PORT}`).searchParams;
    if (qs.get('health')) {
      return send(res, 200, {
        ok: true,
        service: 'toolbox-webhook',
        port: PORT,
        uptime: process.uptime(),
        configured: !!SECRET,
        script: DEPLOY_SCRIPT
      });
    }
  }
});

server.listen(PORT, () => {
  log(`WebHook 接收端已启动，监听 :${PORT}`);
  log(`端点: POST http://localhost:${PORT}/hooks/deploy`);
  log(`健康检查: GET http://localhost:${PORT}/hooks/deploy?health=1`);
  if (!SECRET) {
    log('WARNING: 未设置 WEBHOOK_SECRET！请在 .env 或 pm2 配置中设置密码');
  }
});
