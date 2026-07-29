// matting.ts — ④ 抠图结果输出：mask → 透明 PNG；裁剪透明空白；mask 编码为后端融合用 PNG
//
// 这些函数把 SAM 的二值 mask 与原图合成最终透明 PNG（模式1），
// 以及把 mask 编码成二值 PNG 上传给后端做 u2net 融合（模式2）。

/**
 * 模式1：mask 作为 Alpha 通道，直接生成透明 PNG（dataURL）。
 * @param source 原图（HTMLImageElement / ImageBitmap / canvas）
 * @param mask   Uint8Array，0/1 或 0~255 软蒙版，长度 = w*h。
 *               0=透明；1 会视为 255（兼容旧二值 mask）；2~255 直接作为 Alpha。
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
    const v = mask[i];
    img.data[i * 4 + 3] = v === 1 ? 255 : v; // 仅改 Alpha，RGB 不变 → 透明通道抠图
  }
  // 颜色去污染：消除边缘白边/环境光反光
  decontaminateEdges(img.data, w, h);
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

/**
 * 颜色去污染（Color Decontamination）：
 * 对半透明边缘像素，用附近高 Alpha 像素的颜色替换其 RGB，
 * 消除原背景白边/环境光在主体边缘的反光污染。
 * 仅处理 alpha 在 [edgeLow, edgeHigh] 之间的边缘像素，避免误改主体内部。
 */
export function decontaminateEdges(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  radius = 4,
  edgeLow = 15,
  edgeHigh = 240,
): void {
  const len = w * h;
  const opaque = new Uint8Array(len); // 1 = 确定前景（alpha > edgeHigh）
  for (let i = 0; i < len; i++) {
    opaque[i] = rgba[i * 4 + 3] > edgeHigh ? 1 : 0;
  }

  // 只为边缘半透明像素计算替换色
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const a = rgba[i * 4 + 3];
      if (a <= edgeLow || a >= edgeHigh) continue; // 全透明或内部不处理

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

/**
 * 把 remove-bg 返回的透明 PNG dataURL 解码为 0/1 mask。
 * 用于「智能点选」进入时自动初始化选区。
 */
export function decodeAlphaPng(dataUrl: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d')!;
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

/**
 * 把 remove-bg 返回的透明 PNG dataURL 解码为 0~255 软 Alpha mask。
 * 保留 u2net 原生的半透明边缘，用于 Alpha Matting（羽化边缘、减少白边/锯齿）。
 */
export function decodeSoftAlphaPng(dataUrl: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d')!;
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

/** 软 mask → 二值 mask（用于连通分量、渲染遮罩）。 */
export function binarize(mask: Uint8Array, threshold = 30): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] > threshold ? 1 : 0;
  return out;
}

/**
 * 灰度腐蚀（取局部最小值）。
 * 对软 Alpha mask 做 1~2px 内缩，可去掉主体边缘一圈原背景残留的白边/光晕。
 * radius=1 即 3×3 最小值滤波，保证速度同时轻微缩边。
 */
export function erodeSoft(mask: Uint8Array, w: number, h: number, radius = 1): Uint8Array {
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

/**
 * 在 0/1 mask 中找出「最大前景连通分量」的质心（原图像素坐标）。
 * 用于智能点选进入时，以 u2net 初始 mask 的质心作为 SAM 正向种子点，
 * 自动选中主体（复刻 WPS：进入工具即选中主体）。
 * @returns {x,y} 质心（已保证落在前景像素上，必要时就近回退）；无前景返回 null
 */
export function findLargestComponentCentroid(
  mask: Uint8Array,
  w: number,
  h: number
): { x: number; y: number } | null {
  const visited = new Uint8Array(w * h);
  let bestArea = 0;
  let bestCx = 0;
  let bestCy = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = y * w + x;
      if (!mask[start] || visited[start]) continue;
      // 栈式 4 邻接连通分量扫描（避免递归爆栈）
      let area = 0;
      let sumX = 0;
      let sumY = 0;
      const stack: number[] = [x, y];
      visited[start] = 1;
      while (stack.length) {
        const cy = stack.pop()!;
        const cx = stack.pop()!;
        const i = cy * w + cx;
        area++;
        sumX += cx;
        sumY += cy;
        if (cy > 0) {
          const ni = i - w;
          if (mask[ni] && !visited[ni]) { visited[ni] = 1; stack.push(cx, cy - 1); }
        }
        if (cy < h - 1) {
          const ni = i + w;
          if (mask[ni] && !visited[ni]) { visited[ni] = 1; stack.push(cx, cy + 1); }
        }
        if (cx > 0) {
          const ni = i - 1;
          if (mask[ni] && !visited[ni]) { visited[ni] = 1; stack.push(cx - 1, cy); }
        }
        if (cx < w - 1) {
          const ni = i + 1;
          if (mask[ni] && !visited[ni]) { visited[ni] = 1; stack.push(cx + 1, cy); }
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

  // 质心四舍五入到像素；若恰好落在背景（极小概率，组件含空洞），就近回退到最近前景像素
  let rx = Math.round(bestCx);
  let ry = Math.round(bestCy);
  rx = Math.max(0, Math.min(w - 1, rx));
  ry = Math.max(0, Math.min(h - 1, ry));
  if (mask[ry * w + rx]) return { x: rx, y: ry };

  // 局部螺旋扫描，找最近的前景点作为种子（半径封顶 64，避免极端空洞形状下的长耗时）
  const R = Math.min(Math.max(w, h), 64);
  for (let r = 1; r < R; r++) {
    for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dy), Math.abs(-r)) !== r && Math.max(Math.abs(dy), Math.abs(r)) !== r) continue;
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dy), Math.abs(dx)) !== r) continue; // 只扫边框环
        const nx = rx + dx;
        const ny = ry + dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[ny * w + nx]) return { x: nx, y: ny };
      }
    }
  }
  return { x: rx, y: ry };
}

