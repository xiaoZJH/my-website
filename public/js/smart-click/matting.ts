// matting.ts — ④ 抠图结果输出：mask → 透明 PNG；裁剪透明空白；mask 编码为后端融合用 PNG
//
// 这些函数把 SAM 的二值 mask 与原图合成最终透明 PNG（模式1），
// 以及把 mask 编码成二值 PNG 上传给后端做 u2net 融合（模式2）。

/**
 * 模式1：mask 作为 Alpha 通道，直接生成透明 PNG（dataURL）。
 * @param source 原图（HTMLImageElement / ImageBitmap / canvas）
 * @param mask   Uint8Array，0/1，长度 = w*h
 */
export async function maskToTransparentPng(
  source: CanvasImageSource,
  mask: Uint8Array,
  w: number,
  h: number
): Promise<string> {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(source, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < w * h; i++) {
    img.data[i * 4 + 3] = mask[i] ? 255 : 0; // 仅改 Alpha，RGB 不变 → 透明通道抠图
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

/**
 * 按 alpha 外接矩形裁剪透明空白，padding 防贴边；返回新的 dataURL。
 * 用于让下载的 PNG 紧凑（避免四周大量透明边）。
 */
export function cropToAlphaBbox(dataUrl: string, padding = 4): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
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
      const out = document.createElement('canvas');
      out.width = cw;
      out.height = ch;
      out.getContext('2d')!.drawImage(c, minX, minY, cw, ch, 0, 0, cw, ch);
      resolve(out.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * 把前端 Uint8Array mask 编码为二值 PNG base64（白色=前景），供模式2「融合上传」给后端。
 */
export function maskToBase64Png(mask: Uint8Array, w: number, h: number): string {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = mask[i] ? 255 : 0;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}
