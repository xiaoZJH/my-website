'use strict';

/**
 * 个人工具箱 · 全栈服务
 * 零外部依赖：Node 内置 http + node:sqlite（真实访问统计 + 用户账户）
 * 启动：node --experimental-sqlite server/server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const sms = require('./sms');

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

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    phone TEXT UNIQUE,
    password_hash TEXT,
    display_name TEXT,
    phone_verified INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sms_codes (
    phone TEXT NOT NULL,
    code TEXT NOT NULL,
    purpose TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sms_phone ON sms_codes(phone, purpose);
`);

// 兼容旧库：补充 guest 与头像字段（忽略已存在报错）
try { db.exec('ALTER TABLE users ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
try { db.exec('ALTER TABLE users ADD COLUMN avatar TEXT'); } catch (_) {}

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

function readJson(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch (_) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
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

// ---------- Auth helpers（零依赖：crypto.scrypt + node:sqlite） ----------
const SESSION_TTL = 30 * 24 * 3600; // 30 天（秒）
const CODE_TTL = 5 * 60 * 1000;     // 短信验证码有效期（毫秒）

function hashPassword(pw) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(pw, salt, 64, (err, derived) => {
      if (err) return reject(err);
      resolve('scrypt$' + salt.toString('hex') + '$' + derived.toString('hex'));
    });
  });
}

function verifyPassword(pw, stored) {
  return new Promise((resolve) => {
    if (!stored || !stored.startsWith('scrypt$')) return resolve(false);
    const parts = stored.split('$');
    const saltHex = parts[1];
    const hashHex = parts[2];
    if (!saltHex || !hashHex) return resolve(false);
    let salt, hash;
    try { salt = Buffer.from(saltHex, 'hex'); hash = Buffer.from(hashHex, 'hex'); } catch (_) { return resolve(false); }
    crypto.scrypt(pw, salt, 64, (err, derived) => {
      if (err) return resolve(false);
      try { resolve(crypto.timingSafeEqual(derived, hash)); } catch (_) { resolve(false); }
    });
  });
}

function newToken() { return crypto.randomBytes(32).toString('hex'); }
function genCode() { return String(crypto.randomInt(0, 1000000)).padStart(6, '0'); }

function parseCookies(req) {
  const h = req.headers.cookie;
  const out = {};
  if (!h) return out;
  h.split(';').forEach((p) => {
    const idx = p.indexOf('=');
    if (idx < 0) return;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function cookieSecure(req) {
  return req.headers['x-forwarded-proto'] === 'https' || process.env.COOKIE_SECURE === '1';
}

function setSessionCookie(res, token, maxAge, secure) {
  res.setHeader('Set-Cookie',
    `tb_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}` + (secure ? '; Secure' : ''));
}
function clearSessionCookie(res, secure) {
  res.setHeader('Set-Cookie',
    `tb_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0` + (secure ? '; Secure' : ''));
}

function stripHash(u) { const { password_hash, ...rest } = u; return rest; }
function publicUser(u) {
  if (!u) return null;
  const r = stripHash(u);
  r.phone_verified = !!r.phone_verified;
  r.is_guest = !!r.is_guest;
  return r;
}

async function getCurrentUser(req) {
  const token = parseCookies(req).tb_session;
  if (!token) return null;
  const sess = db.prepare('SELECT * FROM sessions WHERE token=?').get(token);
  if (!sess) return null;
  if (sess.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token=?').run(token);
    return null;
  }
  const user = db.prepare(
    'SELECT id,username,email,phone,display_name,phone_verified,is_guest,avatar,created_at FROM users WHERE id=?'
  ).get(sess.user_id);
  return user || null;
}

async function createSessionFor(res, req, userId) {
  const token = newToken();
  const now = Date.now();
  const expires = now + SESSION_TTL * 1000;
  db.prepare('INSERT INTO sessions (token,user_id,created_at,expires_at) VALUES (?,?,?,?)')
    .run(token, userId, now, expires);
  setSessionCookie(res, token, SESSION_TTL, cookieSecure(req));
  return token;
}

// ---------- Auth handlers ----------
async function handleRegister(req, res) {
  const b = await readJson(req);
  let username = String(b.username || '').trim();
  let password = String(b.password || '');
  const email = b.email ? String(b.email).trim() : '';
  const phone = b.phone ? String(b.phone).trim() : '';
  const code = b.code ? String(b.code).trim() : '';

  // 手机号+验证码一键注册：自动用手机号作为账号，验证码作为初始密码
  const phoneOnly = !username && !password && phone && code;
  if (phoneOnly) {
    username = phone;
    password = code;
  }

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return json(res, 400, { error: '用户名需为 3-20 位字母/数字/下划线' });
  if (phoneOnly ? password.length < 6 : password.length < 8) return json(res, 400, { error: phoneOnly ? '请输入 6 位验证码' : '密码至少 8 位' });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(res, 400, { error: '邮箱格式不正确' });
  if (phone && !/^1[3-9]\d{9}$/.test(phone)) return json(res, 400, { error: '手机号格式不正确' });
  if (!phoneOnly && !email && !phone) return json(res, 400, { error: '请至少提供邮箱或手机号之一' });

  if (db.prepare('SELECT id FROM users WHERE username=?').get(username)) return json(res, 409, { error: '用户名已被占用' });
  if (email && db.prepare('SELECT id FROM users WHERE email=?').get(email)) return json(res, 409, { error: '邮箱已被注册' });
  if (phone && db.prepare('SELECT id FROM users WHERE phone=?').get(phone)) return json(res, 409, { error: '手机号已被注册' });

  let phoneVerified = 0;
  if (phone && code) {
    const row = db.prepare('SELECT * FROM sms_codes WHERE phone=? AND purpose=? ORDER BY created_at DESC LIMIT 1').get(phone, 'register');
    if (!row || row.expires_at < Date.now() || row.code !== code) return json(res, 400, { error: '手机验证码错误或未获取' });
    phoneVerified = 1;
    db.prepare('DELETE FROM sms_codes WHERE phone=? AND purpose=?').run(phone, 'register');
  }

  let hash;
  try { hash = await hashPassword(password); } catch (e) { return json(res, 500, { error: '密码处理失败' }); }

  const info = db.prepare(
    'INSERT INTO users (username,email,phone,password_hash,display_name,phone_verified,created_at) VALUES (?,?,?,?,?,?,?)'
  ).run(username, email || null, phone || null, hash, username, phoneVerified, Date.now());

  await createSessionFor(res, req, info.lastInsertRowid);
  const user = db.prepare('SELECT id,username,email,phone,display_name,phone_verified,is_guest,avatar,created_at FROM users WHERE id=?').get(info.lastInsertRowid);
  return json(res, 200, { ok: true, user: publicUser(user) });
}

async function handleLogin(req, res) {
  const b = await readJson(req);
  const identifier = String(b.identifier || b.username || '').trim();
  const password = String(b.password || '');
  if (!identifier || !password) return json(res, 400, { error: '请输入账号和密码' });

  const user = db.prepare('SELECT * FROM users WHERE username=? OR email=? OR phone=?').get(identifier, identifier, identifier);
  if (!user) return json(res, 401, { error: '账号不存在' });
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return json(res, 401, { error: '密码错误' });

  await createSessionFor(res, req, user.id);
  return json(res, 200, { ok: true, user: publicUser(user) });
}

async function handleLoginCode(req, res) {
  const b = await readJson(req);
  const phone = String(b.phone || '').trim();
  const code = String(b.code || '').trim();
  if (!/^1[3-9]\d{9}$/.test(phone)) return json(res, 400, { error: '手机号格式不正确' });

  const row = db.prepare('SELECT * FROM sms_codes WHERE phone=? AND purpose=? ORDER BY created_at DESC LIMIT 1').get(phone, 'login');
  if (!row || row.expires_at < Date.now() || row.code !== code) return json(res, 400, { error: '验证码错误或未获取' });

  const user = db.prepare('SELECT * FROM users WHERE phone=?').get(phone);
  if (!user) return json(res, 401, { error: '该手机号尚未注册' });

  db.prepare('DELETE FROM sms_codes WHERE phone=? AND purpose=?').run(phone, 'login');
  db.prepare('UPDATE users SET phone_verified=1 WHERE id=?').run(user.id);
  await createSessionFor(res, req, user.id);
  return json(res, 200, { ok: true, user: publicUser(user) });
}

async function handleSendCode(req, res) {
  const b = await readJson(req);
  const phone = String(b.phone || '').trim();
  const purpose = String(b.purpose || 'register');
  if (!/^1[3-9]\d{9}$/.test(phone)) return json(res, 400, { error: '手机号格式不正确' });
  if (!['register', 'login'].includes(purpose)) return json(res, 400, { error: '未知用途' });

  const last = db.prepare('SELECT * FROM sms_codes WHERE phone=? AND purpose=? ORDER BY created_at DESC LIMIT 1').get(phone, purpose);
  if (last && Date.now() - last.created_at < 60000) return json(res, 429, { error: '发送过于频繁，请 60 秒后再试' });

  const code = genCode();
  const now = Date.now();
  db.prepare('INSERT INTO sms_codes (phone,code,purpose,expires_at,created_at) VALUES (?,?,?,?,?)')
    .run(phone, code, purpose, now + CODE_TTL, now);

  const sent = await sms.sendSmsCode(phone, code, purpose);
  const devCode = process.env.NODE_ENV === 'production' ? undefined : code;
  return json(res, 200, {
    ok: true,
    devCode,
    sent: !!sent,
    message: sent ? '验证码已发送' : '开发态：验证码已打印到服务器控制台',
  });
}

async function handleVerifyCode(req, res) {
  const b = await readJson(req);
  const phone = String(b.phone || '').trim();
  const code = String(b.code || '').trim();
  const purpose = String(b.purpose || 'register');
  const row = db.prepare('SELECT * FROM sms_codes WHERE phone=? AND purpose=? ORDER BY created_at DESC LIMIT 1').get(phone, purpose);
  if (!row || row.expires_at < Date.now()) return json(res, 400, { error: '验证码已过期，请重新获取' });
  if (row.code !== code) return json(res, 400, { error: '验证码错误' });
  return json(res, 200, { ok: true });
}

async function handleLogout(req, res) {
  const token = parseCookies(req).tb_session;
  if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
  clearSessionCookie(res, cookieSecure(req));
  return json(res, 200, { ok: true });
}

async function handleGuest(req, res) {
  const b = await readJson(req);
  const displayName = String(b.display_name || '').trim();
  const avatar = String(b.avatar || '0').trim();

  if (!displayName || displayName.length < 2 || displayName.length > 20) {
    return json(res, 400, { error: '昵称需为 2-20 个字符' });
  }
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(avatar) && !/^[0-3]$/.test(avatar)) {
    return json(res, 400, { error: '头像格式不正确' });
  }

  const username = 'guest_' + crypto.randomBytes(6).toString('hex');
  const info = db.prepare(
    'INSERT INTO users (username,email,phone,password_hash,display_name,phone_verified,is_guest,avatar,created_at) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(username, null, null, null, displayName, 0, 1, avatar, Date.now());

  await createSessionFor(res, req, info.lastInsertRowid);
  const user = db.prepare('SELECT id,username,email,phone,display_name,phone_verified,is_guest,avatar,created_at FROM users WHERE id=?').get(info.lastInsertRowid);
  return json(res, 200, { ok: true, user: publicUser(user) });
}

async function handleMe(req, res) {
  const user = await getCurrentUser(req);
  return json(res, 200, { user: user ? publicUser(user) : null });
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
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(data);
  });
}

// ---------- 去水印反向代理（同源 /watermark-remover/* → 内部 Flask :WM_PORT） ----------
function proxyWatermark(req, res) {
  const options = {
    host: '127.0.0.1',
    port: WM_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${WM_PORT}` },
  };
  const proxyReq = http.request(options, (proxyRes) => {
    const headers = { ...proxyRes.headers };
    // 去掉可能导致 Node 重复分块的编码头，由 Node 正常流式转发
    if (headers['transfer-encoding']) delete headers['transfer-encoding'];
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (e) => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('去水印服务暂时不可用（' + (e.code || e.message) + '），请确认后端已启动');
  });
  req.pipe(proxyReq);
}

// ---------- 去水印 sidecar（Flask + OpenCV） ----------
const WM_APP = path.join(ROOT, 'tools', 'watermark-remover', 'app.py');
// 默认前缀与 Nginx 反代 / 反向代理路径一致；生产环境可用环境变量覆盖
const WM_BASE_PATH = process.env.WM_BASE_PATH || '/watermark-remover';
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
    env: { ...process.env, WM_PORT: String(WM_PORT), WM_BASE_PATH },
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
process.on('SIGINT', () => { stopWatermark(); stopDocxWatermark(); process.exit(0); });
process.on('SIGTERM', () => { stopWatermark(); stopDocxWatermark(); process.exit(0); });

// ---------- Word 图片导出 / 批量水印 sidecar（Flask + 标准库，仅抽取图片） ----------
const DOCX_APP = path.join(ROOT, 'tools', 'docx-watermark', 'app.py');
// 默认前缀与反向代理路径一致；生产环境可用环境变量覆盖
const DOCX_BASE_PATH = process.env.DOCX_BASE_PATH || '/docx-watermark';
const DOCX_PORT = parseInt(process.env.DOCX_PORT || '5002', 10);
let docxChild = null;

function resolveDocxPython() {
  const cands = [
    process.env.DOCX_PYTHON,
    path.join(ROOT, 'tools', 'docx-watermark', '.venv', 'Scripts', 'python.exe'),
    path.join(ROOT, 'tools', 'docx-watermark', '.venv', 'bin', 'python'),
    path.join(ROOT, 'tools', 'watermark-remover', '.venv', 'Scripts', 'python.exe'), // 复用已装 Flask 的 venv
    path.join(ROOT, 'tools', 'watermark-remover', '.venv', 'bin', 'python'),
    'python3',
    'python',
  ].filter(Boolean);
  for (const c of cands) {
    try { if (fs.existsSync(c)) return c; } catch (_) {}
  }
  return null;
}

function startDocxWatermark() {
  if (process.env.DOCX_ENABLED === '0') return;
  if (!fs.existsSync(DOCX_APP)) return;
  const py = resolveDocxPython();
  if (!py) {
    console.log('  [docx 水印] 未找到 Python 解释器，已跳过自动启动（前端将提示手动安装 Flask）');
    return;
  }
  try {
    docxChild = spawn(py, [DOCX_APP], {
      env: { ...process.env, DOCX_PORT: String(DOCX_PORT), DOCX_BASE_PATH },
      cwd: path.dirname(DOCX_APP),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    docxChild.stdout.on('data', () => {});
    docxChild.stderr.on('data', (d) => {
      const s = d.toString();
      if (/Error|Traceback|Exception|critical/i.test(s)) console.error('  [docx 水印]', s.trim().split('\n')[0]);
    });
    docxChild.on('exit', (code) => {
      console.log(`  [docx 水印] 子进程已退出 (code=${code})`);
      docxChild = null;
    });
    console.log(`  Word 图片导出服务启动中 → http://127.0.0.1:${DOCX_PORT}  (python: ${py})`);
  } catch (e) {
    console.error('  [docx 水印] 启动失败：', e.message);
  }
}

function stopDocxWatermark() {
  if (docxChild) { try { docxChild.kill(); } catch (_) {} docxChild = null; }
}

function proxyDocx(req, res) {
  const options = {
    host: '127.0.0.1',
    port: DOCX_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${DOCX_PORT}` },
  };
  const proxyReq = http.request(options, (proxyRes) => {
    const headers = { ...proxyRes.headers };
    if (headers['transfer-encoding']) delete headers['transfer-encoding'];
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (e) => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Word 图片导出服务暂时不可用（' + (e.code || e.message) + '），请确认后端已启动');
  });
  req.pipe(proxyReq);
}

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
    const wmHealthPath = WM_BASE_PATH ? `${WM_BASE_PATH}/` : '/';
    const req2 = http.get({ host: '127.0.0.1', port: WM_PORT, path: wmHealthPath, timeout: 1500 }, (r) => {
      r.resume();
      json(res, 200, { ok: r.statusCode < 400 });
    });
    req2.on('error', () => json(res, 200, { ok: false }));
    req2.on('timeout', () => { req2.destroy(); json(res, 200, { ok: false }); });
    return;
  }

  if (pathname === '/api/docx-status' && req.method === 'GET') {
    const docxHealthPath = DOCX_BASE_PATH ? `${DOCX_BASE_PATH}/` : '/';
    const req3 = http.get({ host: '127.0.0.1', port: DOCX_PORT, path: docxHealthPath, timeout: 1500 }, (r) => {
      r.resume();
      json(res, 200, { ok: r.statusCode < 400 });
    });
    req3.on('error', () => json(res, 200, { ok: false }));
    req3.on('timeout', () => { req3.destroy(); json(res, 200, { ok: false }); });
    return;
  }

  // ---------- Auth ----------
  if (pathname === '/api/auth/register' && req.method === 'POST') return handleRegister(req, res);
  if (pathname === '/api/auth/login' && req.method === 'POST') return handleLogin(req, res);
  if (pathname === '/api/auth/login-code' && req.method === 'POST') return handleLoginCode(req, res);
  if (pathname === '/api/auth/send-code' && req.method === 'POST') return handleSendCode(req, res);
  if (pathname === '/api/auth/verify-code' && req.method === 'POST') return handleVerifyCode(req, res);
  if (pathname === '/api/auth/guest' && req.method === 'POST') return handleGuest(req, res);
  if (pathname === '/api/auth/logout' && req.method === 'POST') return handleLogout(req, res);
  if (pathname === '/api/auth/me' && req.method === 'GET') return handleMe(req, res);

  // 去水印：同源路径经 Node 转发到内部 Flask（外部只暴露 4173，5001 不对外）
  if (pathname === '/watermark-remover' || pathname.startsWith('/watermark-remover/')) {
    return proxyWatermark(req, res);
  }

  // Word 图片导出 / 批量水印：同源路径经 Node 转发到内部 Flask（外部只暴露 4173，5002 不对外）
  if (pathname === '/docx-watermark' || pathname.startsWith('/docx-watermark/')) {
    return proxyDocx(req, res);
  }

  if (pathname.startsWith('/api/')) return json(res, 404, { error: 'not found' });
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`\n  个人工具箱已启动 → http://localhost:${PORT}\n  数据库：${DB_PATH}\n`);
  startWatermark();
  startDocxWatermark();
});
