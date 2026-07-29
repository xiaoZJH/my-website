// maskRenderer.ts — 智能点选蒙版渲染（完全对齐 WPS 视觉规范）
//
// 视觉规则（严格对齐 WPS 智能点选）：
//   1) 被保留区域：完全显示原图，清晰无遮挡、色彩不变（绝不叠加彩色蒙版）。
//   2) 待移除背景：覆盖半透明浅灰色蒙版，使画面整体淡化发灰，直观区分保留/移除。
//   3) 悬浮预览：鼠标指向未选中物体时，该物体覆盖淡蓝色半透明蒙版预览识别范围。
//   4) 蒙版边缘平滑自然（羽化），无锯齿、无硬边、无横向条纹、无噪点。
//   5) 全程不绘制任何点击圆点 / 点位标记 / 坐标痕迹。

// 背景（待移除）蒙版：半透明浅灰，使画面整体发灰
const GRAY = 'rgba(150, 152, 160, 0.55)';
// 悬浮预览蒙版：淡蓝色半透明
const BLUE = 'rgba(90, 156, 248, 0.45)';
// 边缘羽化半径（原图像素），保证蒙版边缘平滑、无硬边
const BLUR = 2.0;

export class MaskRenderer {
  private w = 0;
  private h = 0;

  // 已确认选区（保留区）的硬蒙版 + 其羽化版
  private committed = document.createElement('canvas');
  private committedBlur = document.createElement('canvas');
  private committedHas = false;
  private committedOverlay: HTMLCanvasElement | null = null;

  // 悬浮预览（淡蓝）蒙版 + 其合成叠加层
  private hoverOverlay: HTMLCanvasElement | null = null;

  /** 构建一张「白色=1 / 透明=0」的硬蒙版离屏画布 */
  private buildStencil(mask: Uint8Array | null, w: number, h: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    if (mask && mask.length) {
      const img = ctx.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        if (mask[i]) {
          const o = i * 4;
          img.data[o] = 255; img.data[o + 1] = 255; img.data[o + 2] = 255; img.data[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }
    return c;
  }

  /** 对蒙版做轻量高斯羽化，得到平滑边缘 */
  private blur(src: HTMLCanvasElement): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const ctx = c.getContext('2d')!;
    ctx.filter = `blur(${BLUR}px)`;
    ctx.drawImage(src, 0, 0);
    return c;
  }

  /** 写入已确认选区（Uint8Array，0/1，长度 = w*h）。mask 为 null 表示清空。 */
  setCommitted(mask: Uint8Array | null, w: number, h: number) {
    this.w = w; this.h = h;
    this.committed.width = w; this.committed.height = h;
    const cctx = this.committed.getContext('2d')!;
    cctx.clearRect(0, 0, w, h);
    let has = false;
    if (mask && mask.length) {
      const img = cctx.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        if (mask[i]) {
          has = true;
          const o = i * 4;
          img.data[o] = 255; img.data[o + 1] = 255; img.data[o + 2] = 255; img.data[o + 3] = 255;
        }
      }
      cctx.putImageData(img, 0, 0);
    }
    this.committedHas = has;
    this.committedBlur = this.blur(this.committed);

    // 预合成背景灰罩：整张浅灰 → 按保留区（羽化）挖空 → 保留区透出原图，背景发灰
    const ov = document.createElement('canvas');
    ov.width = w; ov.height = h;
    const octx = ov.getContext('2d')!;
    octx.fillStyle = GRAY;
    octx.fillRect(0, 0, w, h);
    octx.globalCompositeOperation = 'destination-out';
    octx.filter = `blur(${BLUR}px)`;
    octx.drawImage(this.committed, 0, 0);
    this.committedOverlay = ov;
  }

  /** 写入悬浮预览蒙版（淡蓝，覆盖未选中物体）。mask 为 null / 空表示清除。 */
  setHover(mask: Uint8Array | null, w: number, h: number) {
    if (!mask || !mask.length || !w || !h) {
      this.hoverOverlay = null;
      return;
    }
    this.w = w; this.h = h;
    const stencil = this.buildStencil(mask, w, h);
    const blurStencil = this.blur(stencil);

    const ov = document.createElement('canvas');
    ov.width = w; ov.height = h;
    const octx = ov.getContext('2d')!;
    // 先铺满淡蓝，再只保留物体范围（羽化边缘）
    octx.fillStyle = BLUE;
    octx.fillRect(0, 0, w, h);
    octx.globalCompositeOperation = 'destination-in';
    octx.filter = `blur(${BLUR}px)`;
    octx.drawImage(blurStencil, 0, 0);
    // 已保留区域不显示淡蓝（避免蓝覆盖已确认的原图）
    octx.globalCompositeOperation = 'destination-out';
    octx.filter = `blur(${BLUR}px)`;
    octx.drawImage(this.committedBlur, 0, 0);
    this.hoverOverlay = ov;
  }

  clearHover() {
    this.hoverOverlay = null;
  }

  /** 在主画布上绘制背景灰罩（仅在确有选区时绘制；无选区则不发灰，原图正常显示）。 */
  renderCommitted(ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number) {
    if (!this.committedHas || !this.committedOverlay) return;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.committedOverlay, dx, dy, dw, dh);
    ctx.restore();
  }

  /** 在主画布上绘制悬浮淡蓝预览（若有）。 */
  renderHover(ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number) {
    if (!this.hoverOverlay) return;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.hoverOverlay, dx, dy, dw, dh);
    ctx.restore();
  }
}
