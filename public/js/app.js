/* =========================================================
   app.js · SPA 路由 / 主题 / 抽屉 / 访问统计
   ========================================================= */
(function () {
  'use strict';

  const view = document.getElementById('view');
  // 功能开关：服务器可设 ENABLE_MATTING=false 关闭「离境」抠图
  const ENABLE_MATTING = typeof window.__ENABLE_MATTING__ === 'boolean' ? window.__ENABLE_MATTING__ : true;
  // 去水印（Flask + OpenCV）sidecar 服务地址
  // 统一同源：/watermark-remover/ 由 Node 主服务反向代理到内部 Flask，外部只暴露 4173
  const WM_URL = (window.__WM_URL__) || '/watermark-remover/';
  const DOCX_URL = (window.__DOCX_URL__) || '/docx-watermark/';
  const navLinks = Array.from(document.querySelectorAll('.nav__link'));
  const drawer = document.getElementById('drawer');
  const drawerBody = document.getElementById('drawerBody');
  const drawerTitle = document.getElementById('drawerTitle');
  const drawerIcon = document.getElementById('drawerIcon');
  const landing = document.getElementById('landing');
  const landingCanvas = document.getElementById('landingCanvas');
  let landingSeaStop = null;
  const enterBtn = document.getElementById('enterBtn');

  /* ---------- 个人信息 ---------- */
  const PROFILE = {
    name: 'Mr.zhong',
    initials: 'M',
    avatar: '/images/avatar-main.jpg',
    role: '全栈开发者 · 界面设计师 · 开源爱好者',
    bio: '热爱用代码把想法变成现实，崇尚本地优先与隐私友好的设计。这里收集了我日常高频使用的小工具，以及一个随手记录想法的博客角落。',
    quote: '把每一次到达，都变成值得停留的瞬间。',
    location: '中国',
    status: '开放合作中',
    links: [
      { label: 'GitHub', url: 'https://github.com/xiaoZJH' },
      { label: 'Email', url: 'mailto:hello@mrzhong.dev' },
      { label: 'Twitter', url: 'https://twitter.com/mrzhong_dev' },
    ],
    stats: [
      { num: '2+', label: '年经验' },
      { num: '∞', label: '个项目' },
      { num: '1', label: '个工具' },
    ],
    cards: [
      { title: '现在在做什么', text: '专注于前端工程化与本地优先工具，探索更优雅的人机交互。' },
      { title: '感兴趣的领域', text: 'Web 性能、可视化、隐私计算、设计系统，以及一切让创作更自由的技术。' },
      { title: '为什么做这个站', text: '想把常用工具放在自己掌控的地方，不依赖第三方，数据不出本机。' },
    ],
  };

  /* ---------- Landing / 登录入口 ---------- */
  function initLanding() {
    if (!landing) return;
    if (landing.dataset.inited === '1') return; // 仅初始化一次，避免重复绑定事件/动画
    landing.dataset.inited = '1';
    if (landingCanvas) {
      landingSeaStop = createOceanScene(landingCanvas, { theme: 'day', meteors: true, meteorColor: '150,230,255', maxPar: 12 });
    }
    if (!enterBtn) return;
    const onEnter = () => {
      if (landing.classList.contains('is-leaving')) return;
      if (currentUser) enterSite(); else openOnboard();
    };
    enterBtn.addEventListener('click', onEnter);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !landing.classList.contains('is-leaving')) onEnter();
    });

    // 极光欢迎页交互：鼠标光晕 + 极光视差 + 标题 3D 倾斜 + CTA 文案切换 + 主题切换
    const wlBg = document.getElementById('wlBg');
    const wlGlow = document.getElementById('wlGlow');
    const wlHero3d = document.getElementById('wlHero3d');
    const wlCtaText = document.getElementById('wlCtaText');
    const wlYear = document.getElementById('wlYear');
    if (wlYear) wlYear.textContent = new Date().getFullYear();

    if (wlCtaText) {
      const enterCta = () => { wlCtaText.textContent = '进入美好时刻'; };
      const leaveCta = () => { wlCtaText.textContent = '进入网站'; };
      enterBtn.addEventListener('mouseenter', enterCta);
      enterBtn.addEventListener('focus', enterCta);
      enterBtn.addEventListener('mouseleave', leaveCta);
      enterBtn.addEventListener('blur', leaveCta);
    }

    const wlThemeToggle = document.getElementById('landingThemeToggle');
    if (wlThemeToggle) {
      wlThemeToggle.addEventListener('click', (e) => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        applyTheme(next);
      });
    }

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let tx = 0, ty = 0, cx = 0, cy = 0, gx = 50, gy = 40;
    function onMove(e) {
      const p = e.touches ? e.touches[0] : e;
      const x = p.clientX, y = p.clientY;
      gx = (x / window.innerWidth) * 100;
      gy = (y / window.innerHeight) * 100;
      tx = (0.5 - x / window.innerWidth) * 36;
      ty = (0.5 - y / window.innerHeight) * 36;
      if (wlHero3d) {
        const ry = (x / window.innerWidth - 0.5) * 10;
        const rx = (0.5 - y / window.innerHeight) * 7;
        wlHero3d.style.transform = `rotateY(${ry}deg) rotateX(${rx}deg)`;
      }
    }
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });

    if (reduce || !wlBg) return;
    function loop() {
      cx += (tx - cx) * 0.05; cy += (ty - cy) * 0.05;
      if (wlBg) wlBg.style.transform = `translate(${cx}px,${cy}px)`;
      if (wlGlow) { wlGlow.style.setProperty('--mx', gx + '%'); wlGlow.style.setProperty('--my', gy + '%'); }
      requestAnimationFrame(loop);
    }
    loop();
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
    initLanding(); // 确保落地页交互（进入按钮、主题切换等）已绑定，修复「已登录进入后退出，落地页按钮点击无反应」
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
    // 暖奶油「白天海」：蜜桃天空 + 温润奶油海面
    day: {
      skyTop: '#fcefdf',      // 顶部淡奶油
      skyMid: '#f8e2cb',      // 中上部蜜桃
      skyHorizon: '#fdf5ea',  // 海平线极淡乳白
      seaFar: '#f3ddbf',      // 远处奶油海水（亮）
      seaMid: '#eccaa2',      // 中段暖沙
      seaNear: '#e0b88a',     // 近处蜜糖
      seaDeep: '#d2a374',     // 最深处焦糖
      foam: 'rgba(255,252,244,',
      glitter: 'rgba(255,248,235,',
      ripple: 'rgba(255,250,240,',
      haze: 'rgba(247,224,196,0.5)', // 海天交界暖雾
      stars: false,
      island: 'rgba(190,158,120,0.30)',
    },
    // 暖夜「摩卡海」：深沉暖棕夜空 + 暖金微光，流星在此最显眼
    night: {
      skyTop: '#140f0a',      // 暖近黑
      skyMid: '#1f1610',      // 深摩卡
      skyHorizon: '#36271c',  // 海平线透出暖光
      seaFar: '#3a2a1e',      // 远处暖棕海水
      seaMid: '#2c2017',
      seaNear: '#211810',
      seaDeep: '#160f09',     // 近处深到几乎与夜空相连
      foam: 'rgba(247,224,196,',
      glitter: 'rgba(240,210,178,',
      ripple: 'rgba(235,205,170,',
      haze: 'rgba(150,110,70,0.18)',
      stars: true,
      island: 'rgba(20,14,10,0.6)',
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
        ctx.fillStyle = '#fbedd6';
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
      bg.addColorStop(0.5, p.stars ? 'rgba(242,214,182,0.08)' : 'rgba(255,246,228,0.16)');
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

  /* ---------- Catalog helpers ---------- */
  function posterCard(item, i = 0) {
    const cover = item.cover || 'linear-gradient(135deg, var(--accent), var(--accent-2))';
    const isClickable = item.link && item.link !== '#';
    const hrefAttr = isClickable ? ` data-href="${esc(item.link)}" data-internal="${item.internal ? '1' : ''}"` : '';
    return `<article class="card zh-poster-card"${hrefAttr} tabindex="0" role="${isClickable ? 'link' : 'article'}" aria-label="${esc(item.title)}" style="--i:${i}">
      <div class="zh-poster-card__cover" style="background: ${cover}">
        <div class="zh-poster-card__icon">${item.icon}</div>
        ${item.tag ? `<span class="zh-poster-card__tag">${esc(item.tag)}</span>` : ''}
      </div>
      <div class="zh-poster-card__body">
        <h3 class="zh-poster-card__title">${esc(item.title)}</h3>
        <p class="zh-poster-card__desc">${esc(item.desc)}</p>
      </div>
    </article>`;
  }

  // 首页 Bento 玻璃卡片（vibe coding）
  function bentoCard(item, cls, i = 0) {
    const isClickable = item.link && item.link !== '#';
    const hrefAttr = isClickable ? ` data-href="${esc(item.link)}" data-internal="${item.internal ? '1' : ''}"` : '';
    const glow = item.glow || 'var(--accent)';
    const go = isClickable ? `<span class="zh-bento__go">进入 <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>` : '';
    return `<article class="card zh-bento__card ${cls}"${hrefAttr} tabindex="0" role="${isClickable ? 'link' : 'article'}" aria-label="${esc(item.title)}" style="--i:${i}">
      <span class="zh-bento__glow" style="background:${glow}" aria-hidden="true"></span>
      <div class="zh-bento__icon">${item.icon}</div>
      <span class="zh-bento__tag">${esc(item.tag)}</span>
      <h3 class="zh-bento__title">${esc(item.title)}</h3>
      <p class="zh-bento__desc">${esc(item.desc)}</p>
      ${go}
    </article>`;
  }

  function renderCatalogContent(cat, opts = {}) {
    const avatarInner = PROFILE.avatar
      ? `<img class="zh-avatar__img" src="${esc(PROFILE.avatar)}" alt="${esc(PROFILE.name)}">`
      : `<span class="zh-avatar__initials">${esc(PROFILE.initials)}</span>`;
    const contactUrl = esc((PROFILE.links && (PROFILE.links[1] || PROFILE.links[0])) ? (PROFILE.links[1] || PROFILE.links[0]).url : '#/');

    const CATS = {
      home: {
        title: '推荐',
        sub: '精选内容与个人简介',
        hero: true,
        items: [
          { tag: 'PLANET', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle><path d="M2 12h6m8 0h6M12 2v6m0 8v6"></path></svg>', title: '星球', desc: '近距离观察地球与月球，拖动旋转、滚轮缩放，在浏览器里做一次小小的星际旅行。', link: '/world.html', cover: 'linear-gradient(135deg,#0ea5e9,#1e3a8a)' },
          { tag: 'UI DESIGN', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>', title: '界面设计', desc: '相信好的交互应该自然到被忽略，专注于清晰、优雅、可访问的界面。', link: '/ui-design.html?v=2', cover: 'linear-gradient(135deg,#f59e0b,#ef4444)' },
          { tag: 'LOCAL-FIRST', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>', title: '本地优先', desc: '常用工具和数据放在自己掌控的地方，不依赖第三方，数据不出本机。', link: '#/tools', cover: 'linear-gradient(135deg,#10b981,#059669)', internal: true },
          { tag: 'OPEN COLLAB', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>', title: '开放合作', desc: '目前开放合作中，欢迎聊聊有趣的项目、技术方案或产品设计。', link: contactUrl, cover: 'linear-gradient(135deg,#8b5cf6,#6366f1)' },
        ],
      },
      media: {
        title: '媒体工具',
        sub: `${window.TOOLS.length} 个工具 · 全部本地运行`,
        items: window.TOOLS.map((t, i) => ({
          tag: t.category,
          icon: t.icon,
          title: t.title,
          desc: t.desc,
          link: t.fullPage ? '#/tools/' + t.id : '#open-tool:' + t.id,
          cover: t.cover || 'linear-gradient(135deg, var(--accent), var(--accent-2))',
          internal: true,
          toolId: t.id,
          fullPage: t.fullPage,
        })),
      },
      planet: {
        title: '三维星球',
        sub: '可交互的 3D 星球展示',
        items: [
          { tag: 'EARTH', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M2 12h20"></path><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>', title: '地球', desc: '高清地球纹理 + 云层 + 城市夜灯，支持旋转与缩放。', link: '/sphere.html?v=7', cover: 'linear-gradient(135deg,#3b82f6,#0ea5e9)' },
          { tag: 'MOON', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>', title: '月球', desc: '2K 月球表面贴图，沉浸式观察。', link: '/moon.html', cover: 'linear-gradient(135deg,#94a3b8,#475569)' },
          { tag: 'SPHERE', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle><path d="M2 12h6m8 0h6M12 2v6m0 8v6"></path></svg>', title: '能力星球', desc: '48 个能力图标构成的交互式 3D 球面，可拖拽旋转。', link: '/work-icon-sphere.html', cover: 'linear-gradient(135deg,#ec4899,#8b5cf6)' },
        ],
      },
      ui: {
        title: '界面设计',
        sub: '作品集与交互展示',
        items: [
          { tag: 'PORTFOLIO', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>', title: '界面设计作品集', desc: '界面设计展示页，包含设计原则、组件与作品入口。', link: '/ui-design.html?v=2', cover: 'linear-gradient(135deg,#f59e0b,#ef4444)' },
          { tag: 'SPHERE', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle><path d="M2 12h6m8 0h6M12 2v6m0 8v6"></path></svg>', title: '能力星球', desc: '将能力图标以 3D 球面形式呈现，可交互探索。', link: '/work-icon-sphere.html', cover: 'linear-gradient(135deg,#ec4899,#8b5cf6)' },
        ],
      },
      about: {
        title: '关于我',
        sub: '个人简介与联系方式',
        hero: true,
        items: [
          { tag: 'BIO', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>', title: '个人简介', desc: PROFILE.bio, link: contactUrl, cover: 'linear-gradient(135deg,#10b981,#059669)' },
          { tag: 'ROLE', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>', title: '角色', desc: PROFILE.role, link: null, cover: 'linear-gradient(135deg,#f59e0b,#ef4444)' },
          { tag: 'QUOTE', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3"></path></svg>', title: '一句话', desc: PROFILE.quote, link: null, cover: 'linear-gradient(135deg,#8b5cf6,#6366f1)' },
        ],
      },
    };

    const data = CATS[cat] || CATS.home;
    const rolePills = (PROFILE.role.split('·').map((r) => r.trim()).filter(Boolean).map((r, i) => `<li style="--i:${i}">${esc(r)}</li>`)).join('');
    const statsHtml = PROFILE.stats.map((s, i) => `<div class="zh-stat" style="--i:${i}"><span class="zh-stat__num">${esc(s.num)}</span><span class="zh-stat__label">${esc(s.label)}</span></div>`).join('');

    const heroHtml = '';

    const gridHtml = data.items.map((item, i) => {
      if (item.toolId) {
        return `<article class="card tool-card${item.fullPage ? '' : ' is-soon'}" data-tool="${esc(item.toolId)}" tabindex="0" role="button" aria-label="${esc(item.title)}" style="--i:${i}">
          <div class="card__icon">${item.icon}</div>
          <h3 class="card__title">${esc(item.title)}</h3>
          <p class="card__desc">${esc(item.desc)}</p>
          <span class="card__arrow" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
        </article>`;
      }
      return posterCard(item, i);
    }).join('');

    return `
      ${heroHtml}
      <section class="zh-catalog__section" aria-labelledby="cat-title-${cat}">
        <div class="zh-catalog__header">
          <h2 id="cat-title-${cat}" class="zh-catalog__title">${esc(data.title)}</h2>
          <span class="zh-catalog__sub">${esc(data.sub)}</span>
        </div>
        <div class="zh-catalog__grid stagger">${gridHtml}</div>
      </section>`;
  }

  function bindCatalogTabs(container) {
    if (!container) return;
    container.addEventListener('click', (e) => {
      const item = e.target.closest('.zh-tab');
      if (!item || item.classList.contains('is-active')) return;
      e.preventDefault();
      const cat = item.getAttribute('data-cat');
      const main = document.getElementById('zhBrowseMain');
      if (!main) return;
      container.querySelectorAll('.zh-tab').forEach((el) => {
        const active = el === item;
        el.classList.toggle('is-active', active);
        el.setAttribute('aria-selected', String(active));
      });
      main.innerHTML = renderCatalogContent(cat);
      bindReveal();
      bindMatrixCards();
      if (main.scrollTo) main.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ---------- 3D Lanyard 工牌（iframe 挂载到首页右上角） ---------- */
  const lanyardIframeHtml = `
    <div class="zh-lanyard-dock" aria-label="3D 工牌">
      <iframe src="/lanyard/dist/index.html?v=8" loading="eager" title="3D 工牌" frameborder="0" allowtransparency="true"></iframe>
    </div>`;

  /* ---------- Views ---------- */
  function renderHome(stats, posts) {
    const avatarInner = PROFILE.avatar
      ? `<img class="zh-avatar__img" src="${esc(PROFILE.avatar)}" alt="${esc(PROFILE.name)}">`
      : `<span class="zh-avatar__initials">${esc(PROFILE.initials)}</span>`;
    const contactUrl = esc((PROFILE.links && (PROFILE.links[1] || PROFILE.links[0])) ? (PROFILE.links[1] || PROFILE.links[0]).url : '#/');

    const heroHtml = `
      <section class="zh-hero stagger" aria-label="个人简介">
        <span class="zh-hero__pill"><span class="zh-hero__pill-dot" aria-hidden="true"></span> 在线 · 欢迎来到我的小世界</span>
        <h1 class="zh-hero__title">你好，我是 <span class="grad">${esc(PROFILE.name)}</span></h1>
        <p class="zh-hero__lead">${esc(PROFILE.bio)}</p>
        <div class="zh-hero__avatar">${avatarInner}</div>
        <div class="zh-hero__actions">
          <a class="zh-btn zh-btn--primary zh-magnetic" href="#/tools" data-link>浏览工具箱</a>
          <a class="zh-btn zh-btn--ghost zh-magnetic" href="${contactUrl}">联系我</a>
        </div>
      </section>`;

    const icoGlobe = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle><path d="M2 12h6m8 0h6M12 2v6m0 8v6"></path></svg>';
    const icoUI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>';
    const icoSphere = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"></path></svg>';
    const icoMedia = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="3"></rect><circle cx="9" cy="9" r="2.4"></circle><path d="M21 15l-5-5L5 21"></path></svg>';
    const icoAbout = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';
    const icoLocal = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>';

    const bento = [
      { tag: 'PLANET', icon: icoGlobe, title: '星球', desc: '在浏览器里近距离观察地球与月球——拖拽旋转、滚轮缩放，来一场小小的星际旅行。', link: '/world.html', glow: 'radial-gradient(circle, #38bdf8, transparent 70%)', cls: 'zh-bento__card--xl' },
      { tag: 'UI DESIGN', icon: icoUI, title: '界面设计', desc: '相信好的交互应该自然到被忽略。专注清晰、优雅、可访问的界面。', link: '/ui-design.html', glow: 'radial-gradient(circle, #fb923c, transparent 70%)', cls: 'zh-bento__card--wide' },
      { tag: 'SPHERE', icon: icoSphere, title: '能力星球', desc: '48 个能力图标组成的交互球体，可拖拽探索我的技能地图。', link: '/work-icon-sphere.html', glow: 'radial-gradient(circle, #f472b6, transparent 70%)', cls: 'zh-bento__card--s' },
      { tag: 'MEDIA', icon: icoMedia, title: '媒体工具', desc: '去水印、离境、Word 图片导出，全部本地运行。', link: '#/tools', internal: true, glow: 'radial-gradient(circle, #34d399, transparent 70%)', cls: 'zh-bento__card--s' },
      { tag: 'ABOUT', icon: icoAbout, title: '关于我', desc: '全栈开发者 / 界面设计师，正在开放有趣的合作。', link: contactUrl, glow: 'radial-gradient(circle, #fbbf24, transparent 70%)', cls: 'zh-bento__card--wide' },
      { tag: 'LOCAL-FIRST', icon: icoLocal, title: '本地优先', desc: '常用工具与数据都握在自己手里，不出本机。', link: '#/tools', internal: true, glow: 'radial-gradient(circle, #a78bfa, transparent 70%)', cls: 'zh-bento__card--wide' },
    ];
    const bentoHtml = bento.map((b, i) => bentoCard(b, b.cls, i)).join('');

    view.innerHTML = `
      ${heroHtml}
      ${lanyardIframeHtml}
      <section class="zh-bento stagger" aria-label="精选内容">${bentoHtml}</section>`;
    bindReveal();
    bindMatrixCards();
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
          <div><h2 class="section__title">净影</h2><div class="section__sub">图片 / 视频去水印 · 涂抹无痕修复 · 本地运行</div></div>
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
      box.innerHTML = `<iframe class="wm-iframe" src="${esc(WM_URL)}?cb=${Date.now()}" title="去水印工具" loading="lazy" allow="clipboard-read; clipboard-write"></iframe>`;
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

  /* ---------- Word 图片导出 / 批量水印 全屏工具（iframe 嵌入 Flask sidecar） ---------- */
  async function renderDocxWatermark() {
    view.innerHTML = `
      <section class="section tool-fullpage">
        <div class="section__head">
          <div><h2 class="section__title">Word 图片导出 · 批量水印</h2><div class="section__sub">抽取 Word 内嵌图片，批量加自定义水印 · 本地运行</div></div>
          <a class="link-more" href="#/tools" data-link>返回工具箱 →</a>
        </div>
        <div id="docx-box" class="wm-box">
          <div class="wm-loading"><span class="spinner-sm"></span> 正在连接服务…</div>
        </div>
      </section>`;
    bindReveal();
    const box = document.getElementById('docx-box');
    // 服务可能尚在启动，最多重试 4 次、间隔 ~700ms
    let ok = false;
    for (let i = 0; i < 4 && !ok; i++) {
      try {
        const r = await fetch('/api/docx-status');
        const j = await r.json();
        ok = !!j.ok;
      } catch (_) { ok = false; }
      if (!ok && i < 3) await new Promise((res) => setTimeout(res, 700));
    }
    if (ok) {
      box.innerHTML = `<iframe class="wm-iframe" src="${esc(DOCX_URL)}?cb=${Date.now()}" title="Word 图片导出" loading="lazy" allow="clipboard-read; clipboard-write"></iframe>`;
    } else {
      box.innerHTML = `
        <div class="wm-error">
          <h3>Word 图片导出服务未启动</h3>
          <p>该工具依赖本地的 Python + Flask 服务（sidecar），当前未运行。请在本机执行以下命令安装依赖并启动：</p>
          <pre class="wm-cmd">cd tools\\docx-watermark
C:\\path\\to\\python -m venv .venv
.venv\\Scripts\\pip install -r requirements.txt
.venv\\Scripts\\python app.py</pre>
          <p class="help">依赖就绪后，重启 Node 服务（<code>node --experimental-sqlite server/server.js</code>）即会自动拉起本工具。也可直接复用去水印工具的 venv（已含 Flask）。</p>
        </div>`;
    }
  }

  /* ---------- AI 智能抠图（本地 Flask sidecar，支持框选 + 实时预览） ---------- */
  async function renderRemoveBg() {
    // 先查询后端哪些模型已在本地缓存，未就绪的模型禁用，避免触发 GitHub 下载超时
    let modelStatus = {};
    let samAvailable = false;
    try {
      const r = await fetch('/watermark-remover/api/remove-bg-models');
      const j = await r.json();
      if (j.ok) { modelStatus = j.models || {}; samAvailable = !!j.sam_available; }
    } catch (_) {
      // 如果查询失败，仍允许渲染，后端会做二次校验
    }

    const models = [
      { value: 'bria-rmbg', label: 'RMBG-1.4 · 高精度（推荐）' },
      { value: 'u2net', label: 'u2net · 备用' },
    ];
    const firstReady = models.find((m) => modelStatus[m.value]?.ready)?.value || 'u2netp';
    const anyReady = models.some((m) => modelStatus[m.value]?.ready);
    const modelOptions = models.map((m) => {
      const ready = !!modelStatus[m.value]?.ready;
      const selected = m.value === firstReady ? ' selected' : '';
      const disabled = ready ? '' : ' disabled';
      const suffix = ready ? '' : ' · 模型未下载';
      return `<option value="${esc(m.value)}"${selected}${disabled}>${esc(m.label)}${suffix}</option>`;
    }).join('');
    const noModelBanner = anyReady ? '' : '<div class="rb-banner rb-banner--warning">当前没有可用的抠图模型。请先在服务器/本机下载模型，或联系管理员。</div>';
    view.innerHTML = `
      <section class="section tool-fullpage">
        <div class="section__head">
          <div class="rb-brandhead">
            <span class="rb-eyebrow">AI Background Removal</span>
            <h2 class="section__title rb-title">离境</h2>
            <div class="section__sub rb-sub">让主体优雅离场 · 框选或智能点选，一键导出透明 PNG，全程本地运行</div>
          </div>
          <a class="link-more" href="#/tools" data-link>返回工具箱 →</a>
        </div>
        <div class="rb-card reveal">
          ${noModelBanner}
          <!-- 上传区 -->
          <div class="rb-upload" id="rbUpload">
            <input type="file" id="rbFile" accept="image/png,image/jpeg,image/webp,image/bmp" hidden>
            <div class="rb-drop" id="rbDrop" tabindex="0" role="button" aria-label="上传图片">
              <span class="rb-drop__halo"></span>
              <span class="rb-drop__icon">
                <svg viewBox="0 0 24 24" width="50" height="50" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </span>
              <p class="rb-drop__title">拖拽图片到此处，或点击上传</p>
              <span class="rb-drop__hint">支持 JPG / PNG / WebP / BMP · 建议小于 10MB · 图片全程本地处理，不会上传</span>
            </div>
          </div>
          <!-- 编辑器 -->
          <div class="rb-editor" id="rbEditor" hidden>
              <div class="rb-toolbar">
                <div class="rb-tool-modes">
                  <span class="rb-mode-label">选区工具</span>
                  <div class="rb-seg">
                    <button class="btn btn--toggle is-active" id="rbModeCrop" type="button">框选</button>
                    <button class="btn btn--toggle" id="rbModeClick" type="button"${samAvailable ? '' : ' disabled'}>智能点选${samAvailable ? '' : ' · 未启用'}</button>
                  </div>
                  <select id="rbSamMode" class="rb-select" title="智能点选输出模式" hidden>
                    <option value="alpha">掩码直接抠图</option>
                    <option value="fuse">融合 u2net 优化</option>
                  </select>
                  <button class="btn btn--ghost" id="rbUndo" type="button" disabled>撤销</button>
                  <button class="btn btn--ghost" id="rbClearPts" type="button" disabled>清空</button>
                </div>
                <div class="rb-tool-aside">
                  <div class="rb-model">
                  <label for="rbModel">AI 模型</label>
                  <select id="rbModel" class="rb-select">${modelOptions}</select>
                </div>
                <div class="rb-tool-actions">
                  <button class="btn btn--primary" id="rbProcess" type="button">开始抠图</button>
                  <button class="btn btn--secondary" id="rbDownload" type="button" disabled>下载 PNG</button>
                  <button class="btn btn--ghost" id="rbReset" type="button">重新上传</button>
                </div>
                </div>
              </div>
            <div class="rb-workspace">
              <div class="rb-panel rb-panel--source">
                <div class="rb-panel__head">
                  <span class="rb-panel__title">原图</span>
                  <button class="rb-mini" id="rbClearCrop" type="button" disabled>清除选区</button>
                </div>
                <div class="rb-canvas-wrap" id="rbCanvasWrap">
                  <canvas id="rbCanvas" class="rb-canvas"></canvas>
                </div>
                <p class="rb-hint" id="rbHint">在图片上拖拽框选要保留的区域（如小猫）。不选则抠全图；双击选区可清除。框选后点「开始抠图」。</p>
              </div>
              <div class="rb-panel rb-panel--result">
                <div class="rb-panel__head">
                  <span class="rb-panel__title">预览</span>
                  <span class="rb-panel__tag">透明 PNG</span>
                </div>
                <div class="rb-preview-wrap" id="rbPreviewWrap">
                  <div class="rb-result" id="rbResult">
                    <img id="rbAfter" alt="抠图结果" draggable="false">
                    <div class="rb-empty" id="rbEmpty">尚未抠图</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="rb-status" id="rbStatus"></div>
        </div>
      </section>`;
    bindReveal();

    const upload = document.getElementById('rbUpload');
    const fileInput = document.getElementById('rbFile');
    const drop = document.getElementById('rbDrop');
    const editor = document.getElementById('rbEditor');
    const modelSel = document.getElementById('rbModel');
    const processBtn = document.getElementById('rbProcess');
    const downloadBtn = document.getElementById('rbDownload');
    const resetBtn = document.getElementById('rbReset');
    const clearCropBtn = document.getElementById('rbClearCrop');
    const canvas = document.getElementById('rbCanvas');
    const canvasWrap = document.getElementById('rbCanvasWrap');
    const ctx = canvas.getContext('2d');
    const afterImg = document.getElementById('rbAfter');
    const emptyTip = document.getElementById('rbEmpty');
    const status = document.getElementById('rbStatus');
    const modeCropBtn = document.getElementById('rbModeCrop');
    const modeClickBtn = document.getElementById('rbModeClick');
    const samModeSel = document.getElementById('rbSamMode');
    const undoBtn = document.getElementById('rbUndo');
    const clearPtsBtn = document.getElementById('rbClearPts');
    const hint = document.getElementById('rbHint');

    // 智能点选工具（MobileSAM/TinySAM 点击分割），与框选模式共用同一画布
    const { SmartClickTool, CoordinateTransformer } = window.SmartClick;
    const transformer = new CoordinateTransformer();
    const smartTool = new SmartClickTool({
      canvas, ctx,
      getSource: () => sourceImage,
      transformer,
      endpoint: '/watermark-remover/api/sam-segment',
      removeBgEndpoint: '/watermark-remover/api/remove-bg',
      removeBgModel: () => modelSel.value,
      getImageBase64: () => new Promise((res, rej) => {
        if (!currentFile) return rej(new Error('无源文件'));
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(currentFile);
      }),
      getUploadFile: () => currentFile,
      onPreview: (pngUrl) => {
        console.log('[app.onPreview] url len=%d prefix=%s', pngUrl?.length, pngUrl?.slice(0, 60));
        if (!pngUrl || typeof pngUrl !== 'string' || !pngUrl.startsWith('data:image/png;base64,')) {
          console.error('[app.onPreview] invalid pngUrl', pngUrl);
          setError('预览数据异常，请打开浏览器控制台查看详情');
          return;
        }
        afterImg.onload = () => {
          downloadBtn.disabled = false;
          emptyTip.style.display = 'none';
          setStatus('抠图完成 ✔ 可下载透明 PNG，或继续修正。', 'info');
        };
        afterImg.onerror = (e) => {
          console.error('[app.onPreview] image load error', e, 'src len=', afterImg.src?.length);
          setError('结果图片加载失败，请重试');
        };
        afterImg.src = pngUrl;
        currentResult = pngUrl;
      },
      onStatus: setStatus,
      onSelectionChange: (has) => {
        undoBtn.disabled = !has;
        clearPtsBtn.disabled = !has;
        if (has && samModeSel.value === 'alpha') {
          smartTool.applyAsAlpha().catch((e) => {
            console.error('[app.onSelectionChange] applyAsAlpha error', e);
            setError('生成预览失败：' + (e?.message || e));
          });
        } else if (!has) {
          afterImg.src = '';
          emptyTip.style.display = '';
          downloadBtn.disabled = true;
          currentResult = null;
        }
      },
    });

    let currentResult = null;
    let currentFileName = 'remove-bg.png';
    let currentFile = null;          // 上传的源文件（点击或拖拽都存到这里，避免拖拽时 fileInput.files 为空导致拿不到文件）
    let sourceImage = null;          // 原图 HTMLImageElement
    let crop = null;                 // 选区 {x,y,w,h} 相对原图 0-1；null=全图
    let stage = { scale: 1, ox: 0, oy: 0, dw: 0, dh: 0 }; // canvas 上的绘制区域（CSS px）
    let drag = null;                 // 拖拽状态
    const HANDLE = 9;                // 手柄半径（CSS px）
    const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

    function setStatus(html, type = 'info') {
      status.className = 'rb-status rb-status--' + type;
      status.innerHTML = html;
      status.hidden = !html;
    }

    function setLoading(msg) {
      setStatus('<span class="spinner-sm"></span> ' + esc(msg), 'info');
      processBtn.disabled = true;
    }

    function setError(msg) {
      setStatus('⚠ ' + esc(msg), 'error');
      processBtn.disabled = false;
    }

    function reset() {
      currentResult = null;
      currentFileName = 'remove-bg.png';
      crop = null;
      sourceImage = null;
      fileInput.value = '';
      afterImg.src = '';
      downloadBtn.disabled = true;
      clearCropBtn.disabled = true;
      upload.hidden = false;
      editor.hidden = true;
      status.hidden = true;
    }

    /* ---------- 画布绘制与选区交互 ---------- */
    function fitCanvas() {
      if (!sourceImage) return;
      const maxW = canvasWrap.clientWidth || 600;
      const maxH = Math.min(window.innerHeight * 0.62, 620);
      const iw = sourceImage.naturalWidth, ih = sourceImage.naturalHeight;
      const dpr = window.devicePixelRatio || 1;
      const mode = smartTool.getMode();
      if (mode === 'click') {
        // 点选模式：画布填满容器，图片按视图居中，支持缩放/平移
        transformer.setImageSize(iw, ih);
        transformer.fit(maxW, maxH);
        canvas.style.width = maxW + 'px';
        canvas.style.height = maxH + 'px';
        canvas.width = Math.round(maxW * dpr);
        canvas.height = Math.round(maxH * dpr);
      } else {
        // 框选模式：画布=适配后的图片尺寸（保持原逻辑）
        const scale = Math.min(maxW / iw, maxH / ih, 1);
        const dw = Math.round(iw * scale), dh = Math.round(ih * scale);
        canvas.style.width = dw + 'px';
        canvas.style.height = dh + 'px';
        canvas.width = Math.round(dw * dpr);
        canvas.height = Math.round(dh * dpr);
        stage = { scale, ox: 0, oy: 0, dw, dh };
        // 仅用于 SAM 坐标换算（点选模式才用到）
        transformer.setImageSize(iw, ih);
        transformer.fit(maxW, maxH);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redrawActive();
    }

    // 两种模式共用入口：点选模式交给 SmartClickTool 渲染，框选模式走原 draw()
    function redrawActive() {
      if (smartTool.getMode() === 'click') smartTool.redraw();
      else draw();
    }

    function draw() {
      if (!sourceImage) return;
      const { dw, dh } = stage;
      ctx.clearRect(0, 0, dw, dh);
      ctx.drawImage(sourceImage, 0, 0, dw, dh);
      if (!crop) return;
      // 选区外半透明遮罩（四个矩形拼出区域外）
      ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
      const rx = crop.x * dw, ry = crop.y * dh, rw = crop.w * dw, rh = crop.h * dh;
      ctx.fillRect(0, 0, dw, ry);                      // 上
      ctx.fillRect(0, ry + rh, dw, dh - (ry + rh));    // 下
      ctx.fillRect(0, ry, rx, rh);                     // 左
      ctx.fillRect(rx + rw, ry, dw - (rx + rw), rh);   // 右
      // 选区边框
      ctx.strokeStyle = '#2dd4bf';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);
      // 手柄
      const centers = handleCenters();
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#2dd4bf';
      ctx.lineWidth = 2;
      for (const c in centers) {
        ctx.beginPath();
        ctx.rect(centers[c].x - HANDLE / 2, centers[c].y - HANDLE / 2, HANDLE, HANDLE);
        ctx.fill();
        ctx.stroke();
      }
    }

    function handleCenters() {
      const { dw, dh } = stage;
      const rx = crop.x * dw, ry = crop.y * dh, rw = crop.w * dw, rh = crop.h * dh;
      return {
        nw: { x: rx, y: ry }, n: { x: rx + rw / 2, y: ry }, ne: { x: rx + rw, y: ry },
        e: { x: rx + rw, y: ry + rh / 2 }, se: { x: rx + rw, y: ry + rh }, s: { x: rx + rw / 2, y: ry + rh },
        sw: { x: rx, y: ry + rh }, w: { x: rx, y: ry + rh / 2 },
      };
    }

    function eventToRel(e) {
      const rect = canvas.getBoundingClientRect();
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      return { x: cx / rect.width, y: cy / rect.height };
    }

    function hitHandle(rel) {
      if (!crop) return null;
      const centers = handleCenters();
      for (const k of HANDLES) {
        const c = centers[k];
        if (Math.abs(rel.x * stage.dw - c.x) <= HANDLE + 3 && Math.abs(rel.y * stage.dh - c.y) <= HANDLE + 3) {
          return k;
        }
      }
      return null;
    }

    function insideCrop(rel) {
      return crop && rel.x >= crop.x && rel.x <= crop.x + crop.w && rel.y >= crop.y && rel.y <= crop.y + crop.h;
    }

    function startDrag(e) {
      if (smartTool.getMode() === 'click') return; // 点选模式由 SmartClickTool 接管鼠标
      if (!sourceImage) return;
      const rel = eventToRel(e);
      const h = hitHandle(rel);
      if (h) {
        drag = { mode: 'resize', handle: h, start: rel, orig: { ...crop } };
      } else if (insideCrop(rel)) {
        drag = { mode: 'move', start: rel, orig: { ...crop } };
      } else {
        // 新建选区
        crop = { x: rel.x, y: rel.y, w: 0, h: 0 };
        drag = { mode: 'create', start: rel };
      }
      e.preventDefault();
      redrawActive();
    }

    function moveDrag(e) {
      if (!drag) return;
      const rel = eventToRel(e);
      if (drag.mode === 'create') {
        const x = Math.min(drag.start.x, rel.x), y = Math.min(drag.start.y, rel.y);
        const w = Math.abs(rel.x - drag.start.x), h = Math.abs(rel.y - drag.start.y);
        crop = { x: Math.max(0, x), y: Math.max(0, y), w: Math.min(1 - x, w), h: Math.min(1 - y, h) };
      } else if (drag.mode === 'move') {
        const dx = rel.x - drag.start.x, dy = rel.y - drag.start.y;
        let x = drag.orig.x + dx, y = drag.orig.y + dy;
        x = Math.max(0, Math.min(1 - drag.orig.w, x));
        y = Math.max(0, Math.min(1 - drag.orig.h, y));
        crop = { x, y, w: drag.orig.w, h: drag.orig.h };
      } else if (drag.mode === 'resize') {
        let o = drag.orig;
        let left = o.x, top = o.y, right = o.x + o.w, bottom = o.y + o.h;
        const kh = drag.handle;
        if (kh.includes('w')) left = Math.min(rel.x, right - 0.02);
        if (kh.includes('e')) right = Math.max(rel.x, left + 0.02);
        if (kh.includes('n')) top = Math.min(rel.y, bottom - 0.02);
        if (kh.includes('s')) bottom = Math.max(rel.y, top + 0.02);
        left = Math.max(0, left); top = Math.max(0, top);
        right = Math.min(1, right); bottom = Math.min(1, bottom);
        crop = { x: left, y: top, w: right - left, h: bottom - top };
      }
      redrawActive();
      e.preventDefault();
    }

    function endDrag() {
      if (drag && drag.mode === 'create' && (!crop || crop.w < 0.01 || crop.h < 0.01)) {
        crop = null; // 太小的点击视为取消
      }
      drag = null;
      clearCropBtn.disabled = !crop;
      redrawActive();
    }

    canvas.addEventListener('mousedown', startDrag);
    canvas.addEventListener('touchstart', startDrag, { passive: false });
    window.addEventListener('mousemove', moveDrag);
    window.addEventListener('touchmove', moveDrag, { passive: false });
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('touchend', endDrag);
    canvas.addEventListener('dblclick', () => {
      if (smartTool.getMode() === 'click') return;
      crop = null;
      clearCropBtn.disabled = true;
      redrawActive();
    });

    /* ---------- 处理与下载 ---------- */
    async function processFile(file) {
      if (!file) return;
      const valid = /image\/(png|jpeg|jpg|webp|bmp)/i.test(file.type);
      if (!valid) { setError('不支持的图片格式，请上传 JPG / PNG / WebP / BMP'); return; }
      if (file.size > 50 * 1024 * 1024) { setError('图片过大，建议压缩到 10MB 以内'); return; }

      currentFileName = (file.name.replace(/\.[^.]+$/, '') || 'remove-bg') + '.png';
      currentFile = file;
      sourceImage = await new Promise((res) => {
        const img = new Image();
        img.onload = () => res(img);
        img.src = URL.createObjectURL(file);
      });
      upload.hidden = true;
      editor.hidden = false;
      crop = null;
      clearCropBtn.disabled = true;
      smartTool.resetForNewImage();
      fitCanvas();
      afterImg.src = '';
      emptyTip.style.display = '';
      setStatus('已加载原图。框选要保留的区域后，点击「开始抠图」。', 'info');
    }

    async function runRemoveBg() {
      const file = currentFile || fileInput.files[0];
      if (!file || !sourceImage) return;
      setLoading('AI 正在识别前景并移除背景，首次使用会自动下载模型…');
      const form = new FormData();
      form.append('image', file);
      form.append('model', modelSel.value);
      if (crop) form.append('crop', JSON.stringify([crop.x, crop.y, crop.w, crop.h]));

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120000);
      try {
        const r = await fetch('/watermark-remover/api/remove-bg', { method: 'POST', body: form, signal: controller.signal });
        if (!r.ok) throw new Error('服务返回 ' + r.status);
        const j = await r.json();
        if (!j.ok) throw new Error(j.error || '处理失败');
        currentResult = j.result_url;
        afterImg.onerror = () => { clearTimeout(timer); setError('结果图片加载失败，请重试'); };
        afterImg.onload = () => {
          clearTimeout(timer);
          setStatus('抠图完成 ✔ 可下载透明 PNG，或调整选区重新抠图。', 'info');
          processBtn.disabled = false;
          downloadBtn.disabled = false;
          emptyTip.style.display = 'none';
        };
        afterImg.src = j.result_url;
        if (afterImg.complete) afterImg.onload();
      } catch (e) {
        clearTimeout(timer);
        if (e && e.name === 'AbortError') setError('处理超时（超过 120 秒），请换更小/更简单的图片或重试');
        else setError(String(e.message || e));
      }
    }

    /* ---------- 绑定 ---------- */
    drop.addEventListener('click', () => fileInput.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
    fileInput.addEventListener('change', () => processFile(fileInput.files[0]));
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-active'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-active'); }));
    drop.addEventListener('drop', (e) => processFile(e.dataTransfer.files[0]));

    // 「开始抠图」按模式分流：点选模式走 SAM 结果输出，框选模式走原 u2net 管线
    processBtn.addEventListener('click', async () => {
      if (smartTool.getMode() === 'click') {
        if (!smartTool.hasMask()) { setError('请先在画面左键点击保留要抠出的区域（可多次点击叠加，右键移除）'); return; }
        setLoading('正在生成透明 PNG…');
        processBtn.disabled = true;
        try {
          const mode = samModeSel.value;
          if (mode === 'alpha') await smartTool.applyAsAlpha();
          else await smartTool.fuseWithU2net(currentFile, '/watermark-remover/api/remove-bg');
        } catch (e) {
          setError(String((e && e.message) || e));
        } finally {
          processBtn.disabled = false;
        }
        return;
      }
      runRemoveBg();
    });
    modelSel.addEventListener('change', () => {
      if (sourceImage && smartTool.getMode() === 'crop') runRemoveBg();
    });
    downloadBtn.addEventListener('click', () => {
      if (!currentResult) return;
      const a = document.createElement('a');
      a.href = currentResult;
      a.download = currentFileName;
      a.click();
    });
    resetBtn.addEventListener('click', () => {
      if (smartTool) { smartTool.clearAll(); smartTool.setMode('crop'); }
      modeClickBtn.classList.remove('is-active');
      modeCropBtn.classList.add('is-active');
      samModeSel.hidden = true;
      hint.textContent = '在图片上拖拽框选要保留的区域（如小猫）。不选则抠全图；双击选区可清除。框选后点「开始抠图」。';
      reset();
    });
    clearCropBtn.addEventListener('click', () => {
      if (smartTool.getMode() === 'click') { smartTool.clearAll(); return; }
      crop = null; clearCropBtn.disabled = true; redrawActive();
    });

    // 工具栏：框选 / 智能点选 切换
    function setMode(next) {
      if (next === 'click' && !samAvailable) {
        setError('智能点选功能暂不可用（SAM 模型未加载），请使用「框选」模式抠图。');
        fitCanvas();
        return;
      }
      const click = next === 'click';
      smartTool.setMode(next);
      modeClickBtn.classList.toggle('is-active', click);
      modeCropBtn.classList.toggle('is-active', !click);
      samModeSel.hidden = !click;
      hint.textContent = click
        ? '悬浮预览物体（淡蓝），左键单击保留，右键单击移除；滚轮缩放，空格+拖拽平移；Ctrl+Z 撤销。'
        : '在图片上拖拽框选要保留的区域（如小猫）。不选则抠全图；双击选区可清除。框选后点「开始抠图」。';
      fitCanvas();
    }
    modeClickBtn.addEventListener('click', () => setMode(smartTool.getMode() === 'click' ? 'crop' : 'click'));
    modeCropBtn.addEventListener('click', () => { if (smartTool.getMode() === 'click') setMode('crop'); });
    undoBtn.addEventListener('click', () => smartTool.undo());
    clearPtsBtn.addEventListener('click', () => smartTool.clearAll());
    samModeSel.addEventListener('change', () => {
      if (smartTool.getMode() === 'click' && samModeSel.value === 'alpha' && smartTool.hasMask()) {
        smartTool.applyAsAlpha().catch((e) => {
          console.error('[app.samModeSel.change] applyAsAlpha error', e);
          setError('生成预览失败：' + (e?.message || e));
        });
      }
    });

    window.addEventListener('resize', () => { if (sourceImage && !editor.hidden) fitCanvas(); });

    activeCleanup = () => {
      if (sourceImage && sourceImage.src.startsWith('blob:')) URL.revokeObjectURL(sourceImage.src);
    };
  }

  /* ---------- Auth（登录 / 注册 Modal） ---------- */
  const authModal = document.getElementById('authModal');
  const authArea = document.getElementById('authArea');
  const authForm = document.getElementById('authForm');
  const authError = document.getElementById('authError');
  const authHint = document.getElementById('authHint');
  const authSubmit = document.getElementById('authSubmit');
  let authMode = 'login'; // login | register
  let currentUser = null;

  /* ---------- Onboarding（进入网站） ---------- */
  const onboardModal = document.getElementById('onboardModal');
  const onboardVideo = document.getElementById('onboardVideo');
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

  function optimizeOnboardVideo() {
    const v = onboardVideo || document.getElementById('onboardVideo');
    if (!v) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth;
    const H = window.innerHeight;
    // 越大屏 / 越高 DPR，解码缓冲区越要压低；scale(2) 会把画面再 GPU 放大回来，肉眼几乎无差
    const qualityFactor = (W > 1920 || H > 1080 || dpr > 1.5) ? 3 : 2;
    const vw = Math.max(320, Math.floor(W / qualityFactor));
    const vh = Math.max(180, Math.floor(H / qualityFactor));
    if (v.width !== vw || v.height !== vh) {
      v.width = vw;
      v.height = vh;
    }
  }

  function openOnboard() {
    if (authModal && authModal.classList.contains('is-open')) closeAuth();
    var om = onboardModal || document.getElementById('onboardModal');
    if (!om) return;
    // 弹窗打开时若落地页仍有海洋 canvas 动画则停掉（极光版 landing 已无 canvas，这里为兼容保留）
    try { if (landingSeaStop && typeof landingSeaStop.stop === 'function') landingSeaStop.stop(); } catch (_) {}
    optimizeOnboardVideo();
    om.classList.add('is-open');
    om.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    try { var v = onboardVideo || document.getElementById('onboardVideo'); if (v && v.paused) v.play(); } catch (_) {}
    var nm = onboardName || document.getElementById('onboardName');
    if (nm) setTimeout(() => nm.focus(), 80);
  }
  window.openOnboard = openOnboard;
  function closeOnboard() {
    if (!onboardModal || !onboardModal.classList.contains('is-open')) return;
    onboardModal.classList.remove('is-open');
    onboardModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    try { if (onboardVideo && !onboardVideo.paused) onboardVideo.pause(); } catch (_) {}
    // 关闭弹窗后若落地页存在海洋 canvas 则恢复（极光版 landing 已无 canvas，跳过）
    try {
      if (landing && !landing.classList.contains('is-leaving') && landingCanvas) {
        if (landingSeaStop && typeof landingSeaStop.stop === 'function') landingSeaStop.stop();
        landingSeaStop = createOceanScene(landingCanvas, { theme: 'day', meteors: true, meteorColor: '150,230,255', maxPar: 12 });
      }
    } catch (_) {}
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
    'register': ['phone', 'code'],
  };

  function setAuthMode(mode) {
    if (!authForm) return;
    authMode = mode;
    authForm.querySelectorAll('.auth-card__field').forEach((f) => { f.hidden = !AUTH_FIELDS[mode].includes(f.dataset.field); });
    const title = document.getElementById('authTitle');
    if (title) {
      title.textContent = mode === 'register' ? '注册' : '登录';
    }
    const headerText = document.getElementById('authHeaderText');
    const headerLink = document.getElementById('authHeaderLink');
    const authOptions = document.getElementById('authOptions');
    if (headerText && headerLink) {
      if (mode === 'register') {
        headerText.textContent = '已有账号？';
        headerLink.textContent = '点此登录';
        headerLink.dataset.authMode = 'login';
      } else {
        headerText.textContent = '没有账号？';
        headerLink.textContent = '点此注册';
        headerLink.dataset.authMode = 'register';
      }
    }
    if (authOptions) {
      authOptions.hidden = (mode === 'register');
    }
    if (authSubmit) authSubmit.textContent = mode === 'register' ? '注 册' : '登 录';
    if (authHint) authHint.textContent = '';
    authError.hidden = true;
  }

  /* ---------- 台灯多主题 ---------- */
  const LAMP_THEMES = ['green', 'violet', 'blue', 'rose', 'amber', 'cyan'];
  let lampThemeIndex = 0;
  function applyLampTheme(name) {
    if (!authModal) return;
    LAMP_THEMES.forEach((t) => authModal.classList.remove('theme-' + t));
    authModal.classList.add('theme-' + name);
    lampThemeIndex = LAMP_THEMES.indexOf(name);
  }
  function nextLampTheme() {
    lampThemeIndex = (lampThemeIndex + 1) % LAMP_THEMES.length;
    applyLampTheme(LAMP_THEMES[lampThemeIndex]);
  }
  function randomLampTheme() {
    let i = Math.floor(Math.random() * LAMP_THEMES.length);
    if (i === lampThemeIndex) i = (i + 1) % LAMP_THEMES.length;
    lampThemeIndex = i;
    applyLampTheme(LAMP_THEMES[i]);
  }

  function setLampState(state) {
    if (!authModal) return;
    authModal.classList.remove('is-off', 'is-on', 'is-error', 'is-surprised');
    if (state === 'off') authModal.classList.add('is-off');
    else if (state === 'error') authModal.classList.add('is-on', 'is-error');
    else if (state === 'surprised') authModal.classList.add('is-on', 'is-surprised');
    else authModal.classList.add('is-on');
  }

  function hideAuthToast() {
    const toast = document.getElementById('authToast');
    if (toast) { toast.classList.remove('is-visible'); toast.hidden = true; }
  }
  function showAuthToast(msg) {
    const toast = document.getElementById('authToast');
    if (!toast) return;
    toast.textContent = msg;
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    setTimeout(() => hideAuthToast(), 3200);
  }

  function openAuth(mode) {
    setAuthMode(mode || 'login');
    if (onboardModal && onboardModal.classList.contains('is-open')) closeOnboard();
    if (!authModal) return;
    authModal.classList.add('is-open');
    applyLampTheme(LAMP_THEMES[0]); // 初始绿色，开灯时再随机
    setLampState('off');
    authModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    hideAuthToast();
    const lamp = document.getElementById('authLamp');
    if (lamp) { lamp.classList.remove('is-sad', 'is-surprised'); }
  }
  window.openAuth = openAuth;
  function closeAuth() {
    if (!authModal || !authModal.classList.contains('is-open')) return;
    authModal.classList.remove('is-open');
    authModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    try { authForm?.reset(); } catch (_) {}
    authError.hidden = true;
    hideAuthToast();
    setTimeout(() => setLampState('off'), 200);
  }

  function showAuthError(msg) {
    authError.textContent = msg;
    authError.hidden = true;
    setLampState('error');
    const lamp = document.getElementById('authLamp');
    if (lamp) {
      lamp.classList.remove('is-sad', 'is-surprised', 'is-peek');
      lamp.classList.add('is-sad');
      setTimeout(() => lamp.classList.remove('is-sad'), 900);
    }
    const card = document.getElementById('authCard');
    if (card && !card.classList.contains('is-success')) {
      card.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 320, easing: 'ease-in-out' });
    }
    // 给当前可见输入框加红脉冲反馈
    if (authForm) {
      authForm.querySelectorAll('.auth-card__field:not([hidden]) input').forEach((inp) => {
        inp.classList.remove('is-error-pulse');
        void inp.offsetWidth; // 重置动画
        inp.classList.add('is-error-pulse');
        setTimeout(() => inp.classList.remove('is-error-pulse'), 650);
      });
    }
    showAuthToast(msg);
  }

  function resolveUserAvatarUrl(avatar) {
    if (!avatar) return '';
    if (avatar.startsWith('data:')) return avatar;
    if (/^\d$/.test(avatar)) return '/images/avatars/avatar-' + (parseInt(avatar, 10) + 1) + '.png?v=2';
    return avatar;
  }

  function userAvatarHtml(user, cls) {
    const initial = aesc((user.display_name || user.username || 'U').slice(0, 1).toUpperCase());
    const url = resolveUserAvatarUrl(user.avatar);
    if (url) {
      return '<img class="' + cls + '" src="' + aesc(url) + '" alt="">';
    }
    return '<span class="' + cls + '">' + initial + '</span>';
  }

  function renderAuthArea() {
    const landingAuth = document.getElementById('landingAuth');
    const signinOnclick = 'onclick="try{openAuth(\'login\');}catch(_){var m=document.getElementById(\'authModal\');if(m){m.classList.add(\'is-open\');m.setAttribute(\'aria-hidden\',\'false\');}}return false;"';
    if (landingAuth) {
      if (currentUser) {
        const name = aesc(currentUser.display_name || currentUser.username);
        landingAuth.innerHTML =
          '<span class="landing__user">' + name + '</span>' +
          '<button class="landing__top-btn" id="landingLogout" type="button">Log off</button>' +
          '<button class="landing__top-btn is-ghost" id="landingSignin" type="button" hidden ' + signinOnclick + '>Sign in</button>';
      } else {
        landingAuth.innerHTML =
          '<button class="landing__top-btn" id="landingSignin" type="button" ' + signinOnclick + '>Sign in</button>' +
          '<button class="landing__top-btn is-ghost" id="landingLogout" type="button" disabled>Log off</button>';
      }
    }
    if (!authArea) return;
    if (currentUser) {
      const name = aesc(currentUser.display_name || currentUser.username);
      authArea.innerHTML =
        '<div class="user-chip" id="userChip">' +
          userAvatarHtml(currentUser, 'user-chip__avatar') +
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
    } else {
      res = await api('/api/auth/register', { phone: v('phone'), code: v('code') });
    }
    if (res.ok && res.data.user) {
      currentUser = res.data.user;
      renderAuthArea();
      const card = document.getElementById('authCard');
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

  // 输入时从错误态恢复为绿灯
  authForm?.addEventListener('input', () => {
    if (authModal && authModal.classList.contains('is-error')) {
      setLampState('on');
      hideAuthToast();
      authError.hidden = true;
      const lamp = document.getElementById('authLamp');
      if (lamp) lamp.classList.remove('is-sad');
    }
  });

  const authSendBtn = document.querySelector('[data-auth-send]');
  if (authSendBtn) authSendBtn.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const phone = (new FormData(authForm).get('phone') || '').toString().trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) { showAuthError('请先填写正确的 11 位手机号'); return; }
    const purpose = authMode === 'register' ? 'register' : 'login';
    btn.disabled = true;
    const res = await api('/api/auth/send-code', { phone, purpose });
    btn.disabled = false;
    if (res.ok) {
      const dev = res.data.devCode ? ('（开发态验证码：' + res.data.devCode + '）') : '';
      showAuthToast('验证码已发送，请查收' + dev);
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

  /* ---------- 台灯交互：拖拽灯绳 + 切换 + 偷看表情 ---------- */
  function toggleLamp() {
    if (!authModal) return;
    const lamp = document.getElementById('authLamp');
    if (lamp) { lamp.classList.add('is-pulled'); setTimeout(() => lamp.classList.remove('is-pulled'), 350); }
    const isOff = authModal.classList.contains('is-off');
    if (isOff) {
      randomLampTheme();           // 每次开灯随机一个主题色
      setLampState('on');
      hideAuthToast();
      const first = authForm?.querySelector('.auth-card__field:not([hidden]) input');
      if (first) setTimeout(() => first.focus(), 140);
    } else {
      setLampState('off');
      hideAuthToast();
      const lamp2 = document.getElementById('authLamp');
      if (lamp2) lamp2.classList.remove('is-peek');
    }
  }

  function initLampDrag() {
    if (!authModal) return;
    const knob = authModal.querySelector('.lamp__pull-svgknob');
    const line = authModal.querySelector('.lamp__pull-svgline');
    if (!knob) return;
    const MAX_PULL = 64;
    let dragging = false, startY = 0, curY = 0, moved = false;
    const move = (y) => {
      curY = Math.max(0, Math.min(MAX_PULL, y - startY));
      if (Math.abs(curY) > 3) moved = true;
      knob.style.transform = 'translateY(' + curY + 'px)';
      if (line) line.style.transform = 'translateY(' + curY + 'px)';
    };
    knob.addEventListener('pointerdown', (e) => {
      if (!authModal.classList.contains('is-open')) return;
      dragging = true; moved = false; startY = e.clientY; curY = 0;
      knob.classList.add('is-dragging');
      if (line) line.classList.add('is-dragging');
      try { knob.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });
    knob.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      move(e.clientY);
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      knob.classList.remove('is-dragging');
      if (line) line.classList.remove('is-dragging');
      knob.style.transform = '';
      if (line) line.style.transform = '';
      // 下拖超过阈值，或只是轻点一下都视为切换
      if (moved ? curY > MAX_PULL * 0.45 : true) toggleLamp();
    };
    knob.addEventListener('pointerup', end);
    knob.addEventListener('pointercancel', end);
  }

  function initLampPeek() {
    if (!authForm) return;
    authForm.addEventListener('focusin', () => {
      const lamp = document.getElementById('authLamp');
      if (lamp && authModal && authModal.classList.contains('is-on') && !authModal.classList.contains('is-error')) {
        lamp.classList.add('is-peek');
      }
    });
    authForm.addEventListener('focusout', () => {
      const lamp = document.getElementById('authLamp');
      if (lamp) lamp.classList.remove('is-peek');
    });
  }

  initLampDrag();
  initLampPeek();

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
    if (e.target.closest('#lampPull')) { toggleLamp(); return; }
    if (e.target.closest('#lampThemeBtn')) { nextLampTheme(); return; }
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
    if (tab) { setAuthMode(tab.dataset.authTab); setLampState('on'); hideAuthToast(); return; }
    const modeLink = e.target.closest('[data-auth-mode]');
    if (modeLink) {
      if (modeLink.dataset.authMode === 'forgot') {
        showAuthToast('请联系管理员重置密码');
        return;
      }
      setAuthMode(modeLink.dataset.authMode);
      setLampState('on');
      const lamp = document.getElementById('authLamp');
      if (lamp) lamp.classList.remove('is-peek');
      hideAuthToast();
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
    if (parts[0] === 'tools' && parts[1] === 'remove-bg') {
      if (!ENABLE_MATTING) { location.hash = '#/tools'; return; }
      return renderRemoveBg();
    }
    if (parts[0] === 'tools' && parts[1] === 'docx-watermark') return renderDocxWatermark();
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
    // 站点统计卡片已移除：保留空函数避免调用处报错
  }

  function initHomeFx() {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fine = window.matchMedia('(hover: hover)').matches;
    if (reduce || !fine) return;

    // 装饰线条跟随鼠标轻微视差（圆环已有自转，不动 transform）
    const hero = document.querySelector('.zh-hero');
    const lineShape = document.querySelector('.zh-hero__shape--line');
    if (hero && lineShape) {
      hero.addEventListener('mousemove', (e) => {
        const r = hero.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - .5;
        const y = (e.clientY - r.top) / r.height - .5;
        lineShape.style.transform = `translate(${x * 14}px, ${y * 14}px) rotate(12deg)`;
      }, { passive: true });
      hero.addEventListener('mouseleave', () => { lineShape.style.transform = ''; });
    }

    // 磁吸按钮
    document.querySelectorAll('.zh-magnetic').forEach((btn) => {
      if (btn.dataset.mag) return; btn.dataset.mag = '1';
      btn.addEventListener('mousemove', (e) => {
        const r = btn.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / r.width * 10;
        const dy = (e.clientY - (r.top + r.height / 2)) / r.height * 10;
        btn.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`;
      });
      btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
    });

    bindMatrixCards();
  }

  function bindMatrixCards() {
    document.querySelectorAll('.zh-glass-card[data-href], .zh-poster-card[data-href], .zh-bento__card[data-href]').forEach((card) => {
      if (card.dataset.matrixBound) return;
      card.dataset.matrixBound = '1';
      const go = (e) => {
        if (e.button !== 0) return;
        const href = card.getAttribute('data-href');
        if (!href) return;
        if (card.dataset.internal === '1' && href.startsWith('#')) {
          e.preventDefault();
          location.hash = href.replace(/^#/, '');
        } else if (card.dataset.internal === '1') {
          e.preventDefault();
          location.hash = href;
        } else {
          e.preventDefault();
          // 站内链接（/ 开头）与 mailto/tel 直接在当前页打开，避免多开标签页；
          // 仅跨域外部 http(s) 链接才新开。
          if (/^https?:\/\//i.test(href) && !href.startsWith(location.origin)) {
            window.open(href, '_blank', 'noopener,noreferrer');
          } else {
            location.href = href;
          }
        }
      };
      card.addEventListener('click', go);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e); } });
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
  // 杂志编辑风：主页改用 CSS 静态纸纹 + 印刷网格背景，不再启动动态海洋 canvas
  const homeSeaCanvas = document.getElementById('homeSea');
  // 保留 homeSeaCanvas 引用以便将来复用；当前背景由 styles.css 的 body::before/::after 提供
  if (homeSeaCanvas) homeSeaCanvas.style.display = 'none';

  // 全局错误兜底：若渲染过程中抛出异常，至少在页面上显示出来，而不是一面空白
  window.addEventListener('error', (e) => {
    console.error('Global error:', e.error || e.message);
    if (view && !view.innerHTML.trim()) {
      view.innerHTML = '<section class="section" style="margin-top:var(--sp-7)"><h2 class="section__title">页面加载出错</h2><p class="post-body" style="margin-top:var(--sp-4);color:var(--text-soft)">' + esc(String(e.error && e.error.message || e.message)) + '</p></section>';
    }
  });

  document.getElementById('footerYear').textContent = new Date().getFullYear();
  window.addEventListener('hashchange', route);

  // 欢迎弹窗打开期间，窗口尺寸/DPR 变化时重新优化视频解码分辨率，防止缩放/最大化后掉帧
  let onboardResizeTimer = null;
  window.addEventListener('resize', () => {
    if (onboardModal && onboardModal.classList.contains('is-open')) {
      clearTimeout(onboardResizeTimer);
      onboardResizeTimer = setTimeout(optimizeOnboardVideo, 150);
    }
  }, { passive: true });

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
