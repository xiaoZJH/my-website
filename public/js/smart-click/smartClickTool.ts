// smartClickTool.ts — 交互工具类（编排器）
// 负责：WPS 式「自动识别主体 + 点击修正」智能点选。
//   - 进入模式后自动调用现有 u2net 生成初始蒙版；
//   - 点击蒙版区域 = 「去除该区域」（负向点 / flood fill）；
//   - 点击背景区域 = 「保留该区域」（正向点 / 局部膨胀）；
//   - 后端装有 MobileSAM 时，点击会 refine；未装时走前端快速修正；
//   - 切回框选模式自动清空。
import type { PromptPoint, SamResponse } from './types';
import { CoordinateTransformer } from './coordinate';
import { PointStore } from './pointStore';
import { MaskRenderer } from './maskRenderer';
import { SamClient, decodeMaskImage } from './samClient';
import {
  maskToTransparentPng,
  cropToAlphaBbox,
  maskToBase64Png,
  decodeAlphaPng,
  floodFillRemove,
  dilateAt,
} from './matting';

export type ToolMode = 'crop' | 'click';

export interface SmartClickOptions {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** 取当前原图（HTMLImageElement），无图时返回 null */
  getSource: () => HTMLImageElement | null;
  /** 共享的坐标变换器（与 crop 模式共用，保证缩放/平移一致） */
  transformer: CoordinateTransformer;
  /** 后端 SAM 接口地址 */
  endpoint: string;
  /** 现有 u2net 接口地址，用于自动生成初始蒙版 */
  removeBgEndpoint: string;
  /** 结果输出到右侧预览面板（透传给现有 rbAfter / rbPreview 逻辑） */
  onPreview: (pngUrl: string) => void;
  /** 状态提示（透传现有 setStatus） */
  onStatus?: (msg: string, type?: 'info' | 'error') => void;
  /** 点位数量变化（用于刷新「清空/撤销」按钮可用态） */
  onPointsChange?: (n: number) => void;
  /** 提供原图 base64（优先用这个，避免重复编码 blob URL） */
  getImageBase64?: () => string | Promise<string>;
  /** 提供原始 File，用于模式2融合 u2net */
  getUploadFile?: () => File | null;
}

export class SmartClickTool {
  private mode: ToolMode = 'crop';
  private points = new PointStore();
  private mask: Uint8Array | null = null;
  private maskW = 0;
  private maskH = 0;
  private renderer = new MaskRenderer();
  private client: SamClient;
  private opts: SmartClickOptions;
  private pending: number | null = null;
  private panning = false;
  private panStart: { x: number; y: number; ox: number; oy: number } | null = null;
  private spaceDown = false;
  private bound: Array<[string, EventListener]> = [];
  private samAvailable: boolean | null = null; // 探测后端 SAM 是否可用
  private autoInited = false;

