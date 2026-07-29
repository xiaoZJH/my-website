// smartClickTool.ts — 交互工具类（编排器）
// 复刻 WPS 图片编辑器「智能点选」抠图工具的交互与视觉：
//   - 激活后光标为默认指针；
//   - 鼠标悬浮物体 → 淡蓝色半透明蒙版预览（SAM 单点预分割）；
//   - 进入工具即自动用 u2net 选中所有主体（灰罩），保留多主体（如狗+猫）；
//   - 左键单击 → 把点击处的前景连通块加回选区；右键单击 → 把点击处的前景连通块移除；
//   - 点击只做局部连通块修正，不再全局调用 SAM 重分割，避免多主体被切碎或丢失；
//   - 全程不显示任何点位标记，仅通过蒙版反馈；
//   - 支持缩放 / 拖拽平移，屏幕坐标 → 原图像素坐标精准转换；
//   - 配套「撤销上一步选区」「清空全部选区」。
import type { SamStatusResponse, PromptPoint } from './types';
import { CoordinateTransformer } from './coordinate';
import { MaskRenderer } from './maskRenderer';
import { SamClient, decodeMaskImage } from './samClient';
import {
  maskToTransparentPng,
  cropToAlphaBbox,
  maskToBase64Png,
  decodeAlphaPng,
  decodeSoftAlphaPng,
  binarize,
  erodeSoft,
  floodFillRemove,
  dilateAt,
  extractComponentAt,
  removeComponentAt,
  keepComponentAt,
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
  /** 现有 u2net 接口地址，用于未装 MobileSAM 时的基础降级 */
  removeBgEndpoint: string;
  /** 自动初始化时优先使用的 rembg 模型（默认 bria-rmbg，失败回退 u2netp）；可为当前值或 getter */
  removeBgModel?: string | (() => string);
  /** 结果输出到右侧预览面板 */
  onPreview: (pngUrl: string) => void;
  /** 状态提示 */
  onStatus?: (msg: string, type?: 'info' | 'error') => void;
  /** 选区是否有内容变化（用于刷新按钮可用态 + 触发实时预览） */
  onSelectionChange?: (hasSelection: boolean) => void;
  /** 提供原图 base64（优先用这个，避免重复编码 blob URL） */
  getImageBase64?: () => string | Promise<string>;
  /** 提供原始 File，用于降级模式融合 u2net */
  getUploadFile?: () => File | null;
}

const HOVER_DEBOUNCE = 160; // 悬浮预览去抖（ms）

interface HistorySnap {
  points: PromptPoint[];
  mask: Uint8Array | null;
  maskSoft: Uint8Array | null;
}

export class SmartClickTool {
  private mode: ToolMode = 'crop';
  private points: PromptPoint[] = []; // 已确认的提示点集合（1=正向保留，0=反向剔除）
  private committed: Uint8Array | null = null; // 当前全局选区（二值 0/1），原图分辨率，用于渲染遮罩
  private committedSoft: Uint8Array | null = null; // 当前全局选区软 Alpha（0~255），用于生成透明 PNG（边缘羽化）
  private baseMask: Uint8Array | null = null;  // u2net 初始完整主体二值 mask，用于左键「增选」时找回主体
  private baseMaskSoft: Uint8Array | null = null; // u2net 初始完整主体软 Alpha，用于增选时恢复自然边缘
  private cw = 0;
  private ch = 0;
  private history: HistorySnap[] = []; // 每次变更前的快照（点位 + 蒙版），用于撤销
  private hover: Uint8Array | null = null;       // 悬浮预览蒙版
  private renderer = new MaskRenderer();
  private client: SamClient;
  private opts: SmartClickOptions;
  private bound: Array<[string, EventListener]> = [];
  private samAvailable: boolean | null = null;
  private probing = false;
  private panning = false;
  private panStart: { x: number; y: number; ox: number; oy: number } | null = null;
  private spaceDown = false;
  private hoverTimer: number | null = null;

