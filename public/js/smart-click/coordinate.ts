// coordinate.ts — ① Canvas 坐标转换核心工具（缩放 + 平移兼容）
//
// 设计：原图像素 (ix, iy) → 画布 CSS 像素 (cx, cy) 的仿射变换：
//     cx = ix * scale + offsetX
//     cy = iy * scale + offsetY
// 其中 scale = viewScale（已含「适配缩放 + 用户滚轮缩放」），(offsetX, offsetY) = 画布内原点偏移（平移）。
// 反向（屏幕坐标 → 原图像素）：
//     ix = (cssX - offsetX) / scale
//     iy = (cssY - offsetY) / scale
//
// 关于 DPR：canvas 内部设备像素 = CSS 像素 * dpr。绘制时通过 ctx.setTransform(dpr,0,0,dpr,0,0)
// 把绘制坐标系锁定为 CSS 像素，因此「屏幕 ↔ 图像」的换算全程只走 CSS 像素，无需关心 dpr。

export interface ViewTransform {
  scale: number; // viewScale（相对原图像素）
  offsetX: number; // 画布 CSS px
  offsetY: number; // 画布 CSS px
}

export class CoordinateTransformer {
  private imgW = 1;
  private imgH = 1;
  private view: ViewTransform = { scale: 1, offsetX: 0, offsetY: 0 };

  setImageSize(w: number, h: number) {
    this.imgW = w;
    this.imgH = h;
  }

  /** 设置/局部更新视图（缩放或平移后调用） */
  setView(v: Partial<ViewTransform>) {
    this.view = { ...this.view, ...v };
  }

  getView(): ViewTransform {
    return { ...this.view };
  }

  /**
   * 计算把整张图「适配」进 (maxW, maxH) 的初始视图：等比缩放、居中、不超出 1。
   * 返回后请同步设置 canvas 的 CSS 尺寸与 transform。
   */
  fit(maxW: number, maxH: number): ViewTransform {
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
  screenToImage(clientX: number, clientY: number, rect: DOMRect): { x: number; y: number } {
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;
    return {
      x: (cssX - this.view.offsetX) / this.view.scale,
      y: (cssY - this.view.offsetY) / this.view.scale,
    };
  }

  /** 原图像素坐标 → 屏幕(client)坐标（用于把提示点画到别处或做命中测试） */
  imageToScreen(ix: number, iy: number, rect: DOMRect): { x: number; y: number } {
    return {
      x: rect.left + ix * this.view.scale + this.view.offsetX,
      y: rect.top + iy * this.view.scale + this.view.offsetY,
    };
  }

  /** 原图像素坐标 → 画布内 CSS 像素坐标（用于 ctx 直接绘制） */
  imageToCanvas(ix: number, iy: number): { x: number; y: number } {
    return { x: ix * this.view.scale + this.view.offsetX, y: iy * this.view.scale + this.view.offsetY };
  }

  /**
   * 以画布内某个 CSS 点为锚点做缩放（滚轮缩放，保持鼠标下的图像点不动）。
   * @param anchorCssX 锚点 CSS X（= clientX - rect.left）
   * @param anchorCssY 锚点 CSS Y（= clientY - rect.top）
   */
  zoomAt(anchorCssX: number, anchorCssY: number, factor: number, min = 0.05, max = 16) {
    const newScale = Math.min(max, Math.max(min, this.view.scale * factor));
    // 锚点在「图像坐标系」中的位置保持不变：先反解出图像坐标，再用新 scale 反推 offset
    const imgX = (anchorCssX - this.view.offsetX) / this.view.scale;
    const imgY = (anchorCssY - this.view.offsetY) / this.view.scale;
    this.view.offsetX = anchorCssX - imgX * newScale;
    this.view.offsetY = anchorCssY - imgY * newScale;
    this.view.scale = newScale;
  }

  /** 拖拽平移（中键/空格+左键） */
  pan(dxCss: number, dyCss: number) {
    this.view.offsetX += dxCss;
    this.view.offsetY += dyCss;
  }
}