/**
 * 前端 Flood Fill 去除：以 (sx,sy) 为种子，把同属一个前景连通块的所有像素置 0。
 * 用于 SAM 不可用时，用户点击「误保留区域」做快速去除。
 */
export function floodFillRemove(mask: Uint8Array, w: number, h: number, sx: number, sy: number): Uint8Array {
  const out = mask.slice();
  const idx = sy * w + sx;
  if (idx < 0 || idx >= out.length || !out[idx]) return out;
  const stack: [number, number][] = [[sx, sy]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    const i = y * w + x;
    if (x < 0 || x >= w || y < 0 || y >= h || !out[i]) continue;
    out[i] = 0;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return out;
}

/**
 * 前端膨胀保留：以 (sx,sy) 为圆心，radius 为半径把圆形区域置 1。
 * 用于 SAM 不可用时，用户点击「漏检背景」做快速补回。
 */
export function dilateAt(mask: Uint8Array, w: number, h: number, sx: number, sy: number, radius = 40): Uint8Array {
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

/**
 * 统计 mask 中前景像素数量（0/1 mask）。
 */
export function maskArea(mask: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < mask.length; i++) s += mask[i];
  return s;
}

/** 两 mask 逐像素「或」：前景并集（用于正向点击时保证主体只增不减）。 */
export function unionMasks(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] || b[i] ? 1 : 0;
  return out;
}

/**
 * 在 0/1 mask 的【最大前景连通分量】内，按 K×K 网格撒多个「正向锚点」。
 * 用途：智能点选把多个锚点作为 SAM 多点提示，让 SAM 一次分割出【完整】主体，
 * 而不是被单个质心点切成局部（即解决「主体不全」）。每个点保证落在前景像素上。
 */
