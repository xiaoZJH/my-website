// smartClickTool.ts — 交互工具类（编排器）
// 负责：左/右键打点、滚轮缩放、拖拽平移、撤销/清空、调用 SAM、渲染蒙版、输出预览。
// 与现有页面的关系：仅当工具处于 'click'（智能点选）模式时接管画布；切回 'crop' 时自动清空点位与蒙版。
import type { PromptPoint, SamResponse } from './types';
import { CoordinateTransformer } from './coordinate';
import { PointStore } from './pointStore';
import { MaskRenderer } from './maskRenderer';
import { SamClient, decodeMaskImage } from './samClient';
import { maskToTransparentPng, cropToAlphaBbox, maskToBase64Png } from './matting';

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
  /** 结果输出到右侧预览面板（透传给现有 rbAfter / rbPreview 逻辑） */
  onPreview: (pngUrl: string) => void;
  /** 状态提示（透传现有 setStatus） */
  onStatus?: (msg: string, type?: 'info' | 'error') => void;
  /** 点位数量变化（用于刷新「清空/撤销」按钮可用态） */
  onPointsChange?: (n: number) => void;
  /** 提供原图 base64（优先用这个，避免重复编码 blob URL） */
  getImageBase64?: () => string | Promise<string>;
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

  /** 切换工具模式；切离 'click' 时自动清除 SAM 点位与蒙版（需求 2.3） */
  setMode(m: ToolMode) {
    if (m === this.mode) return;
    this.mode = m;
    if (m !== 'click') {
      this.points.clear();
      this.clearMask();
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
    if (this.mode === 'click') e.preventDefault(); // 右键用于负向点，禁用菜单
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.mode !== 'click') return;
    const src = this.opts.getSource();
    if (!src) return;
    const rect = this.opts.canvas.getBoundingClientRect();

    // 中键，或 空格+左键 = 平移画布
    if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
      const v = this.opts.transformer.getView();
      this.panning = true;
      this.panStart = { x: e.clientX, y: e.clientY, ox: v.offsetX, oy: v.offsetY };
      e.preventDefault();
      return;
    }
    if (e.button !== 0 && e.button !== 2) return;

    // 左键=正向(1)，右键=负向(0)（需求 1.3）
    const img = this.opts.transformer.screenToImage(e.clientX, e.clientY, rect);
    const label: 1 | 0 = e.button === 0 ? 1 : 0;
    this.points.add({ x: Math.round(img.x), y: Math.round(img.y), label });
    this.requestSegment();
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

  // ---------- 业务链路 ----------
  /** 防抖调用 SAM：每次打点（或撤销）后重新预测 */
  private requestSegment() {
    const src = this.opts.getSource();
    if (!src || this.points.length === 0) return;
    if (this.pending) clearTimeout(this.pending);
    this.pending = window.setTimeout(async () => {
      this.opts.onStatus?.('SAM 正在分割…', 'info');
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
        this.mask = await decodeMaskImage(res.mask_image!, res.width, res.height);
        this.maskW = res.width;
        this.maskH = res.height;
        this.renderer.setMask(this.mask, this.maskW, this.maskH);
        this.redraw();
        this.opts.onStatus?.('已生成蒙版，可「开始抠图」或继续打点优化', 'info');
      } catch (err: any) {
        this.opts.onStatus?.('SAM 分割失败：' + (err?.message || err), 'error');
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

  private clearMask() {
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
    // 重置 transform 清全屏（兼容 DPR）
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

  // ---------- 两种输出模式（需求 2.1）----------

  /** 模式1：mask 直接作为 Alpha 通道 → 透明 PNG → 右侧预览 */
  async applyAsAlpha(): Promise<string | null> {
    const src = this.opts.getSource();
    if (!src || !this.mask) return null;
    const png = await maskToTransparentPng(src, this.mask, this.maskW, this.maskH);
    const cropped = await cropToAlphaBbox(png, 4);
    this.opts.onPreview(cropped);
    return cropped;
  }

  /** 模式2：mask 融合进 u2net 管线（上传 mask 二值 PNG 给后端融合优化） */
  async fuseWithU2net(uploadFile: File, endpoint: string, model = 'u2net'): Promise<string | null> {
    const src = this.opts.getSource();
    if (!src || !this.mask) return null;
    const maskPng = maskToBase64Png(this.mask, this.maskW, this.maskH);
    const form = new FormData();
    form.append('image', uploadFile);
    form.append('sam_mask', maskPng); // 后端据 sam_mask 约束 u2net 前景
    form.append('model', model);
    const r = await fetch(endpoint, { method: 'POST', body: form });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || '融合失败');
    this.opts.onPreview(j.result_url);
    return j.result_url;
  }
}