  constructor(opts: SmartClickOptions) {
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

  /** 切换工具模式；切离 'click' 时自动清除 SAM 点位与蒙版 */
  setMode(m: ToolMode) {
    if (m === this.mode) return;
    this.mode = m;
    if (m !== 'click') {
      this.points.clear();
      this.clearMask();
      this.autoInited = false;
    } else {
      // 进入点选模式时自动初始化（延迟到 setMode 调用栈结束后，确保 DOM/图片就绪）
      window.setTimeout(() => this.autoInitMask(), 0);
    }
    this.opts.canvas.style.cursor = m === 'click' ? 'crosshair' : 'default';
    this.bindOrUnbind(m === 'click');
    this.redraw();
  }

  // ---------- 事件绑定 ----------
  private bindOrUnbind(on: boolean) {
    const c = this.opts.canvas;
    const map: Array<[string, EventListener]> = [
      ['mousedown', this.onMouseDown as EventListener],
      ['contextmenu', this.onContextMenu as EventListener],
      ['wheel', this.onWheel as EventListener],
      ['mousemove', this.onMouseMove as EventListener],
      ['mouseup', this.onMouseUp as EventListener],
    ];
    if (on) {
      map.forEach(([ev, fn]) => {
        c.addEventListener(ev, fn);
        this.bound.push([ev, fn]);
      });
      window.addEventListener('keydown', this.onKeyDown as EventListener);
      window.addEventListener('keyup', this.onKeyUp as EventListener);
    } else {
      this.bound.forEach(([ev, fn]) => c.removeEventListener(ev, fn));
      this.bound = [];
      window.removeEventListener('keydown', this.onKeyDown as EventListener);
      window.removeEventListener('keyup', this.onKeyUp as EventListener);
    }
  }

  private onContextMenu = (e: Event) => {
    if (this.mode === 'click') e.preventDefault(); // 右键用于修正，禁用菜单
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.mode !== 'click') return;
    const src = this.opts.getSource();
    if (!src || !this.mask) return;
    const rect = this.opts.canvas.getBoundingClientRect();

    // 中键，或 空格+左键 = 平移画布
    if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
      const v = this.opts.transformer.getView();
      this.panning = true;
      this.panStart = { x: e.clientX, y: e.clientY, ox: v.offsetX, oy: v.offsetY };
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return; // 点选模式只响应左键修正（右键已被 contextmenu 拦截）

    const img = this.opts.transformer.screenToImage(e.clientX, e.clientY, rect);
    const x = Math.round(img.x), y = Math.round(img.y);
    if (x < 0 || x >= this.maskW || y < 0 || y >= this.maskH) return;

    const idx = y * this.maskW + x;
    const isInside = this.mask[idx] === 1;

    // WPS 式语义：点击蒙版内 = 去除该区域；点击蒙版外 = 保留该区域
    const label: 1 | 0 = isInside ? 0 : 1;
    this.points.add({ x, y, label });

    if (this.samAvailable === false) {
      // 已知 SAM 不可用：直接走前端快速修正
      this.localRefine(x, y, label);
    } else {
      // 尝试 SAM refine；如果失败则自动降级
      this.requestSegment(true);
    }
  };

