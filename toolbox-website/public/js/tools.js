/* =========================================================
   tools.js · 工具箱注册表与实现
   所有计算均在浏览器本地完成，不上传任何数据
   ========================================================= */
(function () {
  'use strict';

  // 简易内联图标（描边风格，跟随 currentColor）
  const I = {
    json: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1"/><path d="M16 3h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1"/></svg>',
    base64: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h2M11 9h2M15 9h2M7 13h2M11 13h2M15 13h2"/></svg>',
    clock: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    key: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="4"/><path d="M11 11l9 9M17 17l2-2M14 14l2-2"/></svg>',
    uuid: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M9 12h6"/></svg>',
    color: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/></svg>',
    unit: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h13l-3-3M21 17H8l3 3"/></svg>',
    calc: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h1M12 11h1M15 11h0M9 15h1M12 15h1M15 15v3M9 18h3"/></svg>',
    text: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5h14M5 5v2M19 5v2M12 5v14M9 19h6"/></svg>',
    url: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11 7"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7L13 17"/></svg>',
    base: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
    soon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="M9 12l2 2 4-4"/></svg>',
    wm: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-5 4 4 3-3 4 4"/><path d="M3 21h18"/><path d="M14 4l5 5-7 7-4-4z"/><path d="M14 4l3-1 1 3"/></svg>',
  };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function copyBtn(textGetter) {
    return `<button class="btn btn--ghost btn--sm" data-copy>复制</button>`;
  }

  // 复制逻辑（事件委托在 app.js 中统一处理，这里只放标记）
  // 每个工具 render 返回 HTML 字符串并可选地接收一个 onMount 回调

  const TOOLS = [
    {
      id: 'json', title: 'JSON 格式化', desc: '美化 / 压缩 / 校验 JSON', icon: I.json,
      render: () => `
        <div class="field">
          <label class="field__label">输入 JSON</label>
          <textarea class="textarea" id="t-json-in" placeholder='{"hello":"world"}'></textarea>
          <div class="help" id="t-json-msg"></div>
        </div>
        <div class="row">
          <button class="btn btn--primary btn--sm" data-act="beautify">格式化</button>
          <button class="btn btn--ghost btn--sm" data-act="minify">压缩</button>
          <button class="btn btn--ghost btn--sm" data-copy="#t-json-out">复制</button>
        </div>
        <div class="field" style="margin-top:16px">
          <label class="field__label">输出</label>
          <div class="output" id="t-json-out"></div>
        </div>`,
      mount: (el) => {
        const inp = el.querySelector('#t-json-in'), out = el.querySelector('#t-json-out'), msg = el.querySelector('#t-json-msg');
        el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
          try {
            const v = JSON.parse(inp.value);
            out.textContent = b.dataset.act === 'minify' ? JSON.stringify(v) : JSON.stringify(v, null, 2);
            msg.textContent = '合法 JSON'; msg.style.color = 'var(--accent)';
          } catch (e) { out.textContent = ''; msg.textContent = '解析错误：' + e.message; msg.style.color = '#ef4444'; }
        }));
      },
    },
    {
      id: 'base64', title: 'Base64 编解码', desc: '文本与 Base64 互转', icon: I.base64,
      render: () => `
        <div class="field">
          <label class="field__label">文本 / Base64</label>
          <textarea class="textarea" id="t-b64-in" placeholder="输入要编码或解码的内容"></textarea>
        </div>
        <div class="row">
          <button class="btn btn--primary btn--sm" data-act="encode">编码 →</button>
          <button class="btn btn--ghost btn--sm" data-act="decode">← 解码</button>
          <button class="btn btn--ghost btn--sm" data-copy="#t-b64-out">复制</button>
        </div>
        <div class="field" style="margin-top:16px">
          <label class="field__label">结果</label>
          <div class="output" id="t-b64-out"></div>
        </div>`,
      mount: (el) => {
        const inp = el.querySelector('#t-b64-in'), out = el.querySelector('#t-b64-out');
        el.querySelector('[data-act="encode"]').addEventListener('click', () => { try { out.textContent = btoa(unescape(encodeURIComponent(inp.value))); } catch (e) { out.textContent = '编码失败'; } });
        el.querySelector('[data-act="decode"]').addEventListener('click', () => { try { out.textContent = decodeURIComponent(escape(atob(inp.value.trim()))); } catch (e) { out.textContent = '解码失败：不是合法的 Base64'; } });
      },
    },
    {
      id: 'timestamp', title: '时间戳转换', desc: 'Unix 秒/毫秒 ↔ 可读时间', icon: I.clock,
      render: () => `
        <div class="field">
          <label class="field__label">当前时间</label>
          <div class="output" id="t-ts-now"></div>
        </div>
        <div class="field">
          <label class="field__label">时间戳 → 时间</label>
          <input class="input" id="t-ts-in" placeholder="1700000000 或 1700000000000" />
          <div class="help">自动识别秒 / 毫秒</div>
        </div>
        <div class="row">
          <button class="btn btn--primary btn--sm" data-act="to-date">转换</button>
          <button class="btn btn--ghost btn--sm" data-copy="#t-ts-out">复制</button>
        </div>
        <div class="field" style="margin-top:16px">
          <label class="field__label">结果</label>
          <div class="output" id="t-ts-out"></div>
        </div>
        <div class="field">
          <label class="field__label">时间 → 时间戳</label>
          <input class="input" id="t-ts-date" type="datetime-local" />
          <div class="row" style="margin-top:10px">
            <button class="btn btn--ghost btn--sm" data-act="to-sec">转秒</button>
            <button class="btn btn--ghost btn--sm" data-act="to-ms">转毫秒</button>
            <button class="btn btn--ghost btn--sm" data-copy="#t-ts-out2">复制</button>
          </div>
          <div class="output" id="t-ts-out2" style="margin-top:10px"></div>
        </div>`,
      mount: (el) => {
        const now = el.querySelector('#t-ts-now');
        const tick = () => { const d = new Date(); now.textContent = d.toLocaleString('zh-CN') + '  (' + Math.floor(d.getTime() / 1000) + 's)'; };
        tick(); const iv = setInterval(tick, 1000);
        el._cleanup = () => clearInterval(iv);
        const out = el.querySelector('#t-ts-out');
        el.querySelector('[data-act="to-date"]').addEventListener('click', () => {
          const v = el.querySelector('#t-ts-in').value.trim();
          if (!/^\d+$/.test(v)) { out.textContent = '请输入数字时间戳'; return; }
          let ms = v.length > 11 ? +v : +v * 1000;
          out.textContent = new Date(ms).toLocaleString('zh-CN');
        });
        const out2 = el.querySelector('#t-ts-out2');
        const toTs = (ms) => { out2.textContent = String(ms); };
        el.querySelector('[data-act="to-sec"]').addEventListener('click', () => { const d = el.querySelector('#t-ts-date').value; toTs(d ? Math.floor(new Date(d).getTime() / 1000) : Math.floor(Date.now() / 1000)); });
        el.querySelector('[data-act="to-ms"]').addEventListener('click', () => { const d = el.querySelector('#t-ts-date').value; toTs(d ? new Date(d).getTime() : Date.now()); });
      },
    },
    {
      id: 'password', title: '密码生成器', desc: '自定义长度与字符集', icon: I.key,
      render: () => `
        <div class="field">
          <label class="field__label">长度：<span id="t-pw-len-v">16</span></label>
          <input class="input" id="t-pw-len" type="range" min="4" max="64" value="16" />
        </div>
        <div class="row">
          <label class="field"><input type="checkbox" id="t-pw-u" checked /> 大写 A-Z</label>
          <label class="field"><input type="checkbox" id="t-pw-l" checked /> 小写 a-z</label>
          <label class="field"><input type="checkbox" id="t-pw-n" checked /> 数字 0-9</label>
          <label class="field"><input type="checkbox" id="t-pw-s" /> 符号 !@#</label>
        </div>
        <div class="row" style="margin-top:14px">
          <button class="btn btn--primary btn--sm" data-act="gen">生成</button>
          <button class="btn btn--ghost btn--sm" data-copy="#t-pw-out">复制</button>
        </div>
        <div class="field" style="margin-top:16px">
          <label class="field__label">结果</label>
          <div class="output" id="t-pw-out"></div>
        </div>`,
      mount: (el) => {
        const len = el.querySelector('#t-pw-len'), lenv = el.querySelector('#t-pw-len-v'), out = el.querySelector('#t-pw-out');
        len.addEventListener('input', () => (lenv.textContent = len.value));
        el.querySelector('[data-act="gen"]').addEventListener('click', () => {
          const sets = [];
          if (el.querySelector('#t-pw-u').checked) sets.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
          if (el.querySelector('#t-pw-l').checked) sets.push('abcdefghijklmnopqrstuvwxyz');
          if (el.querySelector('#t-pw-n').checked) sets.push('0123456789');
          if (el.querySelector('#t-pw-s').checked) sets.push('!@#$%^&*()-_=+[]{};:,.<>?');
          if (!sets.length) { out.textContent = '请至少选择一种字符'; return; }
          const all = sets.join(''); let r = '';
          const n = +len.value;
          const buf = new Uint32Array(n); crypto.getRandomValues(buf);
          for (let i = 0; i < n; i++) r += all[buf[i] % all.length];
          out.textContent = r;
        });
      },
    },
    {
      id: 'uuid', title: 'UUID 生成', desc: '批量生成 v4 唯一标识', icon: I.uuid,
      render: () => `
        <div class="field">
          <label class="field__label">数量：<span id="t-uuid-n">4</span></label>
          <input class="input" id="t-uuid-num" type="range" min="1" max="20" value="4" />
        </div>
        <div class="row">
          <button class="btn btn--primary btn--sm" data-act="gen">生成</button>
          <button class="btn btn--ghost btn--sm" data-copy="#t-uuid-out">复制全部</button>
        </div>
        <div class="field" style="margin-top:16px">
          <label class="field__label">结果（每行一个）</label>
          <div class="output" id="t-uuid-out"></div>
        </div>`,
      mount: (el) => {
        const num = el.querySelector('#t-uuid-num'), nv = el.querySelector('#t-uuid-n'), out = el.querySelector('#t-uuid-out');
        num.addEventListener('input', () => (nv.textContent = num.value));
        el.querySelector('[data-act="gen"]').addEventListener('click', () => {
          const arr = []; for (let i = 0; i < +num.value; i++) arr.push(crypto.randomUUID());
          out.textContent = arr.join('\n');
        });
      },
    },
    {
      id: 'color', title: '颜色拾取器', desc: 'HEX / RGB / HSL 互转', icon: I.color,
      render: () => `
        <div class="field">
          <label class="field__label">选择颜色</label>
          <input class="input" id="t-color-pick" type="color" value="#0d9488" style="height:52px;padding:4px;cursor:pointer" />
        </div>
        <div class="field"><label class="field__label">HEX</label><div class="output" id="t-color-hex"></div></div>
        <div class="field"><label class="field__label">RGB</label><div class="output" id="t-color-rgb"></div></div>
        <div class="field"><label class="field__label">HSL</label><div class="output" id="t-color-hsl"></div></div>
        <button class="btn btn--ghost btn--sm" data-copy="#t-color-hex">复制 HEX</button>`,
      mount: (el) => {
        const pick = el.querySelector('#t-color-pick');
        const hex = el.querySelector('#t-color-hex'), rgb = el.querySelector('#t-color-rgb'), hsl = el.querySelector('#t-color-hsl');
        const upd = () => {
          const h = pick.value;
          const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
          hex.textContent = h.toUpperCase();
          rgb.textContent = `rgb(${r}, ${g}, ${b})`;
          const [hh, ss, ll] = rgbToHsl(r, g, b);
          hsl.textContent = `hsl(${hh}, ${ss}%, ${ll}%)`;
        };
        pick.addEventListener('input', upd); upd();
      },
    },
    {
      id: 'unit', title: '单位换算', desc: '长度 / 重量 / 温度', icon: I.unit,
      render: () => `
        <div class="field">
          <label class="field__label">类别</label>
          <select class="select" id="t-unit-cat">
            <option value="length">长度</option>
            <option value="weight">重量</option>
            <option value="temp">温度</option>
          </select>
        </div>
        <div class="row">
          <div class="field"><label class="field__label">从</label><select class="select" id="t-unit-from"></select></div>
          <div class="field"><label class="field__label">到</label><select class="select" id="t-unit-to"></select></div>
        </div>
        <div class="field"><label class="field__label">数值</label><input class="input" id="t-unit-val" type="number" value="1" /></div>
        <button class="btn btn--primary btn--sm" data-act="conv">换算</button>
        <div class="output" id="t-unit-out" style="margin-top:14px"></div>`,
      mount: (el) => {
        const units = {
          length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254 },
          weight: { kg: 1, g: 0.001, mg: 1e-6, t: 1000, lb: 0.453592, oz: 0.0283495 },
          temp: null,
        };
        const from = el.querySelector('#t-unit-from'), to = el.querySelector('#t-unit-to'), cat = el.querySelector('#t-unit-cat'), val = el.querySelector('#t-unit-val'), out = el.querySelector('#t-unit-out');
        const fill = () => {
          const u = units[cat.value] ? Object.keys(units[cat.value]) : ['C', 'F', 'K'];
          from.innerHTML = u.map((x) => `<option>${x}</option>`).join('');
          to.innerHTML = u.map((x) => `<option>${x}</option>`).join('');
          if (to.options[1]) to.selectedIndex = 1;
        };
        cat.addEventListener('change', fill); fill();
        el.querySelector('[data-act="conv"]').addEventListener('click', () => {
          const v = parseFloat(val.value); if (isNaN(v)) { out.textContent = '请输入数字'; return; }
          if (cat.value === 'temp') {
            out.textContent = tempConvert(v, from.value, to.value).toFixed(2) + ' ' + to.value;
          } else {
            const base = v * units[cat.value][from.value];
            out.textContent = (base / units[cat.value][to.value]).toFixed(6).replace(/\.?0+$/, '') + ' ' + to.value;
          }
        });
      },
    },
    {
      id: 'calc', title: '简易计算器', desc: '支持 + - * / ( )', icon: I.calc,
      render: () => `
        <div class="field">
          <label class="field__label">算式</label>
          <input class="input" id="t-calc-in" placeholder="(12 + 8) * 3 / 2" />
          <div class="help" id="t-calc-msg"></div>
        </div>
        <div class="row">
          <button class="btn btn--primary btn--sm" data-act="calc">计算</button>
          <button class="btn btn--ghost btn--sm" data-copy="#t-calc-out">复制</button>
        </div>
        <div class="field" style="margin-top:16px">
          <label class="field__label">结果</label>
          <div class="output" id="t-calc-out"></div>
        </div>`,
      mount: (el) => {
        const inp = el.querySelector('#t-calc-in'), out = el.querySelector('#t-calc-out'), msg = el.querySelector('#t-calc-msg');
        el.querySelector('[data-act="calc"]').addEventListener('click', () => {
          const expr = inp.value.trim();
          if (!/^[0-9+\-*/().\s]+$/.test(expr)) { out.textContent = ''; msg.textContent = '仅支持数字与 + - * / ( )'; msg.style.color = '#ef4444'; return; }
          try { const r = Function('return (' + expr + ')')(); out.textContent = String(r); msg.textContent = '完成'; msg.style.color = 'var(--accent)'; }
          catch (e) { out.textContent = ''; msg.textContent = '表达式有误'; msg.style.color = '#ef4444'; }
        });
      },
    },
    {
      id: 'textstat', title: '文本字数统计', desc: '字符 / 词 / 行 / 字节', icon: I.text,
      render: () => `
        <div class="field">
          <label class="field__label">输入文本</label>
          <textarea class="textarea" id="t-tx-in" placeholder="粘贴任意文本…" style="min-height:160px"></textarea>
        </div>
        <div class="stat-grid">
          <div class="stat"><div class="stat__num" id="t-tx-ch">0</div><div class="stat__label">字符（含空格）</div></div>
          <div class="stat"><div class="stat__num" id="t-tx-chw">0</div><div class="stat__label">字符（不含空格）</div></div>
          <div class="stat"><div class="stat__num" id="t-tx-wd">0</div><div class="stat__label">词（按空格）</div></div>
          <div class="stat"><div class="stat__num" id="t-tx-ln">0</div><div class="stat__label">行 / 字节(UTF-8)</div></div>
        </div>`,
      mount: (el) => {
        const inp = el.querySelector('#t-tx-in');
        const upd = () => {
          const t = inp.value;
          el.querySelector('#t-tx-ch').textContent = t.length;
          el.querySelector('#t-tx-chw').textContent = t.replace(/\s/g, '').length;
          el.querySelector('#t-tx-wd').textContent = (t.trim() ? t.trim().split(/\s+/).length : 0);
          el.querySelector('#t-tx-ln').textContent = (t ? t.split('\n').length : 0) + ' / ' + new TextEncoder().encode(t).length;
        };
        inp.addEventListener('input', upd);
      },
    },
    {
      id: 'url', title: 'URL 编解码', desc: 'URL 编码 / 解码', icon: I.url,
      render: () => `
        <div class="field">
          <label class="field__label">输入</label>
          <textarea class="textarea" id="t-url-in" placeholder="https://example.com/参数?q=你好"></textarea>
        </div>
        <div class="row">
          <button class="btn btn--primary btn--sm" data-act="enc">编码 →</button>
          <button class="btn btn--ghost btn--sm" data-act="dec">← 解码</button>
          <button class="btn btn--ghost btn--sm" data-copy="#t-url-out">复制</button>
        </div>
        <div class="field" style="margin-top:16px"><label class="field__label">结果</label><div class="output" id="t-url-out"></div></div>`,
      mount: (el) => {
        const inp = el.querySelector('#t-url-in'), out = el.querySelector('#t-url-out');
        el.querySelector('[data-act="enc"]').addEventListener('click', () => { try { out.textContent = encodeURIComponent(inp.value); } catch (e) { out.textContent = '编码失败'; } });
        el.querySelector('[data-act="dec"]').addEventListener('click', () => { try { out.textContent = decodeURIComponent(inp.value.trim()); } catch (e) { out.textContent = '解码失败'; } });
      },
    },
    {
      id: 'base', title: '进制转换', desc: '二 / 八 / 十 / 十六进制', icon: I.base,
      render: () => `
        <div class="field"><label class="field__label">十进制数字</label><input class="input" id="t-base-in" placeholder="255" /></div>
        <button class="btn btn--primary btn--sm" data-act="conv">转换</button>
        <div class="stat-grid" style="margin-top:16px">
          <div class="stat"><div class="stat__num" id="t-base-bin" style="font-size:1.1rem">—</div><div class="stat__label">二进制</div></div>
          <div class="stat"><div class="stat__num" id="t-base-oct" style="font-size:1.1rem">—</div><div class="stat__label">八进制</div></div>
          <div class="stat"><div class="stat__num" id="t-base-dec" style="font-size:1.1rem">—</div><div class="stat__label">十进制</div></div>
          <div class="stat"><div class="stat__num" id="t-base-hex" style="font-size:1.1rem">—</div><div class="stat__label">十六进制</div></div>
        </div>`,
      mount: (el) => {
        const inp = el.querySelector('#t-base-in');
        el.querySelector('[data-act="conv"]').addEventListener('click', () => {
          const v = parseInt(inp.value.trim(), 10);
          if (isNaN(v)) return;
          el.querySelector('#t-base-bin').textContent = v.toString(2);
          el.querySelector('#t-base-oct').textContent = v.toString(8);
          el.querySelector('#t-base-dec').textContent = v.toString(10);
          el.querySelector('#t-base-hex').textContent = v.toString(16).toUpperCase();
        });
      },
    },
    {
      id: 'watermark', title: '图片 / 视频去水印', desc: '涂抹水印区域，一键无痕修复', icon: I.wm,
      fullPage: true,
      render: () => `<div class="field"><p style="color:var(--text-soft)">正在打开去水印工具…</p></div>`,
      mount: () => {},
    },
  ];

  // helpers used above
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0; const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
  }
  function tempConvert(v, from, to) {
    let c = from === 'C' ? v : from === 'F' ? (v - 32) * 5 / 9 : v - 273.15;
    return to === 'C' ? c : to === 'F' ? c * 9 / 5 + 32 : c + 273.15;
  }

  // 每个工具的「壁纸式」封面渐变 + 分类（用于 haowallpaper 风格网格与筛选）
  const TOOL_META = {
    json:      { category: '开发辅助', cover: 'linear-gradient(135deg,#0ea5a4,#22d3ee)' },
    base64:    { category: '文本编码', cover: 'linear-gradient(135deg,#6366f1,#a855f7)' },
    timestamp: { category: '开发辅助', cover: 'linear-gradient(135deg,#f59e0b,#ef4444)' },
    password:  { category: '安全',     cover: 'linear-gradient(135deg,#ec4899,#f43f5e)' },
    uuid:      { category: '开发辅助', cover: 'linear-gradient(135deg,#10b981,#34d399)' },
    color:     { category: '开发辅助', cover: 'linear-gradient(135deg,#f472b6,#a78bfa,#22d3ee)' },
    unit:      { category: '计算转换', cover: 'linear-gradient(135deg,#0ea5e9,#6366f1)' },
    calc:      { category: '计算转换', cover: 'linear-gradient(135deg,#d946ef,#7c3aed)' },
    textstat:  { category: '文本',     cover: 'linear-gradient(135deg,#475569,#6366f1)' },
    url:       { category: '文本编码', cover: 'linear-gradient(135deg,#14b8a6,#0ea5e9)' },
    base:      { category: '计算转换', cover: 'linear-gradient(135deg,#f97316,#eab308)' },
    watermark: { category: '媒体处理', cover: 'linear-gradient(135deg,#0ea5e9,#14b8a6)' },
  };
  TOOLS.forEach((t) => {
    const m = TOOL_META[t.id];
    if (m) { t.category = m.category; t.cover = m.cover; }
  });

  window.TOOLS = TOOLS;
})();
