var SmartClick = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // public/js/smart-click/index.ts
  var index_exports = {};
  __export(index_exports, {
    CoordinateTransformer: () => CoordinateTransformer,
    MaskRenderer: () => MaskRenderer,
    PointStore: () => PointStore,
    SamClient: () => SamClient,
    SmartClickTool: () => SmartClickTool,
    binarize: () => binarize,
    cropToAlphaBbox: () => cropToAlphaBbox,
    decodeAlphaPng: () => decodeAlphaPng,
    decodeMaskImage: () => decodeMaskImage,
    decodeSoftAlphaPng: () => decodeSoftAlphaPng,
    decontaminateEdges: () => decontaminateEdges,
    dilateAt: () => dilateAt,
    erodeSoft: () => erodeSoft,
    extractComponentAt: () => extractComponentAt,
    findLargestComponentCentroid: () => findLargestComponentCentroid,
    floodFillRemove: () => floodFillRemove,
    keepComponentAt: () => keepComponentAt,
    maskArea: () => maskArea,
    maskToBase64Png: () => maskToBase64Png,
    maskToTransparentPng: () => maskToTransparentPng,
    removeComponentAt: () => removeComponentAt,
    sampleForegroundPoints: () => sampleForegroundPoints,
    unionMasks: () => unionMasks
  });

  // public/js/smart-click/coordinate.ts
  var CoordinateTransformer = class {
    imgW = 1;
    imgH = 1;
    view = { scale: 1, offsetX: 0, offsetY: 0 };
    setImageSize(w, h) {
      this.imgW = w;
      this.imgH = h;
    }
    /** 设置/局部更新视图（缩放或平移后调用） */
    setView(v) {
      this.view = { ...this.view, ...v };
    }
    getView() {
      return { ...this.view };
    }
    /**
     * 计算把整张图「适配」进 (maxW, maxH) 的初始视图：等比缩放、居中、不超出 1。
     * 返回后请同步设置 canvas 的 CSS 尺寸与 transform。
     */
    fit(maxW, maxH) {
      const s = Math.min(maxW / this.imgW, maxH / this.imgH, 1);
      const dw = this.imgW * s;
      const dh = this.imgH * s;
      this.view = { scale: s, offsetX: (maxW - dw) / 2, offsetY: (maxH - dh) / 2 };
      return this.getView();
    }
    /**
     * 屏幕(client)坐标 → 原图像素坐标。
     * @param clientX 鼠标 event.clientX
     * @param clientY 鼠标 event.clientY
     * @param rect      canvas.getBoundingClientRect()
     */
    screenToImage(clientX, clientY, rect) {
      const cssX = clientX - rect.left;
      const cssY = clientY - rect.top;
      return {
        x: (cssX - this.view.offsetX) / this.view.scale,
        y: (cssY - this.view.offsetY) / this.view.scale
      };
    }
    /** 原图像素坐标 → 屏幕(client)坐标（用于把提示点画到别处或做命中测试） */
    imageToScreen(ix, iy, rect) {
      return {
        x: rect.left + ix * this.view.scale + this.view.offsetX,
        y: rect.top + iy * this.view.scale + this.view.offsetY
      };
    }
    /** 原图像素坐标 → 画布内 CSS 像素坐标（用于 ctx 直接绘制） */
    imageToCanvas(ix, iy) {
      return { x: ix * this.view.scale + this.view.offsetX, y: iy * this.view.scale + this.view.offsetY };
    }
    /**
     * 以画布内某个 CSS 点为锚点做缩放（滚轮缩放，保持鼠标下的图像点不动）。
     * @param anchorCssX 锚点 CSS X（= clientX - rect.left）
     * @param anchorCssY 锚点 CSS Y（= clientY - rect.top）
     */
    zoomAt(anchorCssX, anchorCssY, factor, min = 0.05, max = 16) {
      const newScale = Math.min(max, Math.max(min, this.view.scale * factor));
      const imgX = (anchorCssX - this.view.offsetX) / this.view.scale;
      const imgY = (anchorCssY - this.view.offsetY) / this.view.scale;
      this.view.offsetX = anchorCssX - imgX * newScale;
      this.view.offsetY = anchorCssY - imgY * newScale;
      this.view.scale = newScale;
    }
    /** 拖拽平移（中键/空格+左键） */
    pan(dxCss, dyCss) {
      this.view.offsetX += dxCss;
      this.view.offsetY += dyCss;
    }
  };

  // public/js/smart-click/pointStore.ts
  var PointStore = class {
    points = [];
    listeners = [];
    /** 新增一个提示点（自动触发 onChange） */
    add(p) {
      this.points.push(p);
      this.emit();
    }
    /** 撤销最后一个点 */
    undo() {
      if (this.points.length === 0) return;
      this.points.pop();
      this.emit();
    }
    /** 清空所有点 */
    clear() {
      if (this.points.length === 0) return;
      this.points = [];
      this.emit();
    }
    /** 当前所有点（副本，防止外部篡改） */
    get() {
      return [...this.points];
    }
    get length() {
      return this.points.length;
    }
    /** 订阅点集合变化（用于刷新按钮状态、重新请求 SAM） */
    onChange(cb) {
      this.listeners.push(cb);
    }
    emit() {
      const snap = this.get();
      this.listeners.forEach((l) => l(snap));
    }
  };

  // public/js/smart-click/maskRenderer.ts
  var GRAY = "rgba(150, 152, 160, 0.55)";
  var BLUE = "rgba(90, 156, 248, 0.45)";
  var BLUR = 2;
  var MaskRenderer = class {
    w = 0;
    h = 0;
    // 已确认选区（保留区）的硬蒙版 + 其羽化版
    committed = document.createElement("canvas");
    committedBlur = document.createElement("canvas");
    committedHas = false;
    committedOverlay = null;
    // 悬浮预览（淡蓝）蒙版 + 其合成叠加层
    hoverOverlay = null;
    /** 构建一张「白色=1 / 透明=0」的硬蒙版离屏画布 */
    buildStencil(mask, w, h) {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (mask && mask.length) {
        const img = ctx.createImageData(w, h);
        for (let i = 0; i < w * h; i++) {
          if (mask[i]) {
            const o = i * 4;
            img.data[o] = 255;
            img.data[o + 1] = 255;
            img.data[o + 2] = 255;
            img.data[o + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
      }
      return c;
    }
    /** 对蒙版做轻量高斯羽化，得到平滑边缘 */
    blur(src) {
      const c = document.createElement("canvas");
      c.width = src.width;
      c.height = src.height;
      const ctx = c.getContext("2d");
      ctx.filter = `blur(${BLUR}px)`;
      ctx.drawImage(src, 0, 0);
      return c;
    }
    /** 写入已确认选区（Uint8Array，0/1，长度 = w*h）。mask 为 null 表示清空。 */
    setCommitted(mask, w, h) {
      this.w = w;
      this.h = h;
      this.committed.width = w;
      this.committed.height = h;
      const cctx = this.committed.getContext("2d");
      cctx.clearRect(0, 0, w, h);
      let has = false;
      if (mask && mask.length) {
        const img = cctx.createImageData(w, h);
        for (let i = 0; i < w * h; i++) {
          if (mask[i]) {
            has = true;
            const o = i * 4;
            img.data[o] = 255;
            img.data[o + 1] = 255;
            img.data[o + 2] = 255;
            img.data[o + 3] = 255;
          }
        }
        cctx.putImageData(img, 0, 0);
      }
      this.committedHas = has;
      this.committedBlur = this.blur(this.committed);
      const ov = document.createElement("canvas");
      ov.width = w;
      ov.height = h;
      const octx = ov.getContext("2d");
      octx.fillStyle = GRAY;
      octx.fillRect(0, 0, w, h);
      octx.globalCompositeOperation = "destination-out";
      octx.filter = `blur(${BLUR}px)`;
      octx.drawImage(this.committed, 0, 0);
      this.committedOverlay = ov;
    }
    /** 写入悬浮预览蒙版（淡蓝，覆盖未选中物体）。mask 为 null / 空表示清除。 */
    setHover(mask, w, h) {
      if (!mask || !mask.length || !w || !h) {
        this.hoverOverlay = null;
        return;
      }
      this.w = w;
      this.h = h;
      const stencil = this.buildStencil(mask, w, h);
      const blurStencil = this.blur(stencil);
      const ov = document.createElement("canvas");
      ov.width = w;
      ov.height = h;
      const octx = ov.getContext("2d");
      octx.fillStyle = BLUE;
      octx.fillRect(0, 0, w, h);
      octx.globalCompositeOperation = "destination-in";
      octx.filter = `blur(${BLUR}px)`;
      octx.drawImage(blurStencil, 0, 0);
      octx.globalCompositeOperation = "destination-out";
      octx.filter = `blur(${BLUR}px)`;
      octx.drawImage(this.committedBlur, 0, 0);
      this.hoverOverlay = ov;
    }
    clearHover() {
      this.hoverOverlay = null;
    }
    /** 在主画布上绘制背景灰罩（仅在确有选区时绘制；无选区则不发灰，原图正常显示）。 */
    renderCommitted(ctx, dx, dy, dw, dh) {
      if (!this.committedHas || !this.committedOverlay) return;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.committedOverlay, dx, dy, dw, dh);
      ctx.restore();
    }
    /** 在主画布上绘制悬浮淡蓝预览（若有）。 */
    renderHover(ctx, dx, dy, dw, dh) {
      if (!this.hoverOverlay) return;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.hoverOverlay, dx, dy, dw, dh);
      ctx.restore();
    }
  };

  // public/js/smart-click/matting.ts
  async function maskToTransparentPng(source, mask, w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    ctx.drawImage(source, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < w * h; i++) {
      const v = mask[i];
      img.data[i * 4 + 3] = v === 1 ? 255 : v;
    }
    decontaminateEdges(img.data, w, h);
    ctx.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  }
  function decontaminateEdges(rgba, w, h, radius = 4, edgeLow = 15, edgeHigh = 240) {
    const len = w * h;
    const opaque = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      opaque[i] = rgba[i * 4 + 3] > edgeHigh ? 1 : 0;
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const a = rgba[i * 4 + 3];
        if (a <= edgeLow || a >= edgeHigh) continue;
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        const y0 = Math.max(0, y - radius);
        const y1 = Math.min(h - 1, y + radius);
        const x0 = Math.max(0, x - radius);
        const x1 = Math.min(w - 1, x + radius);
        for (let yy = y0; yy <= y1; yy++) {
          for (let xx = x0; xx <= x1; xx++) {
            const j = yy * w + xx;
            if (!opaque[j]) continue;
            const idx = j * 4;
            rSum += rgba[idx];
            gSum += rgba[idx + 1];
            bSum += rgba[idx + 2];
            count++;
          }
        }
        if (count > 0) {
          const idx = i * 4;
          rgba[idx] = Math.round(rSum / count);
          rgba[idx + 1] = Math.round(gSum / count);
          rgba[idx + 2] = Math.round(bSum / count);
        }
      }
    }
  }
  function cropToAlphaBbox(dataUrl, padding = 4) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, w, h).data;
        let minX = w;
        let minY = h;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (d[(y * w + x) * 4 + 3] > 5) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < 0) {
          resolve(dataUrl);
          return;
        }
        minX = Math.max(0, minX - padding);
        minY = Math.max(0, minY - padding);
        maxX = Math.min(w, maxX + padding);
        maxY = Math.min(h, maxY + padding);
        const cw = maxX - minX;
        const ch = maxY - minY;
        const out = document.createElement("canvas");
        out.width = cw;
        out.height = ch;
        out.getContext("2d").drawImage(c, minX, minY, cw, ch, 0, 0, cw, ch);
        resolve(out.toDataURL("image/png"));
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }
  function maskToBase64Png(mask, w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = mask[i] ? 255 : 0;
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  }
  function decodeAlphaPng(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth, h = img.naturalHeight;
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, w, h).data;
        const out = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) out[i] = d[i * 4 + 3] > 30 ? 1 : 0;
        resolve(out);
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }
  function decodeSoftAlphaPng(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth, h = img.naturalHeight;
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, w, h).data;
        const out = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) out[i] = d[i * 4 + 3];
        resolve(out);
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }
  function binarize(mask, threshold = 30) {
    const out = new Uint8Array(mask.length);
    for (let i = 0; i < mask.length; i++) out[i] = mask[i] > threshold ? 1 : 0;
    return out;
  }
  function erodeSoft(mask, w, h, radius = 1) {
    const out = new Uint8Array(mask.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let min = 255;
        const i = y * w + x;
        for (let dy = -radius; dy <= radius && min > 0; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -radius; dx <= radius && min > 0; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            const v = mask[ny * w + nx];
            if (v < min) min = v;
          }
        }
        out[i] = min;
      }
    }
    return out;
  }
  function findLargestComponentCentroid(mask, w, h) {
    const visited = new Uint8Array(w * h);
    let bestArea = 0;
    let bestCx = 0;
    let bestCy = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const start = y * w + x;
        if (!mask[start] || visited[start]) continue;
        let area = 0;
        let sumX = 0;
        let sumY = 0;
        const stack = [x, y];
        visited[start] = 1;
        while (stack.length) {
          const cy = stack.pop();
          const cx = stack.pop();
          const i = cy * w + cx;
          area++;
          sumX += cx;
          sumY += cy;
          if (cy > 0) {
            const ni = i - w;
            if (mask[ni] && !visited[ni]) {
              visited[ni] = 1;
              stack.push(cx, cy - 1);
            }
          }
          if (cy < h - 1) {
            const ni = i + w;
            if (mask[ni] && !visited[ni]) {
              visited[ni] = 1;
              stack.push(cx, cy + 1);
            }
          }
          if (cx > 0) {
            const ni = i - 1;
            if (mask[ni] && !visited[ni]) {
              visited[ni] = 1;
              stack.push(cx - 1, cy);
            }
          }
          if (cx < w - 1) {
            const ni = i + 1;
            if (mask[ni] && !visited[ni]) {
              visited[ni] = 1;
              stack.push(cx + 1, cy);
            }
          }
        }
        if (area > bestArea) {
          bestArea = area;
          bestCx = sumX / area;
          bestCy = sumY / area;
        }
      }
    }
    if (bestArea === 0) return null;
    let rx = Math.round(bestCx);
    let ry = Math.round(bestCy);
    rx = Math.max(0, Math.min(w - 1, rx));
    ry = Math.max(0, Math.min(h - 1, ry));
    if (mask[ry * w + rx]) return { x: rx, y: ry };
    const R = Math.min(Math.max(w, h), 64);
    for (let r = 1; r < R; r++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dy), Math.abs(-r)) !== r && Math.max(Math.abs(dy), Math.abs(r)) !== r) continue;
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dy), Math.abs(dx)) !== r) continue;
          const nx = rx + dx;
          const ny = ry + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[ny * w + nx]) return { x: nx, y: ny };
        }
      }
    }
    return { x: rx, y: ry };
  }
  function floodFillRemove(mask, w, h, sx, sy) {
    const out = mask.slice();
    const idx = sy * w + sx;
    if (idx < 0 || idx >= out.length || !out[idx]) return out;
    const stack = [[sx, sy]];
    while (stack.length) {
      const [x, y] = stack.pop();
      const i = y * w + x;
      if (x < 0 || x >= w || y < 0 || y >= h || !out[i]) continue;
      out[i] = 0;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return out;
  }
  function dilateAt(mask, w, h, sx, sy, radius = 40) {
    const out = mask.slice();
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      const y = sy + dy;
      if (y < 0 || y >= h) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const x = sx + dx;
        if (x < 0 || x >= w) continue;
        if (dx * dx + dy * dy <= r2) out[y * w + x] = 1;
      }
    }
    return out;
  }
  function maskArea(mask) {
    let s = 0;
    for (let i = 0; i < mask.length; i++) s += mask[i];
    return s;
  }
  function unionMasks(a, b) {
    const out = new Uint8Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = a[i] || b[i] ? 1 : 0;
    return out;
  }
  function sampleForegroundPoints(mask, w, h, maxPoints = 8) {
    const visited = new Uint8Array(w * h);
    let bestPixels = [];
    let bestBbox = { minX: w, minY: h, maxX: -1, maxY: -1 };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const start = y * w + x;
        if (!mask[start] || visited[start]) continue;
        const comp = [];
        let minX = x, minY = y, maxX = x, maxY = y;
        const stack = [x, y];
        visited[start] = 1;
        while (stack.length) {
          const cy = stack.pop();
          const cx = stack.pop();
          const i = cy * w + cx;
          comp.push(i);
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;
          if (cy > 0) {
            const ni = i - w;
            if (mask[ni] && !visited[ni]) {
              visited[ni] = 1;
              stack.push(cx, cy - 1);
            }
          }
          if (cy < h - 1) {
            const ni = i + w;
            if (mask[ni] && !visited[ni]) {
              visited[ni] = 1;
              stack.push(cx, cy + 1);
            }
          }
          if (cx > 0) {
            const ni = i - 1;
            if (mask[ni] && !visited[ni]) {
              visited[ni] = 1;
              stack.push(cx - 1, cy);
            }
          }
          if (cx < w - 1) {
            const ni = i + 1;
            if (mask[ni] && !visited[ni]) {
              visited[ni] = 1;
              stack.push(cx + 1, cy);
            }
          }
        }
        if (comp.length > bestPixels.length) {
          bestPixels = comp;
          bestBbox = { minX, minY, maxX, maxY };
        }
      }
    }
    if (bestPixels.length === 0) return [];
    const K = Math.max(2, Math.ceil(Math.sqrt(maxPoints)));
    const pts = [];
    const seen = /* @__PURE__ */ new Set();
    for (let gy = 0; gy < K; gy++) {
      for (let gx = 0; gx < K; gx++) {
        const fx = Math.round(bestBbox.minX + (gx + 0.5) * (bestBbox.maxX - bestBbox.minX) / K);
        const fy = Math.round(bestBbox.minY + (gy + 0.5) * (bestBbox.maxY - bestBbox.minY) / K);
        const p = snapToForeground(mask, w, h, fx, fy);
        if (p && !seen.has(p.y * w + p.x)) {
          seen.add(p.y * w + p.x);
          pts.push({ x: p.x, y: p.y, label: 1 });
        }
      }
    }
    if (pts.length > maxPoints) {
      const out = [];
      const step = pts.length / maxPoints;
      for (let i = 0; i < maxPoints; i++) out.push(pts[Math.floor(i * step)]);
      return out;
    }
    return pts;
  }
  function snapToForeground(mask, w, h, x, y) {
    x = Math.max(0, Math.min(w - 1, x));
    y = Math.max(0, Math.min(h - 1, y));
    if (mask[y * w + x]) return { x, y };
    const R = Math.min(Math.max(w, h), 128);
    for (let r = 1; r < R; r++) {
      for (let dy = -r; dy <= r; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dy), Math.abs(dx)) !== r) continue;
          const nx = x + dx;
          if (nx >= 0 && nx < w && mask[ny * w + nx]) return { x: nx, y: ny };
        }
      }
    }
    return null;
  }
  function extractComponentAt(mask, w, h, sx, sy) {
    const out = new Uint8Array(w * h);
    sx = Math.max(0, Math.min(w - 1, sx));
    sy = Math.max(0, Math.min(h - 1, sy));
    const idx = sy * w + sx;
    if (!mask[idx]) return out;
    const stack = [[sx, sy]];
    while (stack.length) {
      const [x, y] = stack.pop();
      const i = y * w + x;
      if (x < 0 || x >= w || y < 0 || y >= h || !mask[i] || out[i]) continue;
      out[i] = 1;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return out;
  }
  function removeComponentAt(mask, w, h, sx, sy) {
    const comp = extractComponentAt(mask, w, h, sx, sy);
    const out = mask.slice();
    for (let i = 0; i < out.length; i++) if (comp[i]) out[i] = 0;
    return out;
  }
  function keepComponentAt(mask, w, h, sx, sy) {
    return extractComponentAt(mask, w, h, sx, sy);
  }

  // public/js/smart-click/samClient.ts
  var SamClient = class {
    constructor(endpoint) {
      this.endpoint = endpoint;
      this.statusUrl = endpoint.replace(/\/sam-segment$/, "/sam-status");
    }
    endpoint;
    statusUrl;
    /** 探测 MobileSAM / 权重是否就绪 */
    async status() {
      const r = await fetch(this.statusUrl, { method: "GET" });
      if (!r.ok) throw new Error("SAM \u72B6\u6001\u63A5\u53E3\u8FD4\u56DE " + r.status);
      return await r.json();
    }
    /**
     * 调用 SAM 分割接口。
     * 请求示例（前端发出）：
     *   POST /api/sam-segment
     *   { "image": "data:image/png;base64,...", "points": [{ "x": 820, "y": 410, "label": 1 }], "sig": "<原图base64>" }
     * 后端返回：{ ok, width, height, mask_image: "data:image/png;base64,...", score }
     */
    async segment(req, signal) {
      const r = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        signal
      });
      if (!r.ok) throw new Error("SAM \u670D\u52A1\u8FD4\u56DE " + r.status);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "SAM \u5206\u5272\u5931\u8D25");
      return j;
    }
  };
  function decodeMaskImage(dataUrl, w, h) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const d = ctx.getImageData(0, 0, w, h).data;
        const out = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) out[i] = d[i * 4] > 127 ? 1 : 0;
        resolve(out);
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  // public/js/smart-click/smartClickTool.ts
  var HOVER_DEBOUNCE = 160;
  var SmartClickTool = class {
    mode = "crop";
    points = [];
    // 已确认的提示点集合（1=正向保留，0=反向剔除）
    committed = null;
    // 当前全局选区（二值 0/1），原图分辨率，用于渲染遮罩
    committedSoft = null;
    // 当前全局选区软 Alpha（0~255），用于生成透明 PNG（边缘羽化）
    baseMask = null;
    // u2net 初始完整主体二值 mask，用于左键「增选」时找回主体
    baseMaskSoft = null;
    // u2net 初始完整主体软 Alpha，用于增选时恢复自然边缘
    cw = 0;
    ch = 0;
    history = [];
    // 每次变更前的快照（点位 + 蒙版），用于撤销
    hover = null;
    // 悬浮预览蒙版
    renderer = new MaskRenderer();
    client;
    opts;
    bound = [];
    samAvailable = null;
    probing = false;
    panning = false;
    panStart = null;
    spaceDown = false;
    hoverTimer = null;
    constructor(opts) {
      this.opts = opts;
      this.client = new SamClient(opts.endpoint);
    }
    getMode() {
      return this.mode;
    }
    hasMask() {
      return !!this.committed && this.committed.some((v) => v !== 0);
    }
    /** 切换工具模式；切离 'click' 时自动清除选区与蒙版 */
    setMode(m) {
      if (m === this.mode) return;
      this.mode = m;
      this.opts.canvas.style.cursor = "default";
      if (m !== "click") {
        this.clearAll();
      } else {
        this.resetState();
        this.bindOrUnbind(true);
        this.probeSam();
      }
      this.redraw();
    }
    /** 新图片加载后重置（不清空事件绑定；由外部 setMode 控制） */
    resetForNewImage() {
      this.resetState();
      this.opts.onSelectionChange?.(false);
      this.redraw();
    }
    resetState() {
      this.points = [];
      this.committed = null;
      this.committedSoft = null;
      this.baseMask = null;
      this.baseMaskSoft = null;
      this.cw = 0;
      this.ch = 0;
      this.history = [];
      this.hover = null;
      this.renderer.setCommitted(null, 1, 1);
      this.renderer.clearHover();
      this.samAvailable = null;
    }
    // ---------- 事件绑定 ----------
    bindOrUnbind(on) {
      const c = this.opts.canvas;
      const map = [
        ["mousedown", this.onMouseDown],
        ["dblclick", this.onDoubleClick],
        ["contextmenu", this.onContextMenu],
        ["wheel", this.onWheel],
        ["mousemove", this.onMouseMove],
        ["mouseup", this.onMouseUp],
        ["mouseleave", this.onMouseLeave]
      ];
      if (on) {
        map.forEach(([ev, fn]) => {
          c.addEventListener(ev, fn);
          this.bound.push([ev, fn]);
        });
        window.addEventListener("keydown", this.onKeyDown);
        window.addEventListener("keyup", this.onKeyUp);
      } else {
        this.bound.forEach(([ev, fn]) => c.removeEventListener(ev, fn));
        this.bound = [];
        window.removeEventListener("keydown", this.onKeyDown);
        window.removeEventListener("keyup", this.onKeyUp);
      }
    }
    onContextMenu = (e) => {
      if (this.mode !== "click") return;
      e.preventDefault();
      const me = e;
      const src = this.opts.getSource();
      if (!src) return;
      const rect = this.opts.canvas.getBoundingClientRect();
      const p = this.opts.transformer.screenToImage(me.clientX, me.clientY, rect);
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      if (x < 0 || x >= src.naturalWidth || y < 0 || y >= src.naturalHeight) return;
      this.addPoint(x, y, 0);
    };
    onMouseDown = (e) => {
      if (this.mode !== "click") return;
      const src = this.opts.getSource();
      if (!src) return;
      const rect = this.opts.canvas.getBoundingClientRect();
      if (e.button === 1 || e.button === 0 && this.spaceDown) {
        const v = this.opts.transformer.getView();
        this.panning = true;
        this.panStart = { x: e.clientX, y: e.clientY, ox: v.offsetX, oy: v.offsetY };
        e.preventDefault();
        return;
      }
      if (e.button !== 0) return;
      if (e.detail > 1) return;
      const p = this.opts.transformer.screenToImage(e.clientX, e.clientY, rect);
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      if (x < 0 || x >= src.naturalWidth || y < 0 || y >= src.naturalHeight) return;
      if (e.ctrlKey || e.metaKey) {
        this.refineWithSam(x, y, 1);
        return;
      }
      this.addPoint(x, y, 1);
    };
    /** 双击 = SAM 精准边缘精修（救命稻草模式） */
    onDoubleClick = (e) => {
      if (this.mode !== "click") return;
      const src = this.opts.getSource();
      if (!src) return;
      const rect = this.opts.canvas.getBoundingClientRect();
      const p = this.opts.transformer.screenToImage(e.clientX, e.clientY, rect);
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      if (x < 0 || x >= src.naturalWidth || y < 0 || y >= src.naturalHeight) return;
      this.refineWithSam(x, y, 1);
    };
    onWheel = (e) => {
      if (this.mode !== "click") return;
      e.preventDefault();
      const rect = this.opts.canvas.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      this.opts.transformer.zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
      this.redraw();
    };
    onMouseMove = (e) => {
      if (this.panning && this.panStart) {
        this.opts.transformer.setView({
          offsetX: this.panStart.ox + (e.clientX - this.panStart.x),
          offsetY: this.panStart.oy + (e.clientY - this.panStart.y)
        });
        this.redraw();
        return;
      }
      if (this.mode !== "click") return;
      if (this.hoverTimer) clearTimeout(this.hoverTimer);
      this.hoverTimer = window.setTimeout(() => this.doHover(e.clientX, e.clientY), HOVER_DEBOUNCE);
    };
    onMouseUp = () => {
      this.panning = false;
      this.panStart = null;
    };
    onMouseLeave = () => {
      this.renderer.clearHover();
      this.hover = null;
      this.redraw();
    };
    onKeyDown = (e) => {
      if (this.mode !== "click") return;
      if (e.code === "Space") this.spaceDown = true;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        this.undo();
        e.preventDefault();
      }
    };
    onKeyUp = (e) => {
      if (e.code === "Space") this.spaceDown = false;
    };
    // ---------- 悬浮预览（淡蓝） ----------
    /** 100% 前端完成：鼠标下的物体连通块高亮，不调用后端模型。 */
    doHover(clientX, clientY) {
      const src = this.opts.getSource();
      if (!src) return;
      const rect = this.opts.canvas.getBoundingClientRect();
      const p = this.opts.transformer.screenToImage(clientX, clientY, rect);
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      if (x < 0 || x >= src.naturalWidth || y < 0 || y >= src.naturalHeight) {
        this.renderer.clearHover();
        this.hover = null;
        this.redraw();
        return;
      }
      const sourceMask = this.baseMask || this.committed;
      if (!sourceMask) return;
      const comp = extractComponentAt(sourceMask, this.cw, this.ch, x, y);
      const has = comp.some((v) => v !== 0);
      if (!has) {
        this.renderer.clearHover();
        this.hover = null;
        this.redraw();
        return;
      }
      this.hover = comp;
      this.renderer.setHover(comp, this.cw, this.ch);
      this.redraw();
    }
    async getImageB64() {
      if (this.opts.getImageBase64) return await this.opts.getImageBase64();
      const s = this.opts.getSource();
      return s.src;
    }
    /**
     * 截取以 (cx, cy) 为中心的局部正方形切片，用于 MobileSAM 局部推理。
     * 返回 { dataUrl, localX, localY, x0, y0, size }，
     * 其中 (localX, localY) 是点击点在切片内的坐标，(x0, y0) 是切片左上角在原图的位置。
     */
    getCropAround(cx, cy) {
      const src = this.opts.getSource();
      const W = src.naturalWidth;
      const H = src.naturalHeight;
      const size = Math.max(W, H) > 1024 ? 512 : 256;
      let x0 = Math.round(cx - size / 2);
      let y0 = Math.round(cy - size / 2);
      if (x0 < 0) x0 = 0;
      if (y0 < 0) y0 = 0;
      if (x0 + size > W) x0 = Math.max(0, W - size);
      if (y0 + size > H) y0 = Math.max(0, H - size);
      const cropW = Math.min(size, W - x0);
      const cropH = Math.min(size, H - y0);
      const c = document.createElement("canvas");
      c.width = cropW;
      c.height = cropH;
      const ctx = c.getContext("2d");
      ctx.drawImage(src, x0, y0, cropW, cropH, 0, 0, cropW, cropH);
      return {
        dataUrl: c.toDataURL("image/png"),
        localX: cx - x0,
        localY: cy - y0,
        x0,
        y0,
        size,
        cropW,
        cropH
      };
    }
    // ---------- 选区提交（左键保留 / 右键剔除） ----------
    ensureDims() {
      const s = this.opts.getSource();
      if (s && (this.cw !== s.naturalWidth || this.ch !== s.naturalHeight)) {
        this.cw = s.naturalWidth;
        this.ch = s.naturalHeight;
      }
    }
    pushHistory() {
      this.history.push({
        points: this.points.map((p) => ({ ...p })),
        mask: this.committed ? this.committed.slice() : null,
        maskSoft: this.committedSoft ? this.committedSoft.slice() : null
      });
      if (this.history.length > 60) this.history.shift();
    }
    /**
     * 新增一个提示点做局部修正（复刻 WPS 智能点选）。
     * - 正向(1)=左键保留：把 baseMask 中点击点所在的前景连通块加回当前选区；
     * - 反向(0)=右键剔除：把当前选区中点击点所在的前景连通块移除。
     * 不再调用 SAM 做全局重分割，避免多点分散在狗/猫两个独立物体上时被切碎或丢失。
     * 未装 MobileSAM 时降级为本地膨胀/FloodFill 微调。
     */
    async addPoint(x, y, label) {
      this.ensureDims();
      if (this.samAvailable !== true) {
        this.pushHistory();
        this.applyRefine(x, y, label);
        return;
      }
      this.pushHistory();
      if (label === 1) {
        const sourceMask = this.baseMask || this.committed;
        if (!sourceMask) return;
        const comp = extractComponentAt(sourceMask, this.cw, this.ch, x, y);
        if (this.committed) {
          const merged = this.committed.slice();
          for (let i = 0; i < merged.length; i++) if (comp[i]) merged[i] = 1;
          this.committed = merged;
          if (this.baseMaskSoft && this.committedSoft) {
            const soft = this.committedSoft.slice();
            for (let i = 0; i < soft.length; i++) if (comp[i]) soft[i] = this.baseMaskSoft[i];
            this.committedSoft = soft;
          }
        } else {
          this.committed = comp;
          if (this.baseMaskSoft) {
            const soft = new Uint8Array(this.cw * this.ch);
            for (let i = 0; i < soft.length; i++) if (comp[i]) soft[i] = this.baseMaskSoft[i];
            this.committedSoft = soft;
          }
        }
      } else {
        if (!this.committed) return;
        this.committed = removeComponentAt(this.committed, this.cw, this.ch, x, y);
        if (this.committedSoft) {
          const soft = this.committedSoft.slice();
          for (let i = 0; i < soft.length; i++) if (!this.committed[i]) soft[i] = 0;
          this.committedSoft = soft;
        }
      }
      this.points.push({ x, y, label });
      this.renderer.setCommitted(this.committed, this.cw, this.ch);
      this.afterCommit();
    }
    /** 应用一份 mask 作为当前选区（已写入 this.committed），刷新渲染与选择态。 */
    applyCommitted(mask, showMsg = false) {
      this.committed = mask;
      if (mask) this.renderer.setCommitted(mask, this.cw, this.ch);
      else this.renderer.setCommitted(null, 1, 1);
      this.renderer.clearHover();
      this.hover = null;
      this.redraw();
      this.opts.onSelectionChange?.(this.hasMask());
      if (showMsg) {
        this.opts.onStatus?.("\u5DF2\u7528\u5168\u90E8\u63D0\u793A\u70B9\u91CD\u65B0\u63A8\u7406\u9009\u533A\uFF0C\u53EF\u7EE7\u7EED\u70B9\u51FB\u6216\u300C\u5F00\u59CB\u62A0\u56FE\u300D\u3002", "info");
      }
    }
    afterCommit() {
      this.applyCommitted(this.committed, true);
    }
    /**
     * SAM 边缘精修（救命稻草模式）：仅在双击或 Ctrl+点击时调用。
     * 关键优化：不再发送全图，而是截取 256x256/512x512 局部切片给 MobileSAM，
     * 推理更快、网络更小，然后把局部 mask 拼回全局选区。
     * 正常左/右键只走 Flood Fill 连通块，避免多主体被 SAM 切碎。
     */
    async refineWithSam(x, y, label) {
      this.ensureDims();
      if (this.samAvailable !== true) {
        this.opts.onStatus?.("MobileSAM \u672A\u5C31\u7EEA\uFF0C\u65E0\u6CD5\u505A\u8FB9\u7F18\u7CBE\u4FEE\u3002", "error");
        return;
      }
      this.pushHistory();
      try {
        const crop = this.getCropAround(x, y);
        this.opts.onStatus?.("\u6B63\u5728\u505A\u5C40\u90E8\u8FB9\u7F18\u7CBE\u4FEE\u2026", "info");
        const res = await this.client.segment({
          image: crop.dataUrl,
          points: [{ x: crop.localX, y: crop.localY, label }],
          sig: crop.dataUrl,
          multimask: true
        });
        const cropMask = await decodeMaskImage(res.mask_image, res.width, res.height);
        const globalMask = this.committed ? this.committed.slice() : new Uint8Array(this.cw * this.ch);
        const globalSoft = this.committedSoft ? this.committedSoft.slice() : new Uint8Array(this.cw * this.ch);
        for (let yy = 0; yy < crop.cropH; yy++) {
          const gy = crop.y0 + yy;
          if (gy < 0 || gy >= this.ch) continue;
          for (let xx = 0; xx < crop.cropW; xx++) {
            const gx = crop.x0 + xx;
            if (gx < 0 || gx >= this.cw) continue;
            const cropIdx = yy * crop.cropW + xx;
            const globalIdx = gy * this.cw + gx;
            if (cropMask[cropIdx]) {
              globalMask[globalIdx] = label === 1 ? 1 : 0;
              globalSoft[globalIdx] = label === 1 ? 255 : 0;
            }
          }
        }
        this.committed = globalMask;
        this.committedSoft = globalSoft;
        this.points.push({ x, y, label });
        this.renderer.setCommitted(this.committed, this.cw, this.ch);
        this.afterCommit();
        this.opts.onStatus?.("\u5C40\u90E8\u8FB9\u7F18\u7CBE\u4FEE\u5B8C\u6210\u3002", "info");
      } catch (err) {
        this.opts.onStatus?.("\u8FB9\u7F18\u7CBE\u4FEE\u5931\u8D25\uFF1A" + (err?.message || err), "error");
      }
    }
    /** 降级模式（未装 MobileSAM）的局部修正：label=1 补回 / label=0 去除 */
    applyRefine(x, y, label) {
      this.ensureDims();
      if (!this.committed) this.committed = new Uint8Array(this.cw * this.ch);
      if (!this.committedSoft) this.committedSoft = new Uint8Array(this.cw * this.ch);
      const next = label === 0 ? floodFillRemove(this.committed, this.cw, this.ch, x, y) : dilateAt(this.committed, this.cw, this.ch, x, y, 70);
      this.committed = next;
      const soft = this.committedSoft.slice();
      for (let i = 0; i < soft.length; i++) soft[i] = next[i] ? 255 : 0;
      this.committedSoft = soft;
      this.renderer.setCommitted(next, this.cw, this.ch);
      this.afterCommit();
    }
    /** 撤销上一步选区（恢复上次的点位集合 + 蒙版快照，无需重新推理） */
    undo() {
      if (!this.history.length) return;
      const snap = this.history.pop();
      this.points = snap.points.map((p) => ({ ...p }));
      this.committed = snap.mask ? snap.mask.slice() : null;
      this.committedSoft = snap.maskSoft ? snap.maskSoft.slice() : null;
      if (this.committed) this.renderer.setCommitted(this.committed, this.cw, this.ch);
      else this.renderer.setCommitted(null, 1, 1);
      this.renderer.clearHover();
      this.hover = null;
      this.redraw();
      this.opts.onSelectionChange?.(this.hasMask());
    }
    /** 清空全部选区（同时清空提示点集合） */
    clearAll() {
      this.history = [];
      this.points = [];
      this.committed = null;
      this.committedSoft = null;
      this.cw = 0;
      this.ch = 0;
      this.hover = null;
      this.renderer.setCommitted(null, 1, 1);
      this.renderer.clearHover();
      this.redraw();
      this.opts.onSelectionChange?.(false);
    }
    // ---------- 后端可用性探测 / 降级 ----------
    async probeSam() {
      if (this.probing) return;
      this.probing = true;
      try {
        const st = await this.client.status();
        this.samAvailable = st.available;
        if (st.available) {
          this.opts.onStatus?.("\u667A\u80FD\u70B9\u9009\u5DF2\u5C31\u7EEA\uFF1A\u5DF2\u81EA\u52A8\u9009\u4E2D\u4E3B\u4F53\uFF0C\u5DE6\u952E\u589E\u9009\u3001\u53F3\u952E\u51CF\u9009\uFF0C\u60AC\u6D6E\u53EF\u9884\u89C8\u3002", "info");
        } else {
          this.opts.onStatus?.("\u672A\u68C0\u6D4B\u5230 MobileSAM\uFF0C\u5DF2\u7528\u57FA\u7840\u6A21\u5F0F\u81EA\u52A8\u9009\u4E2D\u4E3B\u4F53\uFF08\u70B9\u51FB\u5FAE\u8C03\uFF09\u3002", "info");
        }
      } catch {
        this.samAvailable = false;
        this.opts.onStatus?.("SAM \u670D\u52A1\u672A\u5C31\u7EEA\uFF0C\u5DF2\u7528\u57FA\u7840\u6A21\u5F0F\u81EA\u52A8\u9009\u4E2D\u4E3B\u4F53\uFF08\u70B9\u51FB\u5FAE\u8C03\uFF09\u3002", "info");
      } finally {
        this.probing = false;
        this.autoInitSubject();
      }
    }
    /**
     * 进入智能点选时自动选中主体（复刻 WPS：进入工具即显示主体灰度蒙版）。
     * 流程：
     *   1) 用 u2net（轻量 u2netp）做整体主体检测，取原生软 Alpha；
     *   2) 做 1px 灰度腐蚀，轻微缩边，减少边缘白边/光晕；
     *   3) 以腐蚀后的软 mask 作为输出 Alpha，其二值化结果作为渲染遮罩；
     *   4) 同时保存未腐蚀的 baseMask / baseMaskSoft，用于左键「增选」和悬浮预览，
     *      保证薄毛发/胡须也能被点选加回。
     * no_crop=1 保证返回的 mask 与原图同分辨率。
     */
    async autoInitSubject() {
      const src = this.opts.getSource();
      const file = this.opts.getUploadFile?.();
      if (!src || !file) return;
      this.ensureDims();
      try {
        const preferredModel = typeof this.opts.removeBgModel === "function" ? this.opts.removeBgModel() : this.opts.removeBgModel || "bria-rmbg";
        const form = new FormData();
        form.append("image", file);
        form.append("model", preferredModel);
        form.append("no_crop", "1");
        let r = await fetch(this.opts.removeBgEndpoint, { method: "POST", body: form });
        let j = await r.json();
        if (!j.ok && preferredModel !== "u2netp") {
          this.opts.onStatus?.(`${preferredModel} \u672A\u5C31\u7EEA\uFF0C\u56DE\u9000\u5230 u2netp \u81EA\u52A8\u8BC6\u522B\u3002`, "info");
          const fallback = new FormData();
          fallback.append("image", file);
          fallback.append("model", "u2netp");
          fallback.append("no_crop", "1");
          r = await fetch(this.opts.removeBgEndpoint, { method: "POST", body: fallback });
          j = await r.json();
        }
        if (!j.ok) throw new Error(j.error || "\u81EA\u52A8\u8BC6\u522B\u5931\u8D25");
        const soft = await decodeSoftAlphaPng(j.result_url);
        this.cw = src.naturalWidth;
        this.ch = src.naturalHeight;
        const eroded = erodeSoft(soft, this.cw, this.ch, 1);
        const bin = binarize(eroded, 30);
        this.baseMaskSoft = soft;
        this.baseMask = binarize(soft, 30);
        this.committedSoft = eroded;
        this.committed = bin;
        this.renderer.setCommitted(bin, this.cw, this.ch);
        this.redraw();
        this.opts.onSelectionChange?.(this.hasMask());
        this.opts.onStatus?.("\u5DF2\u81EA\u52A8\u9009\u4E2D\u4E3B\u4F53\uFF0C\u53EF\u5DE6\u952E\u589E\u9009\u3001\u53F3\u952E\u51CF\u9009\uFF0C\u53CC\u51FB\u6216 Ctrl+\u70B9\u51FB\u505A\u8FB9\u7F18\u7CBE\u4FEE\u3002", "info");
      } catch (err) {
        this.opts.onStatus?.("\u81EA\u52A8\u9009\u4E2D\u4E3B\u4F53\u5931\u8D25\uFF1A" + (err?.message || err), "error");
      }
    }
    // ---------- 渲染（原图 + 背景灰罩 + 悬浮蓝） ----------
    redraw() {
      const src = this.opts.getSource();
      const ctx = this.opts.ctx;
      const v = this.opts.transformer.getView();
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.opts.canvas.width, this.opts.canvas.height);
      ctx.restore();
      const dw = src ? src.naturalWidth * v.scale : 0;
      const dh = src ? src.naturalHeight * v.scale : 0;
      if (src) {
        ctx.drawImage(src, v.offsetX, v.offsetY, dw, dh);
      }
      if (this.committed) {
        this.renderer.renderCommitted(ctx, v.offsetX, v.offsetY, dw, dh);
      }
      if (this.hover) {
        this.renderer.renderHover(ctx, v.offsetX, v.offsetY, dw, dh);
      }
    }
    // ---------- 两种输出模式 ----------
    /** 模式1：软 Alpha mask → 透明 PNG → 右侧预览（边缘羽化，减少白边/锯齿） */
    async applyAsAlpha() {
      const src = this.opts.getSource();
      if (!src || !this.committed) {
        console.log("[SmartClick.applyAsAlpha] skipped: no source or no committed mask");
        return null;
      }
      if (!this.cw || !this.ch) {
        console.warn("[SmartClick.applyAsAlpha] skipped: invalid dims", this.cw, this.ch);
        return null;
      }
      try {
        const alphaMask = this.committedSoft || this.committed;
        const expectedLen = this.cw * this.ch;
        console.log(
          "[SmartClick.applyAsAlpha] dims=%dx%d maskLen=%d expected=%d soft=%s",
          this.cw,
          this.ch,
          alphaMask.length,
          expectedLen,
          !!this.committedSoft
        );
        if (alphaMask.length !== expectedLen) {
          console.warn("[SmartClick.applyAsAlpha] mask length mismatch");
        }
        const png = await maskToTransparentPng(src, alphaMask, this.cw, this.ch);
        console.log(
          "[SmartClick.applyAsAlpha] transparent png len=%d prefix=%s",
          png.length,
          png.slice(0, 60)
        );
        let cropped = png;
        try {
          cropped = await cropToAlphaBbox(png, 4);
          console.log(
            "[SmartClick.applyAsAlpha] cropped png len=%d prefix=%s",
            cropped.length,
            cropped.slice(0, 60)
          );
        } catch (cropErr) {
          console.warn("[SmartClick.applyAsAlpha] cropToAlphaBbox failed, fallback to uncropped", cropErr);
        }
        if (!cropped || typeof cropped !== "string" || !cropped.startsWith("data:image/png;base64,")) {
          console.error("[SmartClick.applyAsAlpha] invalid pngUrl", cropped);
          this.opts.onStatus?.("\u751F\u6210\u7684\u9884\u89C8\u6570\u636E\u5F02\u5E38\uFF0C\u8BF7\u91CD\u8BD5", "error");
          return null;
        }
        this.opts.onPreview(cropped);
        return cropped;
      } catch (err) {
        console.error("[SmartClick.applyAsAlpha] failed", err);
        this.opts.onStatus?.("\u751F\u6210\u9884\u89C8\u5931\u8D25\uFF1A" + (err?.message || err), "error");
        return null;
      }
    }
    /** 模式2：mask 融合进 u2net 管线 */
    async fuseWithU2net(uploadFile, endpoint, model = "u2net") {
      const src = this.opts.getSource();
      if (!src || !this.committed) return null;
      const maskPng = maskToBase64Png(this.committed, this.cw, this.ch);
      const form = new FormData();
      form.append("image", uploadFile);
      form.append("sam_mask", maskPng);
      form.append("model", model);
      const r = await fetch(endpoint, { method: "POST", body: form });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "\u878D\u5408\u5931\u8D25");
      this.opts.onPreview(j.result_url);
      return j.result_url;
    }
  };
  return __toCommonJS(index_exports);
})();
