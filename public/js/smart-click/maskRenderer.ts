// maskRenderer.ts — ③ SAM mask 蒙版渲染（半透明蓝，对齐 WPS 智能点选风格）+ 点位绘制 + 掩码合并
import type { PromptPoint } from './types';

// WPS 智能点选风格：半透明橙红蒙版，提示「当前选中区域」
const MASK_COLOR: [number, number, number] = [255, 90, 60];
const MASK_ALPHA = 145; // 0~255

export class MaskRenderer {
  private maskCanvas: HTMLCanvasElement;
  private maskCtx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;

  constructor() {
    this.maskCanvas = document.createElement('canvas');
    this.maskCtx = this.maskCanvas.getContext('2d')!;
  }

  /**
   * 写入 mask（Uint8Array，值 0/1，长度 = w*h）。
   * 这里把二值 mask 烘焙成一张「蓝色半透明」离屏画布，后续按视图缩放绘制即可，性能好且边缘清晰。
   */
  setMask(mask: Uint8Array, w: number, h: number) {
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
  render(ctx: CanvasRenderingContext2D, destX: number, destY: number, destW: number, destH: number) {
    if (!this.w) return;
    ctx.save();
    ctx.imageSmoothingEnabled = true; // 缩小时更平滑；要硬边可改 false
    ctx.drawImage(this.maskCanvas, destX, destY, destW, destH);
    ctx.restore();
  }

  /** 绘制提示点：正向=青绿带「+」，负向=红带「−」 */
  drawPoints(
    ctx: CanvasRenderingContext2D,
    toCanvas: (ix: number, iy: number) => { x: number; y: number },
    points: PromptPoint[]
  ) {
    for (const p of points) {
      const { x, y } = toCanvas(p.x, p.y);
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = p.label === 1 ? 'rgba(16,185,129,0.95)' : 'rgba(239,68,68,0.95)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      // 加减号
      ctx.strokeStyle = '#fff';
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
  static merge(a: Uint8Array, b: Uint8Array, mode: 'union' | 'intersection' = 'union'): Uint8Array {
    const out = new Uint8Array(a.length);
    for (let i = 0; i < a.length; i++) {
      out[i] = mode === 'union' ? (a[i] || b[i] ? 1 : 0) : a[i] && b[i] ? 1 : 0;
    }
    return out;
  }
}