  private onWheel = (e: WheelEvent) => {
    if (this.mode !== 'click') return;
    e.preventDefault();
    const rect = this.opts.canvas.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.12 : 0.89; // 上滚放大，下滚缩小
    this.opts.transformer.zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
    this.redraw();
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.panning || !this.panStart) return;
    this.opts.transformer.setView({
      offsetX: this.panStart.ox + (e.clientX - this.panStart.x),
      offsetY: this.panStart.oy + (e.clientY - this.panStart.y),
    });
    this.redraw();
  };
  private onMouseUp = () => {
    this.panning = false;
    this.panStart = null;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.mode !== 'click') return;
    if (e.code === 'Space') this.spaceDown = true;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      this.undo();
      e.preventDefault();
    }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') this.spaceDown = false;
  };

  // ---------- 自动初始化蒙版 ----------
  /** 用现有 u2net 全图推理生成初始选区；SAM 模型未装时也能用。 */
  async autoInitMask() {
    if (this.autoInited) return;
    const src = this.opts.getSource();
    const file = this.opts.getUploadFile?.();
    if (!src || !file) {
      this.opts.onStatus?.('请先上传图片', 'error');
      return;
    }
    this.autoInited = true;
    this.opts.onStatus?.('正在自动识别主体…', 'info');
    try {
      const form = new FormData();
      form.append('image', file);
      form.append('model', 'u2netp');
      const r = await fetch(this.opts.removeBgEndpoint, { method: 'POST', body: form });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || '自动识别失败');
      const mask = await decodeAlphaPng(j.result_url);
      this.setMask(mask, src.naturalWidth, src.naturalHeight);
      // 探测 SAM 是否可用（只探测一次）
      this.probeSam();
      this.opts.onStatus?.(
        '已自动识别主体：红色蒙版=当前选中，点击红色区域可去除，点击背景可补回。',
        'info'
      );
    } catch (err: any) {
      this.opts.onStatus?.('自动识别失败：' + (err?.message || err), 'error');
      this.autoInited = false;
    }
  }

  private setMask(mask: Uint8Array, w: number, h: number) {
    this.mask = mask;
    this.maskW = w;
    this.maskH = h;
    this.renderer.setMask(this.mask, this.maskW, this.maskH);
    this.redraw();
  }

  private async probeSam() {
    try {
      const r = await fetch(this.opts.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      // 只要路由存在，即便报参数错误也说明 SAM 服务已挂载
      this.samAvailable = r.status !== 404;
      if (!this.samAvailable) {
        this.opts.onStatus?.('检测到 SAM 模型未部署，已切换为前端快速修正模式。', 'info');
      }
    } catch {
      this.samAvailable = false;
      this.opts.onStatus?.('SAM 服务未就绪，已切换为前端快速修正模式。', 'info');
    }
  }

  // ---------- 业务链路 ----------
  /** 防抖调用 SAM：每次打点（或撤销）后重新预测 */
  private requestSegment(allowLocalFallback = false) {
    const src = this.opts.getSource();
    if (!src || this.points.length === 0 || !this.mask) return;
    if (this.pending) clearTimeout(this.pending);
    this.pending = window.setTimeout(async () => {
      this.opts.onStatus?.('正在精确修正…', 'info');
      try {
        const imageB64 = this.opts.getImageBase64
          ? await this.opts.getImageBase64()
          : (src as HTMLImageElement).src;
        const req: import('./types').SamRequest = {
          image: imageB64,
          points: this.points.get(),
          multimask: false,
        };
        const res: SamResponse = await this.client.segment(req);
        this.samAvailable = true;
        this.setMask(await decodeMaskImage(res.mask_image!, res.width, res.height), res.width, res.height);
        this.opts.onStatus?.('修正完成，可继续点击或「开始抠图」。', 'info');
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (msg.includes('404') || msg.includes('NetworkError')) {
          this.samAvailable = false;
          if (allowLocalFallback && this.points.length) {
            const last = this.points.get()[this.points.length - 1];
            this.localRefine(last.x, last.y, last.label);
            return;
          }
        }
        this.opts.onStatus?.('精确修正失败：' + msg, 'error');
      }
    }, 120);
  }

  /** SAM 不可用时，用前端形态学做快速修正 */
  private localRefine(x: number, y: number, label: 1 | 0) {
    if (!this.mask) return;
    let next: Uint8Array;
    if (label === 0) {
      // 去除：flood fill 去掉点击所在连通块
      next = floodFillRemove(this.mask, this.maskW, this.maskH, x, y);
      this.opts.onStatus?.('已去除该区域（SAM 未部署时使用前端快速修正）。', 'info');
    } else {
      // 保留：以点击点为中心膨胀
      next = dilateAt(this.mask, this.maskW, this.maskH, x, y, 60);
      this.opts.onStatus?.('已补回该区域（SAM 未部署时使用前端快速修正）。', 'info');
    }
    this.setMask(next, this.maskW, this.maskH);
  }

  /** 撤销上一个点 */
  undo() {
    this.points.undo();
    // 撤销后如果还有点，重新 SAM/前端修正；否则恢复初始 mask
    if (this.points.length) {
      this.requestSegment(true);
    } else {
      // 重置为初始 mask：重新调用 u2net
      this.autoInited = false;
      this.autoInitMask();
    }
  }

  /** 清空所有点 */
  clearAll() {
    this.points.clear();
    this.autoInited = false;
    this.autoInitMask();
  }

  private clearMask() {
    this.mask = null;
    this.maskW = 0;
    this.maskH = 0;
    this.renderer.setMask(new Uint8Array(0), 0, 0);
    this.redraw();
  }

  /** 重绘：原图 + 蒙版 + 提示点 */
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
    if (this.mode === 'click') {
      this.renderer.drawPoints(
        ctx,
        (ix, iy) => this.opts.transformer.imageToCanvas(ix, iy),
        this.points.get()
      );
    }
  }

  // ---------- 两种输出模式 ----------

  /** 模式1：mask 直接作为 Alpha 通道 → 透明 PNG → 右侧预览 */
  async applyAsAlpha(): Promise<string | null> {
    const src = this.opts.getSource();
    if (!src || !this.mask) return null;
    const png = await maskToTransparentPng(src, this.mask, this.maskW, this.maskH);
    const cropped = await cropToAlphaBbox(png, 4);
    this.opts.onPreview(cropped);
    return cropped;
  }

  /** 模式2：mask 融合进 u2net 管线 */
  async fuseWithU2net(uploadFile: File, endpoint: string, model = 'u2net'): Promise<string | null> {
    const src = this.opts.getSource();
    if (!src || !this.mask) return null;
    const maskPng = maskToBase64Png(this.mask, this.maskW, this.maskH);
    const form = new FormData();
    form.append('image', uploadFile);
    form.append('sam_mask', maskPng);
    form.append('model', model);
    const r = await fetch(endpoint, { method: 'POST', body: form });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || '融合失败');
    this.opts.onPreview(j.result_url);
    return j.result_url;
  }
}