export function sampleForegroundPoints(
  mask: Uint8Array,
  w: number,
  h: number,
  maxPoints = 8,
): Array<{ x: number; y: number; label: 1 }> {
  // 1) 找最大连通分量及其外接框
  const visited = new Uint8Array(w * h);
  let bestPixels: number[] = [];
  let bestBbox = { minX: w, minY: h, maxX: -1, maxY: -1 };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = y * w + x;
      if (!mask[start] || visited[start]) continue;
      const comp: number[] = [];
      let minX = x, minY = y, maxX = x, maxY = y;
      const stack: number[] = [x, y];
      visited[start] = 1;
      while (stack.length) {
        const cy = stack.pop()!;
        const cx = stack.pop()!;
        const i = cy * w + cx;
        comp.push(i);
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        if (cy > 0) { const ni = i - w; if (mask[ni] && !visited[ni]) { visited[ni] = 1; stack.push(cx, cy - 1); } }
        if (cy < h - 1) { const ni = i + w; if (mask[ni] && !visited[ni]) { visited[ni] = 1; stack.push(cx, cy + 1); } }
        if (cx > 0) { const ni = i - 1; if (mask[ni] && !visited[ni]) { visited[ni] = 1; stack.push(cx - 1, cy); } }
        if (cx < w - 1) { const ni = i + 1; if (mask[ni] && !visited[ni]) { visited[ni] = 1; stack.push(cx + 1, cy); } }
      }
      if (comp.length > bestPixels.length) {
        bestPixels = comp;
        bestBbox = { minX, minY, maxX, maxY };
      }
    }
  }
  if (bestPixels.length === 0) return [];

  // 2) 在 bbox 内撒 K×K 网格，落点就近吸附到前景像素
  const K = Math.max(2, Math.ceil(Math.sqrt(maxPoints)));
  const pts: Array<{ x: number; y: number; label: 1 }> = [];
  const seen = new Set<number>();
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
    const out: Array<{ x: number; y: number; label: 1 }> = [];
    const step = pts.length / maxPoints;
    for (let i = 0; i < maxPoints; i++) out.push(pts[Math.floor(i * step)]);
    return out;
  }
  return pts;
}

/** 把 (x,y) 吸附到最近的前景色：本身是前景直接返回，否则螺旋搜索（半径封顶 128）。 */
function snapToForeground(
  mask: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
): { x: number; y: number } | null {
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

/**
 * 提取 (sx,sy) 所在的前景连通块，返回仅包含该连通块的新 mask。
 * 若 (sx,sy) 不在前景内，返回全 0 mask。
 */
export function extractComponentAt(
  mask: Uint8Array,
  w: number,
  h: number,
  sx: number,
  sy: number,
): Uint8Array {
  const out = new Uint8Array(w * h);
  sx = Math.max(0, Math.min(w - 1, sx));
  sy = Math.max(0, Math.min(h - 1, sy));
  const idx = sy * w + sx;
  if (!mask[idx]) return out;
  const stack: [number, number][] = [[sx, sy]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    const i = y * w + x;
    if (x < 0 || x >= w || y < 0 || y >= h || !mask[i] || out[i]) continue;
    out[i] = 1;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return out;
}

/**
 * 移除 (sx,sy) 所在的前景连通块。
 * 若点击处不在前景内，返回原 mask 副本。
 */
export function removeComponentAt(
  mask: Uint8Array,
  w: number,
  h: number,
  sx: number,
  sy: number,
): Uint8Array {
  const comp = extractComponentAt(mask, w, h, sx, sy);
  const out = mask.slice();
  for (let i = 0; i < out.length; i++) if (comp[i]) out[i] = 0;
  return out;
}

/**
 * 保留 (sx,sy) 所在的前景连通块，其余全部置 0。
 */
export function keepComponentAt(
  mask: Uint8Array,
  w: number,
  h: number,
  sx: number,
  sy: number,
): Uint8Array {
  return extractComponentAt(mask, w, h, sx, sy);
}
