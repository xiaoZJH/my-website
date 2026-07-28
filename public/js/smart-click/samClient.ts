// samClient.ts — 请求类：封装前端 → 后端 SAM 服务的通信
import type { SamRequest, SamResponse } from './types';

export class SamClient {
  constructor(private endpoint: string) {}

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
  async segment(req: SamRequest, signal?: AbortSignal): Promise<SamResponse> {
    const r = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    });
    if (!r.ok) throw new Error('SAM 服务返回 ' + r.status);
    const j = (await r.json()) as SamResponse;
    if (!j.ok) throw new Error(j.error || 'SAM 分割失败');
    return j;
  }
}

/**
 * 把后端返回的二值 mask PNG（base64）解码成前端 Uint8Array（0/1）。
 * 这样「掩码渲染 / 合并 / 裁剪透明通道」都基于同一份数组，逻辑统一。
 */
export function decodeMaskImage(dataUrl: string, w: number, h: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h).data;
      const out = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) out[i] = d[i * 4] > 127 ? 1 : 0; // 取 R 通道阈值
      resolve(out);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
