/* Word 图片导出 + 批量水印 - 浏览器端逻辑
 * 流程：上传 .docx → 后端抽取 word/media/ 图片 → 网格多选 → Canvas 加自定义水印 → 纯 JS 打包 ZIP 下载
 * 计算全部在浏览器本地完成，不依赖任何后端字体/渲染。
 */
(function () {
  'use strict';

  const meta = document.querySelector('meta[name="base-path"]');
  const BASE = (meta ? (meta.getAttribute('content') || '') : '').replace(/\/$/, '');

  // ---------- 状态 ----------
  const state = {
    originalFile: null, // 用户上传的原始 docx File
    images: [], // {index,name,mime,data_uri,size,checked,renderable}
    opts: {
      text: '仅供内部参考',
      size: 48,        // 相对字号（以 1000px 宽图片为基准）
      opacity: 0.35,
      color: '#ffffff',
      rotate: -30,
      layout: 'tile',  // tile | single
      gap: 240,        // 平铺间距（相对）
      posX: 90,        // 单点水印中心 X（0-100）
      posY: 90,        // 单点水印中心 Y（0-100）
      logo: null,      // Image 对象
      logoW: 0, logoH: 0,
      logoOn: false,
    },
  };

  // ---------- DOM ----------
  const $ = (s) => document.querySelector(s);
  const fileInput = $('#file');
  const drop = $('#drop');
  const uploadStatus = $('#upload-status');
  const stepGrid = $('#step-grid');
  const stepWm = $('#step-wm');
  const grid = $('#grid');
  const imgCount = $('#img-count');
  const selectAll = $('#select-all');
  const resetBtn = $('#reset');
  const preview = $('#preview');
  const previewBox = preview.parentElement;
  const positioner = document.createElement('div');
  positioner.className = 'wm-positioner';
  const visual = document.createElement('div');
  visual.className = 'wm-visual';
  const content = document.createElement('div');
  content.className = 'wm-content';
  const rotHandle = document.createElement('div');
  rotHandle.className = 'wm-handle wm-handle--rotate';
  rotHandle.title = '拖拽旋转';
  rotHandle.textContent = '⟳';
  const scaleHandle = document.createElement('div');
  scaleHandle.className = 'wm-handle wm-handle--scale';
  scaleHandle.title = '拖拽缩放+旋转';
  scaleHandle.textContent = '⤡';
  visual.appendChild(content);
  visual.appendChild(rotHandle);
  visual.appendChild(scaleHandle);
  positioner.appendChild(visual);
  previewBox.appendChild(positioner);
  const exportBtn = $('#export');
  const exportCount = $('#export-count');
  const exportDocxBtn = $('#export-docx');
  const vecNote = $('#vec-note');

  // ---------- 上传 ----------
  $('#pick').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) upload(e.target.files[0]);
  });
  ['dragenter', 'dragover'].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-drag'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-drag'); }));
  drop.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) upload(f);
  });

  async function upload(file) {
    if (!file.name.toLowerCase().endsWith('.docx')) {
      setStatus('请上传 .docx 格式的 Word 文档（.doc 请先在 Word 中另存为 .docx）', true);
      return;
    }
    setStatus('正在抽取图片…');
    const fd = new FormData();
    fd.append('docx', file);
    try {
      const r = await fetch(BASE + '/api/extract', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setStatus(j.error || '抽取失败', true);
        return;
      }
      const RASTER = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'];
      state.originalFile = file;
      state.images = j.images.map((im) => ({
        ...im,
        checked: true,
        renderable: RASTER.includes(im.mime),
      }));
      renderGrid();
      stepGrid.classList.remove('hidden');
      stepWm.classList.remove('hidden');
      vecNote.hidden = !state.images.some((i) => !i.renderable);
      setStatus('');
      redrawPreview();
    } catch (e) {
      setStatus('请求出错：' + e.message, true);
    }
  }

  function setStatus(msg, isErr) {
    uploadStatus.textContent = msg || '';
    uploadStatus.className = 'status' + (isErr ? ' is-error' : '');
  }

  // ---------- 图片网格 ----------
  function renderGrid() {
    imgCount.textContent = state.images.length;
    grid.innerHTML = state.images.map((im) => `
      <label class="cell${im.renderable ? '' : ' is-disabled'}" data-idx="${im.index}">
        <input type="checkbox" class="cell__chk" data-idx="${im.index}" ${im.checked ? 'checked' : ''} ${im.renderable ? '' : 'disabled'}>
        <div class="cell__thumb">
          ${im.renderable
            ? `<img src="${im.data_uri}" alt="${escapeAttr(im.name)}" loading="lazy">`
            : `<div class="cell__vec">矢量图<br>无法预览</div>`}
        </div>
        <div class="cell__name" title="${escapeAttr(im.name)}">${escapeHtml(im.name)}</div>
      </label>`).join('');
    bindGrid();
    updateCounts();
  }

  function bindGrid() {
    grid.querySelectorAll('.cell__chk').forEach((chk) => {
      chk.addEventListener('change', (e) => {
        const idx = +e.target.dataset.idx;
        const im = state.images.find((x) => x.index === idx);
        if (im) { im.checked = e.target.checked; updateCounts(); redrawPreview(); }
      });
    });
  }

  selectAll.addEventListener('change', (e) => {
    const v = e.target.checked;
    state.images.forEach((im) => { if (im.renderable) im.checked = v; });
    grid.querySelectorAll('.cell__chk').forEach((c) => { if (!c.disabled) c.checked = v; });
    updateCounts();
    redrawPreview();
  });

  resetBtn.addEventListener('click', () => {
    state.originalFile = null;
    state.images = [];
    stepGrid.classList.add('hidden');
    stepWm.classList.add('hidden');
    grid.innerHTML = '';
    vecNote.hidden = true;
    setStatus('');
  });

  function selectedRenderable() {
    return state.images.filter((i) => i.checked && i.renderable);
  }
  function updateCounts() {
    const n = selectedRenderable().length;
    exportCount.textContent = n;
    exportBtn.disabled = n === 0;
    exportDocxBtn.disabled = n === 0 || !state.originalFile;
  }

  // ---------- 水印参数 ----------
  const bindRange = (id, key, fmt) => {
    const el = $('#' + id);
    const val = $('#' + id + '-val');
    const apply = () => {
      state.opts[key] = +el.value;
      if (val) val.textContent = fmt ? fmt(+el.value) : el.value;
      redrawPreview();
    };
    el.addEventListener('input', apply);
    apply();
  };
  bindRange('wm-size', 'size', (v) => v);
  bindRange('wm-opacity', 'opacity', (v) => v + '%');
  bindRange('wm-rotate', 'rotate', (v) => v + '°');
  bindRange('wm-gap', 'gap', (v) => v);

  $('#wm-text').addEventListener('input', (e) => { state.opts.text = e.target.value; redrawPreview(); });
  $('#wm-color').addEventListener('input', (e) => { state.opts.color = e.target.value; redrawPreview(); });

  function updateLayoutUI(layout) {
    const isSingle = layout === 'single';
    $('#gap-field').style.display = isSingle ? 'none' : '';
    $('#pos-field').style.display = isSingle ? '' : 'none';
    if (isSingle) positioner.classList.add('is-active');
    else positioner.classList.remove('is-active');
  }

  document.querySelectorAll('#wm-layout .seg__btn').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#wm-layout .seg__btn').forEach((x) => x.classList.remove('is-active'));
      b.classList.add('is-active');
      state.opts.layout = b.dataset.layout;
      updateLayoutUI(state.opts.layout);
      redrawPreview();
    });
  });

  const POS_PRESETS = {
    tl: [10, 10], tc: [50, 10], tr: [90, 10],
    ml: [10, 50], mc: [50, 50], mr: [90, 50],
    bl: [10, 90], bc: [50, 90], br: [90, 90],
  };
  document.querySelectorAll('#wm-position .pos__btn').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#wm-position .pos__btn').forEach((x) => x.classList.remove('is-active'));
      b.classList.add('is-active');
      const [x, y] = POS_PRESETS[b.dataset.pos];
      state.opts.posX = x; state.opts.posY = y;
      redrawPreview();
    });
  });

  const logoInput = $('#wm-logo');
  $('#wm-logo-pick').addEventListener('click', () => logoInput.click());
  $('#wm-logo-on').addEventListener('change', (e) => {
    state.opts.logoOn = e.target.checked;
    $('#wm-logo-pick').hidden = !e.target.checked;
    $('#wm-logo-name').textContent = '';
    state.opts.logo = null;
    redrawPreview();
  });
  logoInput.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        state.opts.logo = img; state.opts.logoW = img.naturalWidth; state.opts.logoH = img.naturalHeight;
        $('#wm-logo-name').textContent = f.name; redrawPreview();
      };
      img.onerror = () => { $('#wm-logo-name').textContent = '图片加载失败'; };
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
  });

  // ---------- 预览 ----------
  function firstSelectedImage() {
    const sel = selectedRenderable();
    return sel.length ? sel[0] : null;
  }
  async function redrawPreview() {
    const im = firstSelectedImage();
    if (!im) { clearPreview('勾选至少一张可预览的图片'); hidePositioner(); return; }
    const img = await loadImage(im.data_uri);
    if (!img) { clearPreview('图片加载失败'); hidePositioner(); return; }
    drawWatermark(preview, img, state.opts);
    updatePositioner();
  }
  function hidePositioner() { positioner.classList.remove('is-active'); }
  function clearPreview(msg) {
    preview.width = 600; preview.height = 360;
    const ctx = preview.getContext('2d');
    ctx.clearRect(0, 0, preview.width, preview.height);
    ctx.fillStyle = 'rgba(100,116,139,0.6)';
    ctx.font = '15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(msg || '', preview.width / 2, preview.height / 2);
  }

  function drawWatermark(canvas, img, opts) {
    const w = img.naturalWidth, h = img.naturalHeight;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    ctx.save();
    ctx.globalAlpha = opts.opacity;
    const fontPx = Math.max(8, Math.round(opts.size * w / 1000));
    ctx.font = `600 ${fontPx}px "Microsoft YaHei","PingFang SC",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = opts.color;
    ctx.strokeStyle = opts.color;

    const drawMark = (x, y) => {
      if (opts.logoOn && opts.logo) {
        const lw = fontPx * 4.2;
        const lh = lw * (opts.logoH / opts.logoW || 1);
        ctx.drawImage(opts.logo, x - lw / 2, y - lh / 2, lw, lh);
        if (opts.text) {
          ctx.font = `600 ${Math.round(fontPx * 0.7)}px "Microsoft YaHei",sans-serif`;
          ctx.fillText(opts.text, x, y + lh / 2 + fontPx * 0.35);
        }
      } else if (opts.text) {
        ctx.fillText(opts.text, x, y);
      }
    };

    if (opts.layout === 'single') {
      const x = w * (opts.posX / 100);
      const y = h * (opts.posY / 100);
      ctx.translate(x, y);
      ctx.rotate(opts.rotate * Math.PI / 180);
      drawMark(0, 0);
    } else {
      ctx.rotate(opts.rotate * Math.PI / 180);
      const step = Math.max(60, Math.round(opts.gap * w / 1000));
      const diag = Math.sqrt(w * w + h * h);
      for (let y = -diag; y <= diag; y += step) {
        for (let x = -diag; x <= diag; x += step) {
          drawMark(x, y);
        }
      }
    }
    ctx.restore();
  }

  // ---------- 单点水印在预览图上的拖拽定位 ----------
  function getCanvasDisplayRect() {
    const rect = preview.getBoundingClientRect();
    const box = previewBox.getBoundingClientRect();
    return { left: rect.left - box.left, top: rect.top - box.top, width: rect.width, height: rect.height };
  }

  function updatePositioner() {
    if (state.opts.layout !== 'single' || !firstSelectedImage()) {
      positioner.classList.remove('is-active');
      return;
    }
    const opts = state.opts;
    const r = getCanvasDisplayRect();
    const left = r.left + r.width * (opts.posX / 100);
    const top = r.top + r.height * (opts.posY / 100);
    positioner.style.left = left + 'px';
    positioner.style.top = top + 'px';
    positioner.style.color = opts.color;
    visual.style.transform = `rotate(${opts.rotate}deg)`;
    visual.style.opacity = String(Math.max(0.25, opts.opacity + 0.15));

    // 让虚线框大小 ≈ 真实水印在当前显示尺寸下的尺寸，不再重复渲染文字/Logo
    const fontPx = Math.max(8, Math.round(opts.size * r.width / 1000));
    let vw = 80, vh = 48;
    if (opts.logoOn && opts.logo) {
      const lw = fontPx * 4.2;
      const lh = lw * (opts.logoH / opts.logoW || 1);
      const textH = opts.text ? Math.round(fontPx * 0.7 * 1.6) : 0;
      vw = Math.max(40, Math.round(lw + 16));
      vh = Math.max(28, Math.round(lh + textH + 12));
    } else if (opts.text) {
      const len = String(opts.text).length;
      vw = Math.max(40, Math.round(fontPx * len * 0.62 + 16));
      vh = Math.max(28, Math.round(fontPx * 1.55));
    }
    visual.style.width = vw + 'px';
    visual.style.height = vh + 'px';

    content.innerHTML = '';
    positioner.classList.add('is-active');
  }

  function syncControls() {
    const o = state.opts;
    $('#wm-size').value = o.size; $('#wm-size-val').textContent = o.size;
    $('#wm-rotate').value = o.rotate; $('#wm-rotate-val').textContent = o.rotate + '°';
  }

  let dragMode = null; // 'move' | 'rotate' | 'scaleRotate'
  let rotStartAngle = 0;   // 拖拽起始时鼠标相对中心的角度
  let rotStartRotate = 0;  // 拖拽起始时水印的旋转角度
  let scaleStartDist = 0;  // 拖拽起始时鼠标到中心的距离
  let scaleStartSize = 0;  // 拖拽起始时水印的字号

  function centerInClient() {
    const o = state.opts;
    const r = getCanvasDisplayRect();
    const box = previewBox.getBoundingClientRect();
    return {
      x: box.left + r.left + r.width * (o.posX / 100),
      y: box.top + r.top + r.height * (o.posY / 100),
      r,
    };
  }

  function startDrag(mode, e) {
    if (state.opts.layout !== 'single' || !firstSelectedImage()) return;
    e.preventDefault();
    e.stopPropagation();
    dragMode = mode;
    positioner.classList.add('is-dragging');
    // 旋转类拖拽：记录起始角度，做「相对旋转」避免一抓就跳
    if (mode === 'rotate' || mode === 'scaleRotate') {
      const c = centerInClient();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      rotStartAngle = Math.atan2(clientY - c.y, clientX - c.x) * 180 / Math.PI;
      rotStartRotate = state.opts.rotate;
    }
    // 缩放类拖拽：记录起始距离与字号，做「相对缩放」避免一抓就变大
    if (mode === 'scale' || mode === 'scaleRotate') {
      const c = centerInClient();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      scaleStartDist = Math.max(1, Math.hypot(clientX - c.x, clientY - c.y));
      scaleStartSize = state.opts.size;
    }
  }

  function moveFromEvent(e) {
    const r = getCanvasDisplayRect();
    const box = previewBox.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    let x = clientX - (box.left + r.left);
    let y = clientY - (box.top + r.top);
    x = Math.max(0, Math.min(r.width, x));
    y = Math.max(0, Math.min(r.height, y));
    state.opts.posX = (x / r.width) * 100;
    state.opts.posY = (y / r.height) * 100;
    updatePositioner();
  }

  function rotateFromEvent(e) {
    const c = centerInClient();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const a = Math.atan2(clientY - c.y, clientX - c.x) * 180 / Math.PI;
    let delta = a - rotStartAngle;
    state.opts.rotate = Math.round(rotStartRotate + delta);
    updatePositioner();
    syncControls();
  }

  function scaleFromEvent(e) {
    const c = centerInClient();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const d = Math.hypot(clientX - c.x, clientY - c.y);
    // 显示宽度 r.width 对应原图宽 w；字号 size 相对 1000px 宽，显示像素高 ≈ size*r.width/1000
    let size = d * 1000 / c.r.width * 0.9;
    state.opts.size = Math.max(12, Math.min(220, Math.round(size)));
    updatePositioner();
    syncControls();
  }

  function scaleRotateFromEvent(e) {
    const c = centerInClient();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const d = Math.hypot(clientX - c.x, clientY - c.y);
    // 相对缩放：size = 起始字号 × (当前距离 / 起始距离)，抓取瞬间比值=1 不跳变
    let size = scaleStartSize * (d / scaleStartDist);
    state.opts.size = Math.max(12, Math.min(220, Math.round(size)));
    // 相对旋转：从抓取瞬间的角度起算，避免一抓就跳到 90°
    const a = Math.atan2(clientY - c.y, clientX - c.x) * 180 / Math.PI;
    let delta = a - rotStartAngle;
    state.opts.rotate = Math.round(rotStartRotate + delta);
    updatePositioner();
    syncControls();
  }

  function onMove(e) {
    if (!dragMode) return;
    e.preventDefault();
    if (dragMode === 'move') moveFromEvent(e);
    else if (dragMode === 'rotate') rotateFromEvent(e);
    else if (dragMode === 'scale') scaleFromEvent(e);
    else if (dragMode === 'scaleRotate') scaleRotateFromEvent(e);
  }
  function onEnd() {
    if (!dragMode) return;
    dragMode = null;
    positioner.classList.remove('is-dragging');
    redrawPreview();
  }

  positioner.addEventListener('mousedown', (e) => { if (e.target === rotHandle || e.target === scaleHandle) return; startDrag('move', e); });
  rotHandle.addEventListener('mousedown', (e) => startDrag('rotate', e));
  scaleHandle.addEventListener('mousedown', (e) => startDrag('scaleRotate', e));
  positioner.addEventListener('touchstart', (e) => { if (e.target === rotHandle || e.target === scaleHandle) return; startDrag('move', e); }, { passive: false });
  rotHandle.addEventListener('touchstart', (e) => startDrag('rotate', e), { passive: false });
  scaleHandle.addEventListener('touchstart', (e) => startDrag('scaleRotate', e), { passive: false });

  previewBox.addEventListener('mousedown', (e) => {
    if (e.target.closest('.wm-positioner')) return;
    if (state.opts.layout !== 'single' || !firstSelectedImage()) return;
    startDrag('move', e);
  });
  previewBox.addEventListener('touchstart', (e) => {
    if (e.target.closest('.wm-positioner')) return;
    if (state.opts.layout !== 'single' || !firstSelectedImage()) return;
    startDrag('move', e);
  }, { passive: false });

  // 滚轮缩放（单点模式下）
  previewBox.addEventListener('wheel', (e) => {
    if (state.opts.layout !== 'single' || !firstSelectedImage()) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 4 : -4;
    state.opts.size = Math.max(12, Math.min(220, state.opts.size + delta));
    updatePositioner();
    syncControls();
  }, { passive: false });

  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('mouseup', onEnd);
  window.addEventListener('touchend', onEnd);
  window.addEventListener('resize', () => { updatePositioner(); });

  // ---------- 导出 ZIP ----------
  exportBtn.addEventListener('click', exportZip);
  exportDocxBtn.addEventListener('click', rebuildDocx);

  async function exportZip() {
    const sel = selectedRenderable();
    if (!sel.length) return;
    exportBtn.disabled = true;
    const oldHtml = exportBtn.innerHTML;
    exportBtn.innerHTML = '正在生成…';
    try {
      const opts = state.opts;
      const files = [];
      for (const im of sel) {
        const img = await loadImage(im.data_uri);
        if (!img) continue;
        const canvas = document.createElement('canvas');
        drawWatermark(canvas, img, opts);
        const type = im.mime === 'image/jpeg' ? 'image/jpeg' : 'image/png';
        const blob = await canvasToBlob(canvas, type);
        const buf = new Uint8Array(await blob.arrayBuffer());
        const ext = im.mime === 'image/jpeg' ? 'jpg' : 'png';
        const base = im.name.replace(/\.[^.]+$/, '');
        files.push({ name: `watermarked_${String(im.index + 1).padStart(2, '0')}_${base}.${ext}`, data: buf });
      }
      if (!files.length) { setStatus('没有可导出的图片', true); return; }
      const zip = buildZip(files);
      const ts = new Date().toISOString().slice(0, 10);
      downloadBlob(zip, `word_images_watermarked_${ts}.zip`);
      setStatus(`已导出 ${files.length} 张图片`);
    } catch (e) {
      setStatus('导出失败：' + e.message, true);
    } finally {
      exportBtn.disabled = false;
      exportBtn.innerHTML = oldHtml;
      updateCounts();
    }
  }

  // ---------- 导出新 Word ----------
  async function rebuildDocx() {
    const sel = selectedRenderable();
    if (!sel.length || !state.originalFile) return;
    exportDocxBtn.disabled = true;
    const oldHtml = exportDocxBtn.innerHTML;
    exportDocxBtn.innerHTML = '正在生成…';
    try {
      const opts = state.opts;
      const replacements = {};
      for (const im of sel) {
        const img = await loadImage(im.data_uri);
        if (!img) continue;
        const canvas = document.createElement('canvas');
        drawWatermark(canvas, img, opts);
        // 输出格式尽量与原图一致，jpeg 保持 jpeg，其余统一 png
        const outType = im.mime === 'image/jpeg' ? 'image/jpeg' : 'image/png';
        const dataUri = canvas.toDataURL(outType, 0.92);
        replacements[im.name] = dataUri;
      }
      if (!Object.keys(replacements).length) { setStatus('没有可替换的图片', true); return; }

      const fd = new FormData();
      fd.append('docx', state.originalFile);
      fd.append('replacements', JSON.stringify(replacements));

      const r = await fetch(BASE + '/api/rebuild', { method: 'POST', body: fd });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setStatus(j.error || '生成 Word 失败', true);
        return;
      }
      const blob = await r.blob();
      const ts = new Date().toISOString().slice(0, 10);
      const base = state.originalFile.name.replace(/\.[^.]+$/, '');
      downloadBlob(blob, `${base}_watermarked_${ts}.docx`);
      setStatus(`已导出新 Word 文档`);
    } catch (e) {
      setStatus('导出 Word 失败：' + e.message, true);
    } finally {
      exportDocxBtn.disabled = false;
      exportDocxBtn.innerHTML = oldHtml;
    }
  }

  // ---------- 工具函数 ----------
  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  function canvasToBlob(canvas, type) {
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, 0.92));
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
  }
  function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
  function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }

  /* ====== 纯 JS ZIP 打包（store 方式，零依赖） ====== */
  function crc32(buf) {
    if (!crc32.table) {
      crc32.table = (() => {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
          let c = n;
          for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
          t[n] = c >>> 0;
        }
        return t;
      })();
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crc32.table[(crc ^ buf[i]) & 0xFF];
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function buildZip(files) {
    const enc = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    const now = new Date();
    const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
    const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;

    for (const f of files) {
      const nameBytes = enc.encode(f.name);
      const data = f.data;
      const crc = crc32(data);
      const size = data.length;

      const local = new Uint8Array(30 + nameBytes.length);
      const dv = new DataView(local.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 0, true);
      dv.setUint16(8, 0, true);
      dv.setUint16(10, dosTime, true);
      dv.setUint16(12, dosDate, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, size, true);
      dv.setUint32(22, size, true);
      dv.setUint16(26, nameBytes.length, true);
      dv.setUint16(28, 0, true);
      local.set(nameBytes, 30);

      chunks.push(local, data);

      const centralRec = new Uint8Array(46 + nameBytes.length);
      const cdv = new DataView(centralRec.buffer);
      cdv.setUint32(0, 0x02014b50, true);
      cdv.setUint16(4, 20, true);
      cdv.setUint16(6, 20, true);
      cdv.setUint16(8, 0, true);
      cdv.setUint16(10, 0, true);
      cdv.setUint16(12, dosTime, true);
      cdv.setUint16(14, dosDate, true);
      cdv.setUint32(16, crc, true);
      cdv.setUint32(20, size, true);
      cdv.setUint32(24, size, true);
      cdv.setUint16(28, nameBytes.length, true);
      cdv.setUint16(30, 0, true);
      cdv.setUint16(32, 0, true);
      cdv.setUint16(34, 0, true);
      cdv.setUint16(36, 0, true);
      cdv.setUint32(38, 0, true);
      cdv.setUint32(42, offset, true);
      centralRec.set(nameBytes, 46);
      central.push(centralRec);

      offset += local.length + data.length;
    }

    const centralSize = central.reduce((s, c) => s + c.length, 0);
    const centralOffset = offset;

    const end = new Uint8Array(22);
    const edv = new DataView(end.buffer);
    edv.setUint32(0, 0x06054b50, true);
    edv.setUint16(4, 0, true);
    edv.setUint16(6, 0, true);
    edv.setUint16(8, files.length, true);
    edv.setUint16(10, files.length, true);
    edv.setUint32(12, centralSize, true);
    edv.setUint32(16, centralOffset, true);
    edv.setUint16(20, 0, true);

    chunks.push(...central, end);
    return new Blob(chunks, { type: 'application/zip' });
  }
})();