  constructor(opts: SmartClickOptions) {
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
  setMode(m: ToolMode) {
    if (m === this.mode) return;
    this.mode = m;
    this.opts.canvas.style.cursor = 'default'; // WPS：智能点选时光标为默认指针
    if (m !== 'click') {
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

  private resetState() {
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
  private bindOrUnbind(on: boolean) {
    const c = this.opts.canvas;
    const map: Array<[string, EventListener]> = [
      ['mousedown', this.onMouseDown as EventListener],
      ['dblclick', this.onDoubleClick as EventListener],
      ['contextmenu', this.onContextMenu as EventListener],
      ['wheel', this.onWheel as EventListener],
      ['mousemove', this.onMouseMove as EventListener],
      ['mouseup', this.onMouseUp as EventListener],
      ['mouseleave', this.onMouseLeave as EventListener],
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
    if (this.mode !== 'click') return;
    e.preventDefault(); // 右键用于移除，禁用系统菜单
    const me = e as MouseEvent;
    const src = this.opts.getSource();
    if (!src) return;
    const rect = this.opts.canvas.getBoundingClientRect();
    const p = this.opts.transformer.screenToImage(me.clientX, me.clientY, rect);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (x < 0 || x >= src.naturalWidth || y < 0 || y >= src.naturalHeight) return;
    this.addPoint(x, y, 0); // 反向提示：剔除
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
    if (e.button !== 0) return; // 右键在 contextmenu 中处理
    // 双击的第二次 mousedown 不触发普通点选，由 dblclick 统一走 SAM 精修
    if (e.detail > 1) return;
    const p = this.opts.transformer.screenToImage(e.clientX, e.clientY, rect);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (x < 0 || x >= src.naturalWidth || y < 0 || y >= src.naturalHeight) return;
    // Ctrl / Cmd + 左键 = SAM 精准边缘精修（救命稻草模式）
    if (e.ctrlKey || e.metaKey) {
      this.refineWithSam(x, y, 1);
      return;
    }
    this.addPoint(x, y, 1); // 正向提示：保留
  };

  /** 双击 = SAM 精准边缘精修（救命稻草模式） */
  private onDoubleClick = (e: MouseEvent) => {
    if (this.mode !== 'click') return;
    const src = this.opts.getSource();
    if (!src) return;
    const rect = this.opts.canvas.getBoundingClientRect();
    const p = this.opts.transformer.screenToImage(e.clientX, e.clientY, rect);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (x < 0 || x >= src.naturalWidth || y < 0 || y >= src.naturalHeight) return;
    this.refineWithSam(x, y, 1);
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
    if (this.panning && this.panStart) {
      this.opts.transformer.setView({
        offsetX: this.panStart.ox + (e.clientX - this.panStart.x),
        offsetY: this.panStart.oy + (e.clientY - this.panStart.y),
      });
      this.redraw();
      return;
    }
    if (this.mode !== 'click') return;
    // 悬浮预览完全在前端 Canvas 完成，不调用后端模型（WPS 同款思路）
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    this.hoverTimer = window.setTimeout(() => this.doHover(e.clientX, e.clientY), HOVER_DEBOUNCE);
  };

  private onMouseUp = () => {
    this.panning = false;
    this.panStart = null;
  };

  private onMouseLeave = () => {
    this.renderer.clearHover();
    this.hover = null;
    this.redraw();
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

  // ---------- 悬浮预览（淡蓝） ----------
  /** 100% 前端完成：鼠标下的物体连通块高亮，不调用后端模型。 */
  private doHover(clientX: number, clientY: number) {
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
    // 优先用 u2net 初始完整主体做悬浮预览（薄毛发也能被高亮）
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

  private async getImageB64(): Promise<string> {
    if (this.opts.getImageBase64) return await this.opts.getImageBase64();
    const s = this.opts.getSource();
    return (s as HTMLImageElement).src;
  }

  /**
   * 截取以 (cx, cy) 为中心的局部正方形切片，用于 MobileSAM 局部推理。
   * 返回 { dataUrl, localX, localY, x0, y0, size }，
   * 其中 (localX, localY) 是点击点在切片内的坐标，(x0, y0) 是切片左上角在原图的位置。
   */
  private getCropAround(
    cx: number,
    cy: number,
  ): { dataUrl: string; localX: number; localY: number; x0: number; y0: number; size: number; cropW: number; cropH: number } {
    const src = this.opts.getSource()!;
    const W = src.naturalWidth;
    const H = src.naturalHeight;
    // 根据原图尺寸选择切片大小：大图用 512，小图用 256
    const size = Math.max(W, H) > 1024 ? 512 : 256;
    let x0 = Math.round(cx - size / 2);
    let y0 = Math.round(cy - size / 2);
    // 边界 clamp，保证切片完全在原图内
    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x0 + size > W) x0 = Math.max(0, W - size);
    if (y0 + size > H) y0 = Math.max(0, H - size);
    const cropW = Math.min(size, W - x0);
    const cropH = Math.min(size, H - y0);

    const c = document.createElement('canvas');
    c.width = cropW;
    c.height = cropH;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(src, x0, y0, cropW, cropH, 0, 0, cropW, cropH);
    return {
      dataUrl: c.toDataURL('image/png'),
      localX: cx - x0,
      localY: cy - y0,
      x0,
      y0,
      size,
      cropW,
      cropH,
    };
  }

  // ---------- 选区提交（左键保留 / 右键剔除） ----------
  private ensureDims() {
    const s = this.opts.getSource();
    if (s && (this.cw !== s.naturalWidth || this.ch !== s.naturalHeight)) {
      this.cw = s.naturalWidth;
      this.ch = s.naturalHeight;
    }
  }

  private pushHistory() {
    this.history.push({
      points: this.points.map((p) => ({ ...p })),
      mask: this.committed ? this.committed.slice() : null,
      maskSoft: this.committedSoft ? this.committedSoft.slice() : null,
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
  private async addPoint(x: number, y: number, label: 1 | 0) {
    this.ensureDims();
    if (this.samAvailable !== true) {
      this.pushHistory();
      this.applyRefine(x, y, label);
      return;
    }
    this.pushHistory();

    // 左键增选：优先从 u2net 初始完整主体里找回对应连通块
    if (label === 1) {
      const sourceMask = this.baseMask || this.committed;
      if (!sourceMask) return;
      const comp = extractComponentAt(sourceMask, this.cw, this.ch, x, y);
      if (this.committed) {
        // 二值：把该连通块并入当前选区
        const merged = this.committed.slice();
        for (let i = 0; i < merged.length; i++) if (comp[i]) merged[i] = 1;
        this.committed = merged;
        // 软 Alpha：用原始 baseMaskSoft 的对应区域恢复自然边缘
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
      // 右键减选：从当前选区移除点击点所在连通块
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
  private applyCommitted(mask: Uint8Array | null, showMsg = false) {
    this.committed = mask;
    if (mask) this.renderer.setCommitted(mask, this.cw, this.ch);
    else this.renderer.setCommitted(null, 1, 1);
    this.renderer.clearHover();
    this.hover = null;
    this.redraw();
    this.opts.onSelectionChange?.(this.hasMask());
    if (showMsg) {
      this.opts.onStatus?.('已用全部提示点重新推理选区，可继续点击或「开始抠图」。', 'info');
    }
  }

  private afterCommit() {
    this.applyCommitted(this.committed, true);
  }

  /**
   * SAM 边缘精修（救命稻草模式）：仅在双击或 Ctrl+点击时调用。
   * 关键优化：不再发送全图，而是截取 256x256/512x512 局部切片给 MobileSAM，
   * 推理更快、网络更小，然后把局部 mask 拼回全局选区。
   * 正常左/右键只走 Flood Fill 连通块，避免多主体被 SAM 切碎。
   */
  private async refineWithSam(x: number, y: number, label: 1 | 0) {
    this.ensureDims();
    if (this.samAvailable !== true) {
      this.opts.onStatus?.('MobileSAM 未就绪，无法做边缘精修。', 'error');
      return;
    }
    this.pushHistory();
    try {
      const crop = this.getCropAround(x, y);
      this.opts.onStatus?.('正在做局部边缘精修…', 'info');
      const res = await this.client.segment({
        image: crop.dataUrl,
        points: [{ x: crop.localX, y: crop.localY, label }],
        sig: crop.dataUrl,
        multimask: true,
      });
      const cropMask = await decodeMaskImage(res.mask_image!, res.width, res.height);
      // 把局部 mask 拼回全局 mask
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
      this.opts.onStatus?.('局部边缘精修完成。', 'info');
    } catch (err: any) {
      this.opts.onStatus?.('边缘精修失败：' + (err?.message || err), 'error');
    }
  }

  /** 降级模式（未装 MobileSAM）的局部修正：label=1 补回 / label=0 去除 */
  private applyRefine(x: number, y: number, label: 1 | 0) {
    this.ensureDims();
    if (!this.committed) this.committed = new Uint8Array(this.cw * this.ch);
    if (!this.committedSoft) this.committedSoft = new Uint8Array(this.cw * this.ch);
    const next =
      label === 0
        ? floodFillRemove(this.committed, this.cw, this.ch, x, y)
        : dilateAt(this.committed, this.cw, this.ch, x, y, 70);
    this.committed = next;
    // 降级模式无软边缘，直接用二值映射为 0/255 Alpha
    const soft = this.committedSoft.slice();
    for (let i = 0; i < soft.length; i++) soft[i] = next[i] ? 255 : 0;
    this.committedSoft = soft;
    this.renderer.setCommitted(next, this.cw, this.ch);
    this.afterCommit();
  }

  /** 撤销上一步选区（恢复上次的点位集合 + 蒙版快照，无需重新推理） */
  undo() {
    if (!this.history.length) return;
    const snap = this.history.pop()!;
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
  private async probeSam() {
    if (this.probing) return;
    this.probing = true;
    try {
      const st: SamStatusResponse = await this.client.status();
      this.samAvailable = st.available;
      if (st.available) {
        this.opts.onStatus?.('智能点选已就绪：已自动选中主体，左键增选、右键减选，悬浮可预览。', 'info');
      } else {
        this.opts.onStatus?.('未检测到 MobileSAM，已用基础模式自动选中主体（点击微调）。', 'info');
      }
    } catch {
      this.samAvailable = false;
      this.opts.onStatus?.('SAM 服务未就绪，已用基础模式自动选中主体（点击微调）。', 'info');
    } finally {
      this.probing = false;
      // 无论 SAM 是否就绪，工具激活即自动选中主体（复刻 WPS：进入即选中）
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
  private async autoInitSubject() {
    const src = this.opts.getSource();
    const file = this.opts.getUploadFile?.();
    if (!src || !file) return;
    this.ensureDims();
    try {
      const preferredModel =
        typeof this.opts.removeBgModel === 'function'
          ? this.opts.removeBgModel()
          : this.opts.removeBgModel || 'bria-rmbg';
      const form = new FormData();
      form.append('image', file);
      form.append('model', preferredModel);
      form.append('no_crop', '1'); // 关键：保持原图尺寸
      let r = await fetch(this.opts.removeBgEndpoint, { method: 'POST', body: form });
      let j = await r.json();
      // 如果首选模型（如 bria-rmbg）未下载/失败，自动回退到轻量 u2netp
      if (!j.ok && preferredModel !== 'u2netp') {
        this.opts.onStatus?.(`${preferredModel} 未就绪，回退到 u2netp 自动识别。`, 'info');
        const fallback = new FormData();
        fallback.append('image', file);
        fallback.append('model', 'u2netp');
        fallback.append('no_crop', '1');
        r = await fetch(this.opts.removeBgEndpoint, { method: 'POST', body: fallback });
        j = await r.json();
      }
      if (!j.ok) throw new Error(j.error || '自动识别失败');

      // 软 Alpha Matting：保留 u2net 原生半透明边缘，避免硬二值锯齿/白边
      const soft = await decodeSoftAlphaPng(j.result_url);
      this.cw = src.naturalWidth;
      this.ch = src.naturalHeight;

      // 轻微缩边 1px：去掉主体外圈原背景残留的白边/光晕（WPS 同款思路）
      const eroded = erodeSoft(soft, this.cw, this.ch, 1);
      const bin = binarize(eroded, 30);

      // 保留未腐蚀的完整主体，用于后续左键增选、悬浮预览（薄毛发不被缩边误删）
      this.baseMaskSoft = soft;
      this.baseMask = binarize(soft, 30);

      // 当前选区：腐蚀后边缘更干净
      this.committedSoft = eroded;
      this.committed = bin;
      this.renderer.setCommitted(bin, this.cw, this.ch);
      this.redraw();
      this.opts.onSelectionChange?.(this.hasMask());
      this.opts.onStatus?.('已自动选中主体，可左键增选、右键减选，双击或 Ctrl+点击做边缘精修。', 'info');
    } catch (err: any) {
      this.opts.onStatus?.('自动选中主体失败：' + (err?.message || err), 'error');
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
  async applyAsAlpha(): Promise<string | null> {
    const src = this.opts.getSource();
    if (!src || !this.committed) {
      console.log('[SmartClick.applyAsAlpha] skipped: no source or no committed mask');
      return null;
    }
    if (!this.cw || !this.ch) {
      console.warn('[SmartClick.applyAsAlpha] skipped: invalid dims', this.cw, this.ch);
      return null;
    }
    try {
      // 优先用软蒙版输出，边缘自然；无软蒙版时回退二值 mask（兼容旧状态）
      const alphaMask = this.committedSoft || this.committed;
      const expectedLen = this.cw * this.ch;
      console.log('[SmartClick.applyAsAlpha] dims=%dx%d maskLen=%d expected=%d soft=%s',
        this.cw, this.ch, alphaMask.length, expectedLen, !!this.committedSoft);
      if (alphaMask.length !== expectedLen) {
        console.warn('[SmartClick.applyAsAlpha] mask length mismatch');
      }

      const png = await maskToTransparentPng(src, alphaMask, this.cw, this.ch);
      console.log('[SmartClick.applyAsAlpha] transparent png len=%d prefix=%s',
        png.length, png.slice(0, 60));

      let cropped = png;
      try {
        cropped = await cropToAlphaBbox(png, 4);
        console.log('[SmartClick.applyAsAlpha] cropped png len=%d prefix=%s',
          cropped.length, cropped.slice(0, 60));
      } catch (cropErr) {
        console.warn('[SmartClick.applyAsAlpha] cropToAlphaBbox failed, fallback to uncropped', cropErr);
      }

      if (!cropped || typeof cropped !== 'string' || !cropped.startsWith('data:image/png;base64,')) {
        console.error('[SmartClick.applyAsAlpha] invalid pngUrl', cropped);
        this.opts.onStatus?.('生成的预览数据异常，请重试', 'error');
        return null;
      }

      this.opts.onPreview(cropped);
      return cropped;
    } catch (err: any) {
      console.error('[SmartClick.applyAsAlpha] failed', err);
      this.opts.onStatus?.('生成预览失败：' + (err?.message || err), 'error');
      return null;
    }
  }

  /** 模式2：mask 融合进 u2net 管线 */
  async fuseWithU2net(uploadFile: File, endpoint: string, model = 'u2net'): Promise<string | null> {
    const src = this.opts.getSource();
    if (!src || !this.committed) return null;
    const maskPng = maskToBase64Png(this.committed, this.cw, this.ch);
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
