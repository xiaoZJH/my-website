// samClient.ts — 请求类：封装前端 → 后端 SAM 服务的通信
import type { SamRequest, SamResponse, SamStatusResponse } from './types';

export class SamClient {
  private statusUrl: string;

  constructor(private endpoint: string) {
    // 由 segment 地址推导 status 地址（/api/sam-segment → /api/sam-status）
    this.statusUrl = endpoint.replace(/\/sam-segment$/, '/sam-status');
  }

  /** 探测 MobileSAM / 权重是否就绪 */
  async status(): Promise<SamStatusResponse> {
    const r = await fetch(this.statusUrl, { method: 'GET' });
    if (!r.ok) throw new Error('SAM 状态接口返回 ' + r.status);
    return (await r.json()) as SamStatusResponse;
  }

  /**
   * 调用 SAM 分割接口。
   * 请求示例（前端发出）：
   *   POST /api/sam-segment
   *   { "image": "data:image/png;base64,...", "points": [{ "x": 820, "y": 410, "label": 1 }], "sig": "<原图base64>" }
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
