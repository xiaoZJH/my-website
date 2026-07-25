/* =========================================================
   app.js · SPA 路由 / 主题 / 抽屉 / 访问统计
   ========================================================= */
(function () {
  'use strict';

  const view = document.getElementById('view');
  // 去水印（Flask + OpenCV）sidecar 服务地址
  // 本地开发直接连 127.0.0.1:5001；生产环境通过 Nginx 反代到 /watermark-remover/
  const WM_URL = (window.__WM_URL__) || (/^(localhost|127\.0\.0\.1)$/i.test(location.hostname) ? 'http://127.0.0.1:5001/watermark-remover/' : '/watermark-remover/');
  const navLinks = Array.from(document.querySelectorAll('.nav__link'));
  const drawer = document.getElementById('drawer');
  const drawerBody = document.getElementById('drawerBody');
  const drawerTitle = document.getElementById('drawerTitle');
  const drawerIcon = document.getElementById('drawerIcon');
  const landing = document.getElementById('landing');
  const landingCanvas = document.getElementById('landingCanvas');
  let landingSeaStop = null;
  const enterBtn = document.getElementById('enterBtn');

  /* ---------- 个人信息（请改成你自己的） ---------- */
  const PROFILE = {
    name: '戴鑫杰',
    initials: '戴',
    avatar: '', // 头像图片 URL，留空则显示 initials
    role: '全栈开发者 · 界面设计师 · 开源爱好者',
    bio: '热爱用代码把想法变成现实，崇尚本地优先与隐私友好的设计。这里收集了我日常高频使用的小工具，以及一个随手记录想法的博客角落。',
    location: '中国',
    links: [
      { label: 'GitHub', url: 'https://github.com/yourname' },
      { label: 'Email', url: 'mailto:you@example.com' },
      { label: 'Twitter', url: 'https://twitter.com/yourname' },
    ],
    stats: [
      { num: '5+', label: '年经验' },
      { num: '30+', label: '个项目' },
      { num: '12', label: '个工具' },
    ],
    cards: [
      { title: '现在在做什么', text: '专注于前端工程化与本地优先工具，探索更优雅的人机交互。' },
      { title: '感兴趣的领域', text: 'Web 性能、可视化、隐私计算、设计系统，以及一切让创作更自由的技术。' },
      { title: '为什么做这个站', text: '想把常用工具放在自己掌控的地方，不依赖第三方，数据不出本机。' },
    ],
  };

  /* ---------- Landing / 登录入口 ---------- */
  function initLanding() {
    if (!landingCanvas || !landing) return;
    landingSeaStop = createOceanScene(landingCanvas, { theme: 'day', meteors: true, meteorColor: '150,230,255', maxPar: 12 });
    if (!enterBtn) return;
    const onEnter = () => {
      if (landing.classList.contains('is-leaving')) return;
      if (currentUser) enterSite(); else openOnboard();
    };
    enterBtn.addEventListener('click', onEnter);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !landing.classList.contains('is-leaving')) onEnter();
    });
  }

  function enterSite() {
    if (!landing || landing.classList.contains('is-leaving')) return;
    landing.classList.add('is-leaving');
    landing.setAttribute('aria-hidden', 'true');
    try { if (landingSeaStop && typeof landingSeaStop.stop === 'function') landingSeaStop.stop(); } catch (_) {}
    location.hash = '#/';
    route().then(trackVisit);
  }

  function showLanding() {
    if (!landing) return;
    landing.classList.remove('is-leaving');
    landing.setAttribute('aria-hidden', 'false');
    view.innerHTML = '';
    setActive('/');
    setAuthMode('login');
    if (landingCanvas) {
      try { if (landingSeaStop && typeof landingSeaStop.stop === 'function') landingSeaStop.stop(); } catch (_) {}
      landingSeaStop = createOceanScene(landingCanvas, { theme: 'day', meteors: true, meteorColor: '150,230,255', maxPar: 12 });
    }
  }

    /* ---------- 插画风格动态海洋（Landing / 主页共用） ---------- */
  const SEA = {
    // 蓝青白天海：清爽蓝青天空 + 通透青绿海面（去粉橙）
    day: {
      skyTop: '#bfe3f2',      // 顶部淡蓝青
      skyMid: '#9fd2ea',      // 中上部天蓝
      skyHorizon: '#d3eef2',  // 海平线极淡青白
      seaFar: '#6bb8d4',      // 远处海水（亮）
      seaMid: '#4aaec8',      // 中段海水
      seaNear: '#2a9db8',     // 近处海水（深一点但仍通透）
      seaDeep: '#1a7a94',     // 最深处
      foam: 'rgba(255,255,255,',
      glitter: 'rgba(255,255,255,',
      ripple: 'rgba(255,255,255,',
      haze: 'rgba(220,245,250,0.45)', // 海天交界清冷薄雾
      stars: false,
      island: 'rgba(70,100,110,0.28)',
    },
    // 夜晚版：更深沉的夜海，流星在此最显眼
    night: {
      skyTop: '#05080f',      // 近乎墨黑的夜空
      skyMid: '#0a1626',      // 深蓝夜幕
      skyHorizon: '#123048',  // 海平线处透出一点微光
      seaFar: '#1a4e6e',      // 远处海水（仍保留一点青）
      seaMid: '#103a54',
      seaNear: '#0c2e44',
      seaDeep: '#05161f',     // 近处深到几乎与夜空相连
      foam: 'rgba(200,240,255,',
      glitter: 'rgba(190,235,255,',
      ripple: 'rgba(180,230,255,',
      haze: 'rgba(140,200,255,0.16)',
      stars: true,
      island: 'rgba(12,26,38,0.6)',
    },
  };

  function createOceanScene(canvas, opts) {
    opts = opts || {};
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W = 0, H = 0, raf = null, t = 0;
    let theme = opts.theme || 'night';
    const meteorsOn = !!opts.meteors;
    const meteorColor = opts.meteorColor || '190,225,255'; // 流星/烟花主色（RGB）
    const meteorMax = opts.meteorMax || 5;   // 同屏最大流星数
    const meteorRate = opts.meteorRate || 0.010; // 每帧生成概率（越大越频繁）
    const meteorBoost = opts.meteorBoost || 1;   // 辉光/体积增强系数（越大越显眼）
    const MAXP = opts.maxPar || 14;
    const MARGIN = 32;
    let meteors = [], sparks = [], stars = [], ripples = [];
    let mouse = { x: -999, y: -999 };
    let spot = { x: -999, y: -999, tx: -999, ty: -999 };
    let par = { x: 0, y: 0, tx: 0, ty: 0 };
    let lastRipple = 0;
    const CLICK_R = 40;

    function pal() {
      // 修复：切换主题后 theme 变为 'dark'/'light'，需一并判断，否则主页夜海永不出现
      const night = theme === 'night' || theme === 'dark' || (theme === 'auto' && currentTheme === 'dark');
      return night ? SEA.night : SEA.day;
    }
    const horiz = () => H * 0.52; // 海平线稍高一点，天空占比更大

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = [];
      const n = Math.round(W / 14);
      for (let i = 0; i < n; i++) stars.push({ x: Math.random() * W, y: Math.random() * H * 0.48, r: Math.random() * 0.9 + 0.25, a: Math.random() * 0.45 + 0.15, tw: Math.random() * 6.28 });
      if (reduce) draw();
    }

    // 平滑随机：制造柔和不规则水面
    function vnoise(x, seed) {
      const xi = Math.floor(x), xf = x - xi;
      const h = (a) => { let n = (a * 374761393 + seed * 668265263) | 0; n = (n ^ (n >> 13)) * 1274126177; return ((n ^ (n >> 16)) >>> 0) / 4294967295; };
      const u = xf * xf * (3 - 2 * xf);
      return h(xi) + (h(xi + 1) - h(xi)) * u;
    }
    function fbm(x, seed) {
      let v = 0, a = 0.5, f = 1;
      for (let o = 0; o < 4; o++) { v += a * vnoise(x * f, seed + o * 97); f *= 2; a *= 0.5; }
      return v;
    }

    // 水面高度：远处浪小（高频低幅），近处浪大（低频高幅）
    function surf(x, baseY, t, seed, scale, amp) {
      let y = baseY;
      // 大涌浪（慢）
      y += Math.sin(x * 0.0028 * scale + t * 0.28 + seed) * amp;
      y += Math.sin(x * 0.0015 * scale - t * 0.17 + seed * 1.6) * amp * 1.3;
      // 中浪
      y += Math.sin(x * 0.0075 * scale + t * 0.55 + seed * 0.7) * (amp * 0.35);
      // 碎浪（噪声，让浪顶不整齐）
      y += (fbm(x * 0.012 * scale + t * 0.25, seed * 11) - 0.5) * (amp * 0.5);
      return y;
    }

    function drawSky(p) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, p.skyTop);
      g.addColorStop(0.38, p.skyMid);
      g.addColorStop(0.62, p.skyHorizon);
      g.addColorStop(1, p.seaFar);
      ctx.fillStyle = g;
      ctx.fillRect(-MARGIN, -MARGIN, W + MARGIN * 2, H + MARGIN * 2);
      // 海天交界处暖雾/薄雾
      const hy = horiz();
      const hg = ctx.createLinearGradient(0, hy - 80, 0, hy + 90);
      hg.addColorStop(0, 'rgba(0,0,0,0)');
      hg.addColorStop(0.45, p.haze);
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(-MARGIN, hy - 80, W + MARGIN * 2, 170);
    }

    function drawStars(p) {
      for (const s of stars) {
        ctx.globalAlpha = s.a * (0.55 + 0.45 * Math.sin(t * 1.1 + s.tw));
        ctx.fillStyle = '#cfe8ff';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // 远处淡淡岛屿轮廓（参考图左侧远山）
    function drawIsland(p) {
      const hy = horiz();
      ctx.fillStyle = p.island;
      ctx.beginPath();
      ctx.moveTo(W * 0.02, hy - 2);
      ctx.lineTo(W * 0.08, hy - 18);
      ctx.lineTo(W * 0.13, hy - 10);
      ctx.lineTo(W * 0.18, hy - 22);
      ctx.lineTo(W * 0.24, hy - 6);
      ctx.lineTo(W * 0.28, hy - 2);
      ctx.closePath();
      ctx.fill();
    }

    // 海面主体：从海平线向近处垂直渐变
    function drawSeaBody(p) {
      const hy = horiz();
      const g = ctx.createLinearGradient(0, hy, 0, H + MARGIN);
      g.addColorStop(0, p.seaFar);
      g.addColorStop(0.22, p.seaMid);
      g.addColorStop(0.55, p.seaNear);
      g.addColorStop(1, p.seaDeep);
      ctx.fillStyle = g;
      ctx.fillRect(-MARGIN, hy, W + MARGIN * 2, H + MARGIN - hy);
    }

    // 波浪层：远处小浪、近处大浪
    const LAYERS = [
      { off: -2,  scale: 1.6, amp: 3,  alpha: 0.35 }, // 最远，很小
      { off: 18,  scale: 1.3, amp: 6,  alpha: 0.28 },
      { off: 52,  scale: 1.0, amp: 11, alpha: 0.22 },
      { off: 110, scale: 0.8, amp: 18, alpha: 0.16 }, // 最近，大浪
      { off: 190, scale: 0.65, amp: 26, alpha: 0.12 }, // 最前，最大浪
    ];
    function drawSwells(p) {
      const hy = horiz();
      for (let li = 0; li < LAYERS.length; li++) {
        const L = LAYERS[li];
        const baseY = hy + L.off;
        ctx.beginPath();
        for (let x = -MARGIN; x <= W + MARGIN; x += 6) {
          const y = surf(x, baseY, t, L.scale * (li + 1), L.scale, L.amp);
          if (x === -MARGIN) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(255,255,255,' + L.alpha + ')';
        ctx.lineWidth = li < 2 ? 1.0 : 1.6;
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(255,255,255,0.35)';
        ctx.shadowBlur = li < 2 ? 4 : 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    // 阳光/月光反光带：参考图那条从海平线延伸下来的明亮光路
    function drawGlitter(p) {
      const hy = horiz();
      const depth = H - hy;
      const cx = W * 0.54; // 光源略偏右
      // 底层柔和光柱
      const bg = ctx.createLinearGradient(cx - W * 0.18, hy, cx + W * 0.18, hy);
      bg.addColorStop(0, 'rgba(255,255,255,0)');
      bg.addColorStop(0.5, p.stars ? 'rgba(210,245,255,0.08)' : 'rgba(255,255,255,0.12)');
      bg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(cx - W * 0.18, hy, W * 0.36, depth);

      // 闪烁波光
      for (let y = hy + 6; y <= H; y += 7) {
        const fy = (y - hy) / depth;
        const halfW = (W * 0.22) * (0.2 + fy * 1.1); // 近处宽、远处窄
        const cxr = cx + Math.sin(y * 0.015 + t * 0.4) * (12 + fy * 30); // 光路随波蜿蜒
        const baseA = 0.06 + (1 - fy) * 0.22;
        for (let x = cxr - halfW; x <= cxr + halfW; x += 7) {
          const dx = (x - cxr) / halfW;
          const fall = Math.exp(-dx * dx * 1.4);
          if (fall < 0.04) continue;
          const tw = Math.sin(x * 0.9 + y * 1.3 + t * 3.2 + Math.sin(x * 0.2 + t) * 2) * 0.5 + 0.5;
          const a = fall * tw * baseA;
          if (a < 0.015) continue;
          const sz = 1.2 + fy * 2.2;
          ctx.fillStyle = p.glitter + a.toFixed(3) + ')';
          ctx.beginPath();
          ctx.arc(x, y, sz, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 浪尖白沫：近处浪大处更多
    function drawFoam(p) {
      const hy = horiz();
      for (let li = 2; li < 5; li++) {
        const L = LAYERS[li];
        const baseY = hy + L.off;
        for (let x = -MARGIN; x <= W + MARGIN; x += 8) {
          const y = surf(x, baseY, t, L.scale * (li + 1), L.scale, L.amp);
          const yP = surf(x - 8, baseY, t, L.scale * (li + 1), L.scale, L.amp);
          const yN = surf(x + 8, baseY, t, L.scale * (li + 1), L.scale, L.amp);
          if (!(y <= yP && y <= yN)) continue; // 只画波峰
          const flick = Math.sin(x * 0.7 + t * 2.4 + li) * 0.5 + 0.5;
          if (flick < 0.5) continue;
          const a = (0.18 + (li - 2) * 0.07) * flick;
          ctx.strokeStyle = p.foam + a.toFixed(3) + ')';
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(x - 5, y - 1); ctx.lineTo(x + 6, y - 1); ctx.stroke();
        }
      }
    }

    function drawSpot(p) {
      if (spot.x < 0) return;
      const r = 170;
      const rg = ctx.createRadialGradient(spot.x, spot.y, 0, spot.x, spot.y, r);
      const core = p.stars ? '210,245,255' : '255,250,235';
      rg.addColorStop(0, 'rgba(' + core + ',0.16)');
      rg.addColorStop(0.6, 'rgba(' + core + ',0.05)');
      rg.addColorStop(1, 'rgba(' + core + ',0)');
      ctx.fillStyle = rg;
      ctx.fillRect(spot.x - r, spot.y - r, r * 2, r * 2);
    }

    function drawRipples(p) {
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        rp.r += rp.speed; rp.life -= 0.018;
        if (rp.life <= 0) { ripples.splice(i, 1); continue; }
        ctx.strokeStyle = p.ripple + (rp.life * 0.35).toFixed(3) + ')';
        ctx.lineWidth = Math.max(0.35, rp.life * 1.8);
        ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2); ctx.stroke();
      }
    }

    /* ---- 流星 + 小烟花（仅 Landing 启用） ---- */
    function spawnMeteor() {
      const angle = (Math.PI / 180) * (118 + Math.random() * 22);
      const v = 2.0 + Math.random() * 1.3;
      meteors.push({ x: Math.random() * W * 0.85, y: -40 - Math.random() * 80, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v + 1.1, len: 130 + Math.random() * 130, life: 1, seed: Math.random() * 10, color: meteorColor });
    }
    function burst(x, y, rgb) {
      const count = 28 + Math.floor(Math.random() * 16);
      for (let i = 0; i < count; i++) {
        const ang = (Math.PI * 2 * i) / count + Math.random() * 0.35;
        const sp = 1.1 + Math.random() * 3.4;
        sparks.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 1, decay: 0.011 + Math.random() * 0.013, size: 1.4 + Math.random() * 1.8, rgb });
      }
    }
    function updateMeteors() {
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i]; m.x += m.vx; m.y += m.vy; m.life -= 0.005;
        if (m.life <= 0 || m.y > H + 60 || m.x > W + 60) meteors.splice(i, 1);
      }
    }
    function drawMeteors() {
      const wMul = meteorBoost > 1 ? 1.3 : 1;
      const hMul = meteorBoost > 1 ? 1.2 : 1;
      for (const m of meteors) {
        const mag = Math.hypot(m.vx, m.vy) || 1;
        const tx = m.x - (m.vx / mag) * m.len, ty = m.y - (m.vy / mag) * m.len;
        const headA = Math.max(m.life, 0);
        const hot = Math.hypot(m.x - mouse.x, m.y - mouse.y) < CLICK_R;
        const col = m.color || meteorColor;
        const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
        g.addColorStop(0, 'rgba(255,255,255,' + headA.toFixed(2) + ')');
        g.addColorStop(0.35, 'rgba(' + col + ',' + (headA * 0.55).toFixed(2) + ')');
        g.addColorStop(1, 'rgba(' + col + ',0)');
        ctx.strokeStyle = g; ctx.lineWidth = (hot ? 3 : 2) * wMul; ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(' + col + ',0.95)'; ctx.shadowBlur = (hot ? 16 : 10) * meteorBoost;
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(tx, ty); ctx.stroke(); ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,' + (hot ? 1 : 0.95).toFixed(2) + ')';
        ctx.shadowColor = 'rgba(' + col + ',0.9)'; ctx.shadowBlur = 10 * meteorBoost;
        ctx.beginPath(); ctx.arc(m.x, m.y, (hot ? 4.6 : 3.2) * hMul, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
        if (hot) { ctx.strokeStyle = 'rgba(' + col + ',0.6)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(m.x, m.y, 12, 0, Math.PI * 2); ctx.stroke(); }
      }
    }
    function updateSparks() {
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]; s.x += s.vx; s.y += s.vy; s.vy += 0.018; s.vx *= 0.985; s.vy *= 0.985; s.life -= s.decay;
        if (s.life <= 0) sparks.splice(i, 1);
      }
    }
    function drawSparks() {
      for (const s of sparks) {
        ctx.globalAlpha = Math.max(s.life, 0); ctx.fillStyle = 'rgb(' + s.rgb + ')';
        ctx.shadowColor = 'rgb(' + s.rgb + ')'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.size * Math.max(s.life, 0), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }

    // 点击是否落在「背景」上（可触发烟花）；卡片/按钮/导航等交互元素不触发
    function isBackgroundTarget(node) {
      if (!node || node === document) return true;
      if (node.matches && node.matches('a,button,input,textarea,select,.card,.nav,.chip,.theme-toggle,.visitor-chip,.footer,.drawer')) return false;
      return isBackgroundTarget(node.parentElement);
    }

    function draw() {
      t += 0.016;
      par.x += (par.tx - par.x) * 0.06; par.y += (par.ty - par.y) * 0.06;
      spot.x += (spot.tx - spot.x) * 0.12; spot.y += (spot.ty - spot.y) * 0.12;
      const p = pal();
      ctx.save();
      ctx.translate(par.x, par.y);
      drawSky(p);
      if (p.stars) drawStars(p);
      drawIsland(p);
      drawSeaBody(p);
      drawSwells(p);
      drawGlitter(p);
      drawFoam(p);
      if (meteorsOn) {
        if (!reduce && Math.random() < meteorRate && meteors.length < meteorMax) spawnMeteor();
        updateMeteors(); drawMeteors(); updateSparks(); drawSparks();
      }
      drawSpot(p);
      drawRipples(p);
      ctx.restore();
      if (!reduce) raf = requestAnimationFrame(draw);
    }

    const onMove = (e) => {
      mouse.x = e.clientX; mouse.y = e.clientY;
      spot.tx = mouse.x; spot.ty = mouse.y;
      par.tx = (mouse.x - W / 2) / (W / 2) * MAXP;
      par.ty = (mouse.y - H / 2) / (H / 2) * MAXP;
      const now = performance.now();
      if (now - lastRipple > 95) { lastRipple = now; ripples.push({ x: mouse.x, y: mouse.y, r: 0, life: 0.7, speed: 1.6 }); if (ripples.length > 30) ripples.shift(); }
    };
    const onDown = (e) => {
      ripples.push({ x: e.clientX, y: e.clientY, r: 0, life: 1, speed: 2.6 });
      if (ripples.length > 30) ripples.shift();
      if (meteorsOn && isBackgroundTarget(e.target)) {
        let best = -1, bestD = CLICK_R;
        for (let i = meteors.length - 1; i >= 0; i--) { const m = meteors[i]; const d = Math.hypot(m.x - mouse.x, m.y - mouse.y); if (d < bestD) { bestD = d; best = i; } }
        if (best >= 0) { burst(meteors[best].x, meteors[best].y, meteors[best].color || meteorColor); meteors.splice(best, 1); }
      }
    };
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mousedown', onDown);
    resize();
    if (!reduce) raf = requestAnimationFrame(draw);
    return {
      stop() { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); window.removeEventListener('mousemove', onMove); window.removeEventListener('mousedown', onDown); },
      setTheme(name) { theme = name; },
    };
  }


  /* ---------- Theme ---------- */
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  let currentTheme = saved || (prefersDark ? 'dark' : 'light');
  let homeSeaCtl = null;
  const applyTheme = (t) => {
    currentTheme = t;
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.classList.toggle('dark', t === 'dark'); // 兼容 Flux 暗色
    localStorage.setItem('theme', t);
  };
  applyTheme(currentTheme);
  document.getElementById('themeToggle').addEventListener('click', (e) => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { applyTheme(next); if (homeSeaCtl) homeSeaCtl.setTheme(next); return; }
    if (homeSeaCtl) homeSeaCtl.setTheme(next); // 海洋在圆形扩散遮罩下同步切换，扩散结束即已是新主题
    themeWipe(e.clientX, e.clientY, next);
  });

  /* ---------- Helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // 统一风格工具卡片：浅/深色半透明背景 + 柔和边框 + 轻微阴影，hover 上浮
  function toolCard(t, i = 0) {
    return `<article class="card tool-card${t.soon ? ' is-soon' : ''}" data-tool="${t.id}" data-cat="${esc(t.category)}" tabindex="0" role="button" aria-label="${esc(t.title)}" style="--i:${i}">
      <div class="card__icon">${t.icon}</div>
      <h3 class="card__title">${esc(t.title)}</h3>
      <p class="card__desc">${esc(t.desc)}</p>
      <span class="card__arrow" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
    </article>`;
  }

  // 分类筛选胶囊
  function toolChips() {
    const cats = ['全部', ...Array.from(new Set(window.TOOLS.map((t) => t.category)))];
    return `<div class="chips">${cats
      .map((c, i) => `<button class="chip${i === 0 ? ' is-active' : ''}" data-filter="${esc(c)}">${esc(c)}</button>`)
      .join('')}</div>`;
  }

  function toolGridHtml(cat) {
    const list = !cat || cat === '全部' ? window.TOOLS : window.TOOLS.filter((t) => t.category === cat);
    return list.map((t, i) => toolCard(t, i)).join('');
  }

  function postCard(p, i = 0) {
    const tags = (p.tags || '').split(',').filter(Boolean).map((t) => `<span class="tag">${esc(t.trim())}</span>`).join('');
    const date = new Date(p.created_at).toLocaleDateString('zh-CN');
    return `<article class="card post-card" data-slug="${esc(p.slug)}" tabindex="0" role="button" style="--i:${i}">
      <div class="post-card__body">
        <div class="post-card__tags">${tags}</div>
        <h3 class="post-card__title">${esc(p.title)}</h3>
        <p class="post-card__excerpt">${esc(p.excerpt)}</p>
        <div class="post-card__meta"><span>${date}</span><span>${p.reading_min} 分钟阅读</span></div>
      </div>
    </article>`;
  }

  /* ---------- Views ---------- */
  function renderHome(stats, posts) {
    const bars = (stats.last7 || []).map((d) => {
      const h = Math.max(4, Math.round((d.count / (Math.max(1, ...stats.last7.map((x) => x.count)))) * 80));
      return `<div class="bar"><div class="bar__fill" data-h="${h}" style="height:4px"></div><div class="bar__label">${d.date}</div></div>`;
    }).join('');
    const recent = (posts || []).slice(0, 3);
    const avatarInner = PROFILE.avatar
      ? `<img class="profile-avatar__img" src="${esc(PROFILE.avatar)}" alt="${esc(PROFILE.name)}">`
      : `<span class="profile-avatar__initials">${esc(PROFILE.initials)}</span>`;
    const statsHtml = PROFILE.stats.map((s) => `<div class="profile-stat"><span class="profile-stat__num">${esc(s.num)}</span><span class="profile-stat__label">${esc(s.label)}</span></div>`).join('');
    const cardsHtml = PROFILE.cards.map((c, i) => `<article class="card profile-card" style="--i:${i}"><h3 class="profile-card__title">${esc(c.title)}</h3><p class="profile-card__text">${esc(c.text)}</p></article>`).join('');
    const statCard = `<article class="card profile-card profile-card--stats" style="--i:3">
      <h3 class="profile-card__title">站点统计</h3>
      <div class="profile-card__stats">
        <div class="profile-stat"><span class="profile-stat__num" id="s-total">0</span><span class="profile-stat__label">累计访问</span></div>
        <div class="profile-stat"><span class="profile-stat__num" id="s-today">0</span><span class="profile-stat__label">今日</span></div>
        <div class="profile-stat"><span class="profile-stat__num" id="s-unique">0</span><span class="profile-stat__label">独立访客</span></div>
        <div class="profile-stat"><span class="profile-stat__num" id="s-week">0</span><span class="profile-stat__label">近 7 天</span></div>
      </div>
      <div class="bars">${bars}</div>
    </article>`;

    view.innerHTML = `
      <section class="profile-hero stagger">
        <div class="profile-hero__visual" style="--i:0">
          <div class="profile-avatar">
            <div class="profile-avatar__inner">${avatarInner}</div>
            <div class="profile-avatar__ring" aria-hidden="true"></div>
            <div class="profile-avatar__glow" aria-hidden="true"></div>
          </div>
        </div>
        <div class="profile-hero__content" style="--i:1">
          <span class="hero__eyebrow">你好，我是</span>
          <h1 class="profile-hero__name">${esc(PROFILE.name)}</h1>
          <p class="profile-hero__role">${esc(PROFILE.role)}</p>
          <p class="profile-hero__bio">${esc(PROFILE.bio)}</p>
          <div class="profile-hero__actions">
            <a class="btn btn--primary" href="#/tools" data-link>浏览工具箱</a>
            <a class="btn btn--ghost" href="${esc((PROFILE.links && (PROFILE.links[1] || PROFILE.links[0])) ? (PROFILE.links[1] || PROFILE.links[0]).url : '#/')}">联系我</a>
          </div>
          <div class="profile-hero__stats">${statsHtml}</div>
        </div>
      </section>

      <section class="section">
        <div class="section__head"><div><h2 class="section__title">关于我</h2><div class="section__sub">一些简单介绍</div></div></div>
        <div class="grid grid--profile stagger">${cardsHtml}${statCard}</div>
      </section>

      <section class="section">
        <div class="section__head">
          <div><h2 class="section__title">工具箱</h2><div class="section__sub">点击任意卡片，立即开用</div></div>
          <a class="link-more" href="#/tools" data-link>查看全部 →</a>
        </div>
        ${toolChips()}
        <div class="grid grid--tools tool-grid stagger">${toolGridHtml('全部')}</div>
      </section>

      <section class="section">
        <div class="section__head">
          <div><h2 class="section__title">最新博客</h2><div class="section__sub">随手记录的想法与笔记</div></div>
          <a class="link-more" href="#/blog" data-link>全部文章 →</a>
        </div>
        <div class="grid grid--posts stagger">${recent.map((p, i) => postCard(p, i)).join('')}</div>
      </section>`;
    bindReveal();
    runHomeMotion(stats);
  }

  function renderTools() {
    view.innerHTML = `
      <section class="section" style="margin-top:var(--sp-7)">
        <div class="section__head"><div><h2 class="section__title">全部工具</h2><div class="section__sub">${window.TOOLS.length} 个工具 · 全部本地运行</div></div></div>
        ${toolChips()}
        <div class="grid grid--tools tool-grid stagger">${toolGridHtml('全部')}</div>
      </section>`;
    bindReveal();
  }

  async function renderBlog() {
    let posts = [];
    try { posts = (await fetch('/api/posts').then((r) => r.json())).posts || []; } catch (_) {}
    view.innerHTML = `
      <section class="section" style="margin-top:var(--sp-7)">
        <div class="section__head"><div><h2 class="section__title">博客</h2><div class="section__sub">${posts.length} 篇文章</div></div></div>
        <div class="grid grid--posts stagger">${posts.length ? posts.map((p, i) => postCard(p, i)).join('') : '<p style="color:var(--text-soft)">暂无文章。</p>'}</div>
      </section>`;
    bindReveal();
  }

  async function renderPost(slug) {
    let p = null;
    try { p = (await fetch('/api/posts/' + encodeURIComponent(slug)).then((r) => r.json())).post; } catch (_) {}
    if (!p) { view.innerHTML = '<p style="margin-top:48px;color:var(--text-soft)">文章不存在。</p>'; return; }
    const paras = p.body.split('\n\n').map((t) => `<p>${esc(t).replace(/\n/g, '<br>')}</p>`).join('');
    const tags = (p.tags || '').split(',').filter(Boolean).map((t) => `<span class="tag">${esc(t.trim())}</span>`).join('');
    const date = new Date(p.created_at).toLocaleDateString('zh-CN');
    view.innerHTML = `
      <article class="post-detail reveal" style="margin-top:var(--sp-7)">
        <a class="back-link" href="#/blog" data-link>← 返回博客</a>
        <div class="post-detail__cover" style="background:${esc(p.cover)}"></div>
        <div class="post-card__tags" style="margin-bottom:12px">${tags}</div>
        <h1>${esc(p.title)}</h1>
        <div class="post-detail__meta"><span>${date}</span><span>${p.reading_min} 分钟阅读</span></div>
        <div class="post-body">${paras}</div>
      </article>`;
    bindReveal();
  }

  function renderAbout() {
    view.innerHTML = `
      <section class="section reveal" style="margin-top:var(--sp-7);max-width:720px">
        <h2 class="section__title">关于这个站点</h2>
        <div class="post-body" style="margin-top:var(--sp-4)">
          <p>这是一个用极简技术栈搭建的个人空间：前端是无构建步骤的原生页面，后端仅依赖 Node 内置模块与单文件 SQLite 数据库。</p>
          <p>所有工具的计算都在你的浏览器本地完成，后端只记录匿名的"有人来过"。访问统计真实写入本地数据库，不依赖任何第三方统计服务，也不会追踪你的身份。</p>
          <p>如果你有想加入的工具，或者对这个站点的设计有想法，欢迎通过博客留言告诉我。</p>
        </div>
      </section>`;
    bindReveal();
  }

  /* ---------- 去水印全屏工具（iframe 嵌入 Flask sidecar） ---------- */
  async function renderWatermark() {
    view.innerHTML = `
      <section class="section tool-fullpage">
        <div class="section__head">
          <div><h2 class="section__title">图片 / 视频去水印</h2><div class="section__sub">涂抹水印区域，一键无痕修复 · 本地运行</div></div>
          <a class="link-more" href="#/tools" data-link>返回工具箱 →</a>
        </div>
        <div id="wm-box" class="wm-box">
          <div class="wm-loading"><span class="spinner-sm"></span> 正在连接去水印服务…</div>
        </div>
      </section>`;
    bindReveal();
    const box = document.getElementById('wm-box');
    // 服务可能尚在启动（OpenCV 导入较慢），最多重试 4 次、间隔 ~700ms
    let ok = false;
    for (let i = 0; i < 4 && !ok; i++) {
      try {
        const r = await fetch('/api/wm-status');
        const j = await r.json();
        ok = !!j.ok;
      } catch (_) { ok = false; }
      if (!ok && i < 3) await new Promise((res) => setTimeout(res, 700));
    }
    if (ok) {
      box.innerHTML = `<iframe class="wm-iframe" src="${esc(WM_URL)}" title="去水印工具" loading="lazy" allow="clipboard-read; clipboard-write"></iframe>`;
    } else {
      box.innerHTML = `
        <div class="wm-error">
          <h3>去水印服务未启动</h3>
          <p>该工具依赖本地的 Python + OpenCV 服务（sidecar），当前未运行。请在本机执行以下命令安装依赖并启动：</p>
          <pre class="wm-cmd">cd tools\\watermark-remover
C:\\path\\to\\python -m venv .venv
.venv\\Scripts\\pip install -r requirements.txt
.venv\\Scripts\\python app.py</pre>
          <p class="help">依赖就绪后，重启 Node 服务（<code>node --experimental-sqlite server/server.js</code>）即会自动拉起本工具。视频去水印还需系统安装 ffmpeg。</p>
        </div>`;
    }
  }

  /* ---------- Auth（登录 / 注册 Modal） ---------- */
  const authModal = document.getElementById('authModal');
  const authArea = document.getElementById('authArea');
  const authForm = document.getElementById('authForm');
  const authError = document.getElementById('authError');
  const authHint = document.getElementById('authHint');
  const authSubmit = document.getElementById('authSubmit');
  let authMode = 'login'; // login | login-code | register
  let currentUser = null;

  /* ---------- Onboarding（进入网站） ---------- */
  const onboardModal = document.getElementById('onboardModal');
  const onboardForm = document.getElementById('onboardForm');
  const onboardName = document.getElementById('onboardName');
  const onboardError = document.getElementById('onboardError');
  const onboardSubmit = document.getElementById('onboardSubmit');
  const onboardAvatars = document.getElementById('onboardAvatars');
  const onboardAvatarUpload = document.getElementById('onboardAvatarUpload');
  const onboardAvatarPreview = document.getElementById('onboardAvatarPreview');
  let onboardAvatar = '0';
  let onboardCustomDataUrl = '';

  /* ---------- 角色眼睛跟随鼠标 + 随机眨眼 ---------- */
  (function initObEyes() {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stage = document.querySelector('.onboard-modal__stage');
    if (!stage) return;

    function movePupil(eye, mx, my) {
      const pupil = eye.querySelector('.ob-pupil');
      if (!pupil) return;
      const rect = eye.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = mx - cx;
      const dy = my - cy;
      const angle = Math.atan2(dy, dx);
      const maxR = Math.max(2, (eye.offsetWidth - pupil.offsetWidth) / 2 - 1);
      const r = Math.min(Math.hypot(dx, dy) / 18, 1) * maxR;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      pupil.style.transform = `translate(calc(-50% + ${x.toFixed(2)}px), calc(-50% + ${y.toFixed(2)}px))`;
    }

    function updateEyes(mx, my) {
      document.querySelectorAll('.ob-eye').forEach(eye => movePupil(eye, mx, my));
    }

    stage.addEventListener('mousemove', (e) => updateEyes(e.clientX, e.clientY));
    document.addEventListener('mousemove', (e) => {
      if (onboardModal && onboardModal.classList.contains('is-open')) updateEyes(e.clientX, e.clientY);
    });

    if (reduce) return;

    // 随机眨眼：每次挑 1~2 只眼睛
    function blink() {
      const eyes = Array.from(document.querySelectorAll('.ob-eye'));
      if (!eyes.length) return;
      const count = 1 + Math.floor(Math.random() * 2);
      eyes.sort(() => Math.random() - 0.5).slice(0, count).forEach(eye => {
        eye.classList.add('is-blinking');
        setTimeout(() => eye.classList.remove('is-blinking'), 200);
      });
      setTimeout(blink, 1200 + Math.random() * 2500);
    }
    setTimeout(blink, 900);
  })();

  function openOnboard() {
    if (!onboardModal) return;
    onboardModal.classList.add('is-open');
    onboardModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (onboardName) setTimeout(() => onboardName.focus(), 80);
  }
  function closeOnboard() {
    if (!onboardModal || !onboardModal.classList.contains('is-open')) return;
    onboardModal.classList.remove('is-open');
    onboardModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    try { onboardForm?.reset(); } catch (_) {}
    if (onboardError) onboardError.hidden = true;
    onboardName && (onboardName.value = '');
    onboardAvatar = '0';
    onboardCustomDataUrl = '';
    onboardAvatarUpload && (onboardAvatarUpload.value = '');
    if (onboardAvatarPreview) { onboardAvatarPreview.src = ''; onboardAvatarPreview.hidden = true; }
    if (onboardAvatars) {
      onboardAvatars.querySelectorAll('.onboard-avatar').forEach((el) => {
        el.classList.toggle('is-active', el.dataset.avatar === '0');
        el.setAttribute('aria-checked', el.dataset.avatar === '0' ? 'true' : 'false');
      });
      const upload = onboardAvatars.querySelector('.onboard-avatar--upload');
      if (upload) upload.classList.remove('has-preview');
    }
    updateOnboardSubmit();
  }
  function showOnboardError(msg) {
    if (onboardError) { onboardError.textContent = msg; onboardError.hidden = false; }
    const card = document.querySelector('.onboard-card');
    if (card) card.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 320, easing: 'ease-in-out' });
  }
  function updateOnboardSubmit() {
    if (!onboardSubmit) return;
    const name = (onboardName?.value || '').trim();
    const valid = name.length >= 2;
    onboardSubmit.disabled = !valid;
  }

  function aesc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const AUTH_FIELDS = {
    'login': ['identifier', 'password'],
    'login-code': ['phone', 'code'],
    'register': ['username', 'email', 'phone', 'code', 'password'],
  };

  function setAuthMode(mode) {
    if (!authForm) return;
    authMode = mode;
    document.querySelectorAll('.auth-card__tab').forEach((t) => {
      const isActive = t.dataset.authTab === (mode === 'login-code' ? 'login' : mode);
      t.classList.toggle('is-active', isActive);
      t.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    authForm.querySelectorAll('.auth-card__field').forEach((f) => { f.hidden = !AUTH_FIELDS[mode].includes(f.dataset.field); });
    const title = document.getElementById('authTitle');
    if (title) {
      if (mode === 'login') { title.textContent = '欢迎回来'; }
      else if (mode === 'login-code') { title.textContent = '验证码登录'; }
      else { title.textContent = '创建账户'; }
    }
    const sub = document.querySelector('.auth-card__subtitle');
    if (sub) {
      if (mode === 'login') sub.textContent = 'Welcome back';
      else if (mode === 'login-code') sub.textContent = 'Login with SMS';
      else sub.textContent = 'Create your account';
    }
    if (authSubmit) authSubmit.textContent = mode === 'register' ? '注 册' : (mode === 'login-code' ? '验证码登录' : '登 录');
    if (authHint) authHint.textContent = mode === 'login-code' ? '输入手机号与收到的验证码即可登录' : (mode === 'register' ? '手机号可留空；填写后点"获取验证码"可绑定并验证手机号' : '');
    authError.hidden = true;
  }

  function openAuth(mode) {
    setAuthMode(mode || 'login');
    if (!authModal) return;
    authModal.classList.add('is-open', 'is-green');
    authModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    startLampCycle();
    const first = authForm?.querySelector('.auth-card__field:not([hidden]) input');
    if (first) setTimeout(() => first.focus(), 80);
  }
  function closeAuth() {
    if (!authModal || !authModal.classList.contains('is-open')) return;
    authModal.classList.remove('is-open');
    authModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    stopLampCycle();
    try { authForm?.reset(); } catch (_) {}
    authError.hidden = true;
  }

  const LAMP_COLORS = ['is-green', 'is-orange', 'is-red', 'is-cyan'];
  let lampCycleTimer = null;
  function startLampCycle() {
    stopLampCycle();
    if (!authModal) return;
    LAMP_COLORS.forEach((c) => authModal.classList.remove(c));
    authModal.classList.add('is-green');
    let i = 0;
    lampCycleTimer = setInterval(() => {
      if (!authModal) return;
      authModal.classList.remove(LAMP_COLORS[i]);
      i = (i + 1) % LAMP_COLORS.length;
      authModal.classList.add(LAMP_COLORS[i]);
    }, 5200);
  }
  function stopLampCycle() {
    if (lampCycleTimer) { clearInterval(lampCycleTimer); lampCycleTimer = null; }
  }

  function showAuthError(msg) {
    authError.textContent = msg;
    authError.hidden = false;
    const card = document.querySelector('.auth-card');
    if (card && !card.classList.contains('is-success')) {
      card.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 320, easing: 'ease-in-out' });
    }
    const lamp = document.getElementById('authLamp');
    if (lamp) { lamp.classList.add('is-sad'); setTimeout(() => lamp.classList.remove('is-sad'), 1200); }
  }

  function renderAuthArea() {
    const landingAuth = document.getElementById('landingAuth');
    if (landingAuth) {
      if (currentUser) {
        const name = aesc(currentUser.display_name || currentUser.username);
        landingAuth.innerHTML =
          '<span class="landing__user">' + name + '</span>' +
          '<button class="landing__top-btn" id="landingLogout" type="button">Log off</button>' +
          '<button class="landing__top-btn is-ghost" id="landingSignin" type="button" hidden>Sign in</button>';
      } else {
        landingAuth.innerHTML =
          '<button class="landing__top-btn" id="landingSignin" type="button">Sign in</button>' +
          '<button class="landing__top-btn is-ghost" id="landingLogout" type="button" disabled>Log off</button>';
      }
    }
    if (!authArea) return;
    if (currentUser) {
      const initial = aesc((currentUser.display_name || currentUser.username || 'U').slice(0, 1).toUpperCase());
      const name = aesc(currentUser.display_name || currentUser.username);
      authArea.innerHTML =
        '<div class="user-chip" id="userChip">' +
          '<span class="user-chip__avatar">' + initial + '</span>' +
          '<span class="user-chip__name">' + name + '</span>' +
          '<button class="user-chip__logout" id="authLogout" type="button" title="退出登录">退出</button>' +
        '</div>';
    } else {
      authArea.innerHTML = '<button class="auth-btn" id="authLoginBtn" type="button">登录</button>';
    }
  }

  async function refreshAuth() {
    try {
      const r = await fetch('/api/auth/me');
      const j = await r.json();
      currentUser = j.user || null;
    } catch (_) { currentUser = null; }
    renderAuthArea();
  }

  async function api(path, body) {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    let j = {};
    try { j = await r.json(); } catch (_) {}
    return { ok: r.ok, status: r.status, data: j };
  }

  authForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.hidden = true;
    const fd = new FormData(authForm);
    const v = (n) => (fd.get(n) || '').toString().trim();
    let res;
    if (authMode === 'login') {
      res = await api('/api/auth/login', { identifier: v('identifier'), password: v('password') });
    } else if (authMode === 'login-code') {
      res = await api('/api/auth/login-code', { phone: v('phone'), code: v('code') });
    } else {
      res = await api('/api/auth/register', { username: v('username'), email: v('email'), phone: v('phone'), code: v('code'), password: v('password') });
    }
    if (res.ok && res.data.user) {
      currentUser = res.data.user;
      renderAuthArea();
      const card = document.querySelector('.auth-card');
      if (card) {
        card.classList.add('is-success');
        await new Promise((resolve) => setTimeout(resolve, 500));
        card.classList.remove('is-success');
      }
      closeAuth();
      enterSite();
    } else {
      showAuthError((res.data && res.data.error) || '操作失败，请重试');
    }
  });

  const authSendBtn = document.querySelector('[data-auth-send]');
  if (authSendBtn) authSendBtn.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const phone = (new FormData(authForm).get('phone') || '').toString().trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) { showAuthError('请先填写正确的 11 位手机号'); return; }
    const purpose = authMode === 'login-code' ? 'login' : 'register';
    btn.disabled = true;
    const res = await api('/api/auth/send-code', { phone, purpose });
    btn.disabled = false;
    if (res.ok) {
      const dev = res.data.devCode ? ('（开发态验证码：' + res.data.devCode + '）') : '';
      authHint.textContent = '验证码已发送，请查收' + dev;
      authError.hidden = true;
    } else {
      showAuthError((res.data && res.data.error) || '发送失败');
    }
  });

  /* Onboarding 表单与头像交互 */
  if (onboardName) onboardName.addEventListener('input', updateOnboardSubmit);
  if (onboardAvatarUpload) onboardAvatarUpload.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showOnboardError('图片请小于 2MB'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      onboardCustomDataUrl = reader.result;
      onboardAvatar = 'custom';
      if (onboardAvatarPreview) { onboardAvatarPreview.src = onboardCustomDataUrl; onboardAvatarPreview.hidden = false; }
      if (onboardAvatars) {
        onboardAvatars.querySelectorAll('.onboard-avatar').forEach((el) => {
          if (el.classList.contains('onboard-avatar--upload')) {
            el.classList.add('is-active', 'has-preview');
            el.setAttribute('aria-checked', 'true');
          } else {
            el.classList.remove('is-active');
            el.setAttribute('aria-checked', 'false');
          }
        });
      }
    };
    reader.readAsDataURL(file);
  });
  if (onboardForm) onboardForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (onboardError) onboardError.hidden = true;
    const name = (onboardName?.value || '').trim();
    if (name.length < 2) { showOnboardError('昵称至少 2 个字符'); return; }
    if (onboardSubmit) { onboardSubmit.disabled = true; onboardSubmit.innerHTML = '<span class="spinner-sm"></span> 同步中…'; }
    const avatar = onboardAvatar === 'custom' && onboardCustomDataUrl ? onboardCustomDataUrl : onboardAvatar;
    const res = await api('/api/auth/guest', { display_name: name, avatar });
    if (onboardSubmit) onboardSubmit.innerHTML = '<span>同步身份并登录</span><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
    if (res.ok && res.data.user) {
      currentUser = res.data.user;
      renderAuthArea();
      const card = document.querySelector('.onboard-card');
      if (card) {
        card.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }], { duration: 350, easing: 'ease-in-out' });
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      closeOnboard();
      enterSite();
    } else {
      if (onboardSubmit) onboardSubmit.disabled = false;
      showOnboardError((res.data && res.data.error) || '同步失败，请重试');
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('#authLoginBtn') || e.target.closest('#landingSignin')) { openAuth('login'); return; }
    const avatarBtn = e.target.closest('[data-avatar]');
    if (avatarBtn && onboardAvatars) {
      onboardAvatar = avatarBtn.dataset.avatar;
      onboardCustomDataUrl = '';
      if (onboardAvatarUpload) onboardAvatarUpload.value = '';
      if (onboardAvatarPreview) { onboardAvatarPreview.src = ''; onboardAvatarPreview.hidden = true; }
      onboardAvatars.querySelectorAll('.onboard-avatar').forEach((el) => {
        const isUpload = el.classList.contains('onboard-avatar--upload');
        const active = el === avatarBtn;
        el.classList.toggle('is-active', active);
        el.setAttribute('aria-checked', active ? 'true' : 'false');
        if (isUpload && !active) el.classList.remove('has-preview');
      });
      return;
    }
    const obClose = e.target.closest('[data-onboard-close]');
    if (obClose) { closeOnboard(); return; }
    if (e.target.closest('#lampPull')) {
      if (!authModal) return;
      const cur = LAMP_COLORS.find((c) => authModal.classList.contains(c)) || LAMP_COLORS[0];
      const next = LAMP_COLORS[(LAMP_COLORS.indexOf(cur) + 1) % LAMP_COLORS.length];
      authModal.classList.remove(cur); authModal.classList.add(next);
      const lamp = document.getElementById('authLamp');
      if (lamp) { lamp.classList.add('is-pulled'); setTimeout(() => lamp.classList.remove('is-pulled'), 350); }
      stopLampCycle(); startLampCycle();
      return;
    }
    if (e.target.closest('#authLogout') || e.target.closest('#landingLogout')) {
      if (!currentUser) { showAuthError('当前未登录'); return; }
      api('/api/auth/logout').then(() => {
        currentUser = null;
        renderAuthArea();
        history.replaceState(null, '', location.pathname + location.search);
        showLanding();
      });
      return;
    }
    const tab = e.target.closest('[data-auth-tab]');
    if (tab) { setAuthMode(tab.dataset.authTab); return; }
    const modeLink = e.target.closest('[data-auth-mode]');
    if (modeLink) {
      if (modeLink.dataset.authMode === 'forgot') {
        authHint.textContent = '请联系管理员重置密码';
        return;
      }
      setAuthMode(modeLink.dataset.authMode);
      return;
    }
    const close = e.target.closest('[data-auth-close]');
    if (close) { closeAuth(); return; }
  });

  /* ---------- Router ---------- */
  async function route() {
    closeDrawer();
    const hash = location.hash.replace(/^#/, '') || '/';
    const parts = hash.split('/').filter(Boolean);
    setActive(hash);
    if (parts[0] === 'tools' && parts[1] === 'watermark') return renderWatermark();
    if (parts[0] === 'tools') return renderTools();
    if (parts[0] === 'blog' && parts[1]) return renderPost(parts[1]);
    if (parts[0] === 'blog') return renderBlog();
    if (parts[0] === 'about') return renderAbout();
    // home
    let stats = { total: '—', today: 0, unique: 0, last7: [] };
    let posts = [];
    try { stats = await fetch('/api/stats').then((r) => r.json()); } catch (_) {}
    try { posts = (await fetch('/api/posts').then((r) => r.json())).posts || []; } catch (_) {}
    return renderHome(stats, posts);
  }

  function setActive(hash) {
    navLinks.forEach((a) => {
      const h = a.getAttribute('href').replace(/^#/, '') || '/';
      const target = hash === '/' ? '/' : hash.split('/')[1];
      const match = h === '/' ? target === '/' : target === h.replace(/^\//, '');
      a.classList.toggle('is-active', match);
    });
  }

  /* ---------- Drawer ---------- */
  let activeCleanup = null;
  function openTool(id) {
    const t = window.TOOLS.find((x) => x.id === id);
    if (!t) return;
    drawerTitle.textContent = t.title;
    drawerIcon.innerHTML = t.icon;
    drawerBody.innerHTML = t.render();
    if (t.mount) t.mount(drawerBody);
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    if (!drawer.classList.contains('is-open')) return;
    if (activeCleanup) { try { activeCleanup(); } catch (_) {} activeCleanup = null; }
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // 复制按钮（事件委托）
  document.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) {
      const sel = copyBtn.getAttribute('data-copy');
      const node = document.querySelector(sel);
      if (node && node.textContent) {
        navigator.clipboard?.writeText(node.textContent).then(() => {
          const old = copyBtn.textContent; copyBtn.textContent = '已复制';
          setTimeout(() => (copyBtn.textContent = old), 1200);
        }).catch(() => {});
      }
      return;
    }
    const chip = e.target.closest('[data-filter]');
    if (chip) {
      const filter = chip.getAttribute('data-filter');
      document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-active', c === chip));
      const grid = document.querySelector('.tool-grid');
      if (grid) { grid.innerHTML = toolGridHtml(filter); bindReveal(); }
      return;
    }
    const close = e.target.closest('[data-close]');
    if (close) { closeDrawer(); return; }
    const card = e.target.closest('[data-tool]');
    if (card) {
      const id = card.getAttribute('data-tool');
      const t = window.TOOLS.find((x) => x.id === id);
      if (t && t.fullPage) { location.hash = '#/tools/' + id; return; }
      openTool(id); return;
    }
    const post = e.target.closest('[data-slug]');
    if (post) { location.hash = '#/blog/' + post.getAttribute('data-slug'); return; }
    const link = e.target.closest('[data-link]');
    if (link) { /* 交由浏览器处理 hash 跳转 */ }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeDrawer(); closeAuth(); } });

  /* ---------- Reveal ---------- */
  function bindReveal() {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.08 });
    document.querySelectorAll('.reveal:not(.in)').forEach((el) => io.observe(el));
    // 入场动画结束后释放 transform，避免覆盖磁吸等内联 transform
    document.querySelectorAll('.stagger > *').forEach((el) => {
      el.addEventListener('animationend', () => { el.style.animation = 'none'; }, { once: true });
    });
    bindCardFx();
  }

  /* ---------- 动效：主题圆形扩散 / 数字滚动 / 卡片微交互 ---------- */
  function themeWipe(x, y, next) {
    const overlay = document.createElement('div');
    overlay.className = 'theme-wipe';
    overlay.dataset.theme = next;
    overlay.style.background = 'var(--bg)';
    overlay.style.backgroundImage = 'var(--bg-grad)';
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 24;
    const anim = overlay.animate(
      [{ clipPath: 'circle(0px at ' + x + 'px ' + y + 'px)' }, { clipPath: 'circle(' + end + 'px at ' + x + 'px ' + y + 'px)' }],
      { duration: 620, easing: 'cubic-bezier(0.16,1,0.3,1)', fill: 'forwards' }
    );
    document.body.appendChild(overlay);
    anim.onfinish = () => { applyTheme(next); overlay.remove(); };
  }

  function countUp(el, target, animate) {
    if (!el) return;
    target = Number(target) || 0;
    if (!animate) { el.textContent = target; return; }
    const dur = 900; const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased);
      if (p < 1) requestAnimationFrame(step); else el.textContent = target;
    };
    requestAnimationFrame(step);
  }

  function runHomeMotion(stats) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    countUp(document.getElementById('s-total'), stats.total, !reduce);
    countUp(document.getElementById('s-today'), stats.today, !reduce);
    countUp(document.getElementById('s-unique'), stats.unique, !reduce);
    countUp(document.getElementById('s-week'), (stats.last7 || []).reduce((a, b) => a + b.count, 0), !reduce);
    if (reduce) return;
    requestAnimationFrame(() => {
      document.querySelectorAll('.bar__fill').forEach((b) => { b.style.height = (b.getAttribute('data-h') || 4) + 'px'; });
    });
  }

  function bindCardFx() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const magnetic = window.matchMedia('(hover: hover)').matches;
    document.querySelectorAll('.card').forEach((card) => {
      if (card.dataset.fx) return; card.dataset.fx = '1';
      if (!magnetic) return;
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
        card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
        const dx = (e.clientX - (r.left + r.width / 2)) / r.width * 8;
        const dy = (e.clientY - (r.top + r.height / 2)) / r.height * 8;
        card.style.transform = 'translate(' + dx.toFixed(2) + 'px, ' + (dy - 6).toFixed(2) + 'px)';
      });
      card.addEventListener('mouseleave', () => { card.style.transform = ''; });
    });
  }

  /* ---------- Visitor tracking ---------- */
  function trackVisit() {
    try {
      fetch('/api/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: location.hash || '/' }) }).catch(() => {});
    } catch (_) {}
    fetch('/api/stats').then((r) => r.json()).then((s) => {
      const c = document.getElementById('visitorCount');
      if (c) c.textContent = s.total;
    }).catch(() => {});
  }

  /* ---------- Init ---------- */
  // 启动主页动态海洋壁纸背景（全局固定；主题跟随切换，鼠标可互动：涟漪/光斑/视差）
  const homeSeaCanvas = document.getElementById('homeSea');
  // 主页动态海洋壁纸：跟随主题切换（修复后暗色真正生效），并加入更显眼的流星
  try {
    if (homeSeaCanvas) homeSeaCtl = createOceanScene(homeSeaCanvas, { theme: 'auto', meteors: true, meteorColor: '150,230,255', meteorMax: 7, meteorRate: 0.020, meteorBoost: 1.45, maxPar: 14 });
  } catch (e) {
    console.error('Home sea init failed:', e);
  }

  // 全局错误兜底：若渲染过程中抛出异常，至少在页面上显示出来，而不是一面空白
  window.addEventListener('error', (e) => {
    console.error('Global error:', e.error || e.message);
    if (view && !view.innerHTML.trim()) {
      view.innerHTML = '<section class="section" style="margin-top:var(--sp-7)"><h2 class="section__title">页面加载出错</h2><p class="post-body" style="margin-top:var(--sp-4);color:var(--text-soft)">' + esc(String(e.error && e.error.message || e.message)) + '</p></section>';
    }
  });

  document.getElementById('footerYear').textContent = new Date().getFullYear();
  window.addEventListener('hashchange', route);

  // 启动时拉取登录态，渲染导航区的登录按钮 / 已登录用户
  async function boot() {
    await refreshAuth();
    if (currentUser) {
      // 已登录：直接进入主站
      if (landing) { landing.classList.add('is-leaving'); landing.setAttribute('aria-hidden', 'true'); }
      await route();
      trackVisit();
    } else {
      // 未登录：强制显示登录 gate，忽略任何 hash
      if (location.hash) { history.replaceState(null, '', location.pathname + location.search); }
      initLanding();
    }
  }

  boot();

  setInterval(() => { if ((location.hash.replace(/^#/, '') || '/') === '/') trackVisit(); }, 60000);
})();
