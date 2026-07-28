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
    cropToAlphaBbox: () => cropToAlphaBbox,
    decodeMaskImage: () => decodeMaskImage,
    maskToBase64Png: () => maskToBase64Png,
    maskToTransparentPng: () => maskToTransparentPng
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
  var MASK_COLOR = [45, 140, 255];
  var MASK_ALPHA = 120;
  var MaskRenderer = class {
    maskCanvas;
    maskCtx;
    w = 0;
    h = 0;
    constructor() {
      this.maskCanvas = document.createElement("canvas");
      this.maskCtx = this.maskCanvas.getContext("2d");
    }
    /**
     * 写入 mask（Uint8Array，值 0/1，长度 = w*h）。
     * 这里把二值 mask 烘焙成一张「蓝色半透明」离屏画布，后续按视图缩放绘制即可，性能好且边缘清晰。
     */
    setMask(mask, w, h) {
      this.w = w;
      this.h = h;
      this.maskCanvas.width = w;
      this.maskCanvas.height = h;
      const img = this.maskCtx.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        const o = i * 4;
        if (mask[i]) {
          img.data[o] = MASK_COLOR[0];
          img.data[o + 1] = MASK_COLOR[1];
          img.data[o + 2] = MASK_COLOR[2];
          img.data[o + 3] = MASK_ALPHA;
        } else {
          img.data[o + 3] = 0;
        }
      }
      this.maskCtx.putImageData(img, 0, 0);
    }
    /** 把 mask 蒙版按当前视图（destX/Y/W/H 均为 CSS px）绘制到主画布 */
    render(ctx, destX, destY, destW, destH) {
      if (!this.w) return;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.maskCanvas, destX, destY, destW, destH);
      ctx.restore();
    }
    /** 绘制提示点：正向=青绿带「+」，负向=红带「−」 */
    drawPoints(ctx, toCanvas, points) {
      for (const p of points) {
        const { x, y } = toCanvas(p.x, p.y);
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fillStyle = p.label === 1 ? "rgba(16,185,129,0.95)" : "rgba(239,68,68,0.95)";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#fff";
        ctx.stroke();
        ctx.strokeStyle = "#fff";
        ctx.beginPath();
        if (p.label === 1) {
          ctx.moveTo(x - 3.5, y);
          ctx.lineTo(x + 3.5, y);
          ctx.moveTo(x, y - 3.5);
          ctx.lineTo(x, y + 3.5);
        } else {
          ctx.moveTo(x - 3.5, y);
          ctx.lineTo(x + 3.5, y);
        }
        ctx.stroke();
        ctx.restore();
      }
    }
    /** 掩码合并：'union' 取并集，'intersection' 取交集（用于把多次 SAM 输出融合） */
    static merge(a, b, mode = "union") {
      const out = new Uint8Array(a.length);
      for (let i = 0; i < a.length; i++) {
        out[i] = mode === "union" ? a[i] || b[i] ? 1 : 0 : a[i] && b[i] ? 1 : 0;
      }
      return out;
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
      img.data[i * 4 + 3] = mask[i] ? 255 : 0;
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
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

  // public/js/smart-click/samClient.ts
  var SamClient = class {
    constructor(endpoint) {
      this.endpoint = endpoint;
    }
    endpoint;
    /**
     * 调用 SAM 分割接口。
     * 请求示例（前端发出）：
     *   POST /api/sam-segment
     *   Content-Type: application/json
     *   {
     *     "image": "data:image/png;base64,iVBORw0KGgo...",   // 原图 base64
     *     "points": [                                        // 累积提示点
     *       { "x": 820, "y": 410, "label": 1 },              // 左键：保留该物体
     *       { "x": 300, "y": 200, "label": 0 }               // 右键：剔除该处背景
     *     ]
     *   }
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
  var SmartClickTool = class {
    mode = "crop";
    points = new PointStore();
    mask = null;
    maskW = 0;
    maskH = 0;
    renderer = new MaskRenderer();
    client;
    opts;
    pending = null;
    panning = false;
    panStart = null;
    spaceDown = false;
    bound = [];
    constructor(opts) {
      this.opts = opts;
      this.client = new SamClient(opts.endpoint);
      this.points.onChange(() => this.opts.onPointsChange?.(this.points.length));
    }
    getMode() {
      return this.mode;
    }
    getPoints() {
      return this.points.get();
    }
    getMask() {
      return this.mask;
    }
    hasMask() {
      return !!this.mask;
    }
    /** 切换工具模式；切离 'click' 时自动清除 SAM 点位与蒙版（需求 2.3） */
    setMode(m) {
      if (m === this.mode) return;
      this.mode = m;
      if (m !== "click") {
        this.points.clear();
        this.clearMask();
      }
      this.opts.canvas.style.cursor = m === "click" ? "crosshair" : "default";
      this.bindOrUnbind(m === "click");
      this.redraw();
    }
    // ---------- 事件绑定 ----------
    bindOrUnbind(on) {
      const c = this.opts.canvas;
      const map = [
        ["mousedown", this.onMouseDown],
        ["contextmenu", this.onContextMenu],
        ["wheel", this.onWheel],
        ["mousemove", this.onMouseMove],
        ["mouseup", this.onMouseUp]
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
      if (this.mode === "click") e.preventDefault();
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
      if (e.button !== 0 && e.button !== 2) return;
      const img = this.opts.transformer.screenToImage(e.clientX, e.clientY, rect);
      const label = e.button === 0 ? 1 : 0;
      this.points.add({ x: Math.round(img.x), y: Math.round(img.y), label });
      this.requestSegment();
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
      if (!this.panning || !this.panStart) return;
      this.opts.transformer.setView({
        offsetX: this.panStart.ox + (e.clientX - this.panStart.x),
        offsetY: this.panStart.oy + (e.clientY - this.panStart.y)
      });
      this.redraw();
    };
    onMouseUp = () => {
      this.panning = false;
      this.panStart = null;
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
    // ---------- 业务链路 ----------
    /** 防抖调用 SAM：每次打点（或撤销）后重新预测 */
    requestSegment() {
      const src = this.opts.getSource();
      if (!src || this.points.length === 0) return;
      if (this.pending) clearTimeout(this.pending);
      this.pending = window.setTimeout(async () => {
        this.opts.onStatus?.("SAM \u6B63\u5728\u5206\u5272\u2026", "info");
        try {
          const imageB64 = this.opts.getImageBase64 ? await this.opts.getImageBase64() : src.src;
          const req = {
            image: imageB64,
            points: this.points.get(),
            multimask: false
          };
          const res = await this.client.segment(req);
          this.mask = await decodeMaskImage(res.mask_image, res.width, res.height);
          this.maskW = res.width;
          this.maskH = res.height;
          this.renderer.setMask(this.mask, this.maskW, this.maskH);
          this.redraw();
          this.opts.onStatus?.("\u5DF2\u751F\u6210\u8499\u7248\uFF0C\u53EF\u300C\u5F00\u59CB\u62A0\u56FE\u300D\u6216\u7EE7\u7EED\u6253\u70B9\u4F18\u5316", "info");
        } catch (err) {
          this.opts.onStatus?.("SAM \u5206\u5272\u5931\u8D25\uFF1A" + (err?.message || err), "error");
        }
      }, 120);
    }
    /** 撤销上一个点（需求 1.6） */
    undo() {
      this.points.undo();
      if (this.points.length) this.requestSegment();
      else this.clearMask();
    }
    /** 清空所有点（需求 1.6） */
    clearAll() {
      this.points.clear();
      this.clearMask();
    }
    clearMask() {
      this.mask = null;
      this.maskW = 0;
      this.maskH = 0;
      this.renderer.setMask(new Uint8Array(0), 0, 0);
      this.redraw();
    }
    /** 重绘：原图 + 蒙版 + 提示点（在 'click' 模式接管渲染） */
    redraw() {
      const src = this.opts.getSource();
      const ctx = this.opts.ctx;
      const v = this.opts.transformer.getView();
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.opts.canvas.width, this.opts.canvas.height);
      ctx.restore();
      if (src) {
        ctx.drawImage(src, v.offsetX, v.offsetY, src.naturalWidth * v.scale, src.naturalHeight * v.scale);
      }
      if (this.mask) {
        this.renderer.render(ctx, v.offsetX, v.offsetY, this.maskW * v.scale, this.maskH * v.scale);
      }
      if (this.mode === "click") {
        this.renderer.drawPoints(
          ctx,
          (ix, iy) => this.opts.transformer.imageToCanvas(ix, iy),
          this.points.get()
        );
      }
    }
    // ---------- 两种输出模式（需求 2.1）----------
    /** 模式1：mask 直接作为 Alpha 通道 → 透明 PNG → 右侧预览 */
    async applyAsAlpha() {
      const src = this.opts.getSource();
      if (!src || !this.mask) return null;
      const png = await maskToTransparentPng(src, this.mask, this.maskW, this.maskH);
      const cropped = await cropToAlphaBbox(png, 4);
      this.opts.onPreview(cropped);
      return cropped;
    }
    /** 模式2：mask 融合进 u2net 管线（上传 mask 二值 PNG 给后端融合优化） */
    async fuseWithU2net(uploadFile, endpoint, model = "u2net") {
      const src = this.opts.getSource();
      if (!src || !this.mask) return null;
      const maskPng = maskToBase64Png(this.mask, this.maskW, this.maskH);
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
