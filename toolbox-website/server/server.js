'use strict';

/**
 * 个人工具箱 · 全栈服务
 * 零外部依赖：Node 内置 http + node:sqlite（真实访问统计）
 * 启动：node --experimental-sqlite server/server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 4173;
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'toolbox.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- Database ----------
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    path TEXT NOT NULL DEFAULT '/',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_visits_created ON visits(created_at);

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    excerpt TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    cover TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    reading_min INTEGER NOT NULL DEFAULT 3,
    created_at INTEGER NOT NULL
  );
`);

function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM posts').get().c;
  if (count > 0) return;
  const posts = [
    {
      slug: 'welcome',
      title: '欢迎来到我的个人工具箱',
      excerpt: '这里 collects 我在日常开发与生活中高频使用的小工具，以及一个随手记录想法的博客角落。',
      body:
        '这是一个用极简技术栈搭建的个人空间：前端是无构建步骤的原生页面，后端仅依赖 Node 内置模块与 SQLite，访问数据全部落在本地数据库里，不依赖任何第三方统计服务。\n\n你看到的每一个工具都能在浏览器里直接运行——JSON 格式化、时间戳转换、密码生成……它们不需要上传任何数据。\n\n博客部分我会不定期写一些开发笔记和产品思考。如果某个工具有用，或者你有想加进来的工具，欢迎留言告诉我。',
      cover: 'linear-gradient(135deg,#0ea5a4 0%,#22d3ee 100%)',
      tags: '公告,随笔',
      reading_min: 2,
    },
    {
      slug: 'why-local-first',
      title: '为什么我把工具箱做成 Local-First',
      excerpt: '在线工具千千万，但把数据交给别人总让人心里不踏实。聊聊我做这个工具箱的几个取舍。',
      body:
        '大多数在线小工具都会把你的输入发到服务器。对一段要格式化的 JSON、一个要编码的 token 来说，这未必安全，也未必必要。\n\n这个工具箱里的所有计算都在你的浏览器本地完成，后端只做一件事：记录"有人来过"。连统计都不带任何身份信息，只存一个匿名的访问计数。\n\n技术上，它跑在一个不到两百行的 Node 服务上，数据库是单文件 SQLite，拷贝整个文件夹就能换台机器继续用。',
      cover: 'linear-gradient(135deg,#6366f1 0%,#a855f7 100%)',
      tags: '技术,思考',
      reading_min: 4,
    },
    {
      slug: 'dev-tools-roundup',
      title: '我每天都在用的 5 个开发者小工具',
      excerpt: '不是什么大东西，但少了它们，一天的工作效率会肉眼可见地下降。',
      body:
        '1. JSON 格式化：粘贴一团乱麻，一键展开、折叠、校验。\n\n2. 时间戳转换：在 Unix 秒、毫秒和可读时间之间来回横跳。\n\n3. 密码生成器：自定义长度与字符集，顺手复制到剪贴板。\n\n4. Base64 编解码：调试接口时永远用得上。\n\n5. UUID 生成：写测试、造数据时的救命稻草。\n\n这些工具单独看都不起眼，但组合在一个随手可达的页面里，省下的上下文切换成本相当可观。',
      cover: 'linear-gradient(135deg,#f59e0b 0%,#ef4444 100%)',
      tags: '效率,开发',
      reading_min: 3,
    },
  ];
  const ins = db.prepare(
    'INSERT INTO posts (slug,title,excerpt,body,cover,tags,reading_min,created_at) VALUES (?,?,?,?,?,?,?,?)'
  );
  const now = Date.now();
  posts.forEach((p, i) => ins.run(p.slug, p.title, p.excerpt, p.body, p.cover, p.tags, p.reading_min, now - i * 86400000));
}
seedIfEmpty();

// ---------- Helpers ----------
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function getStats() {
  const total = db.prepare('SELECT COUNT(*) AS c FROM visits').get().c;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const today = db.prepare('SELECT COUNT(*) AS c FROM visits WHERE created_at >= ?').get(startOfToday.getTime()).c;
  const unique = db.prepare('SELECT COUNT(DISTINCT ip) AS c FROM visits').get().c;
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const next = d.getTime() + 86400000;
    const c = db.prepare('SELECT COUNT(*) AS c FROM visits WHERE created_at >= ? AND created_at < ?').get(d.getTime(), next).c;
    last7.push({ date: `${d.getMonth() + 1}/${d.getDate()}`, count: c });
  }
  return { total, today, unique, last7 };
}

function recordVisit(req) {
  let payload = {};
  try {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try { payload = JSON.parse(raw || '{}'); } catch (_) { payload = {}; }
      const ip = clientIp(req);
      const p = (payload.path || '/').toString().slice(0, 200);
      const now = Date.now();
      // 同一 IP 30 分钟内同一路径只计一次"独立访问"，避免刷新刷数据
      const recent = db.prepare(
        'SELECT id FROM visits WHERE ip=? AND path=? AND created_at >= ? LIMIT 1'
      ).get(ip, p, now - 30 * 60 * 1000);
      if (!recent) db.prepare('INSERT INTO visits (ip,path,created_at) VALUES (?,?,?)').run(ip, p, now);
      json(req.res, 200, { ok: true });
    });
  } catch (_) {
    json(req.res, 200, { ok: true });
  }
}

// ---------- Static serving ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------- 去水印 sidecar（Flask + OpenCV） ----------
const WM_APP = path.join(ROOT, 'tools', 'watermark-remover', 'app.py');
const WM_PORT = parseInt(process.env.WM_PORT || '5001', 10);
let wmChild = null;

function resolveWmPython() {
  const cands = [
    process.env.WM_PYTHON,
    path.join(ROOT, 'tools', 'watermark-remover', '.venv', 'Scripts', 'python.exe'), // Windows venv
    path.join(ROOT, 'tools', 'watermark-remover', '.venv', 'bin', 'python'),         // Linux/macOS venv
    'python3',
    'python',
  ].filter(Boolean);
  for (const c of cands) {
    try { if (fs.existsSync(c)) return c; } catch (_) {}
  }
  return null;
}

function startWatermark() {
  if (process.env.WM_ENABLED === '0') return;
  if (!fs.existsSync(WM_APP)) return;
  const py = resolveWmPython();
  if (!py) {
    console.log('  [去水印] 未找到 Python 解释器，已跳过自动启动（前端将提示手动安装）');
    return;
  }
  try {
    wmChild = spawn(py, [WM_APP], {
      env: { ...process.env, WM_PORT: String(WM_PORT) },
      cwd: path.dirname(WM_APP),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    wmChild.stdout.on('data', () => {});
    wmChild.stderr.on('data', (d) => {
      const s = d.toString();
      if (/Error|Traceback|Exception|critical/i.test(s)) console.error('  [去水印]', s.trim().split('\n')[0]);
    });
    wmChild.on('exit', (code) => {
      console.log(`  [去水印] 子进程已退出 (code=${code})`);
      wmChild = null;
    });
    console.log(`  去水印服务启动中 → http://127.0.0.1:${WM_PORT}  (python: ${py})`);
  } catch (e) {
    console.error('  [去水印] 启动失败：', e.message);
  }
}

function stopWatermark() {
  if (wmChild) { try { wmChild.kill(); } catch (_) {} wmChild = null; }
}
process.on('SIGINT', () => { stopWatermark(); process.exit(0); });
process.on('SIGTERM', () => { stopWatermark(); process.exit(0); });

// ---------- Router ----------
const server = http.createServer((req, res) => {
  req.res = res;
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname === '/api/stats' && req.method === 'GET') {
    return json(res, 200, getStats());
  }
  if (pathname === '/api/visit' && req.method === 'POST') {
    return recordVisit(req);
  }
  if (pathname === '/api/posts' && req.method === 'GET') {
    const rows = db.prepare(
      'SELECT id,slug,title,excerpt,cover,tags,reading_min,created_at FROM posts ORDER BY created_at DESC'
    ).all();
    return json(res, 200, { posts: rows });
  }
  if (pathname.startsWith('/api/posts/') && req.method === 'GET') {
    const slug = pathname.replace('/api/posts/', '');
    const row = db.prepare('SELECT * FROM posts WHERE slug=?').get(slug);
    if (!row) return json(res, 404, { error: 'not found' });
    return json(res, 200, { post: row });
  }

  if (pathname === '/api/wm-status' && req.method === 'GET') {
    const req2 = http.get({ host: '127.0.0.1', port: WM_PORT, path: '/', timeout: 1500 }, (r) => {
      r.resume();
      json(res, 200, { ok: r.statusCode < 400 });
    });
    req2.on('error', () => json(res, 200, { ok: false }));
    req2.on('timeout', () => { req2.destroy(); json(res, 200, { ok: false }); });
    return;
  }

  if (pathname.startsWith('/api/')) return json(res, 404, { error: 'not found' });
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`\n  个人工具箱已启动 → http://localhost:${PORT}\n  数据库：${DB_PATH}\n`);
  startWatermark();
});
