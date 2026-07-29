// types.ts — 智能点选抠图（Smart Click Matting）共享类型定义
// 仅依赖标准 DOM/Canvas，无框架，可直接被现有 app.js（经 esbuild 编译后）引入。

/** 提示点：原图像素坐标 + 正负标签 */
export interface PromptPoint {
  x: number; // 原图像素 X
  y: number; // 原图像素 Y
  /** 1 = 正向提示（保留该物体）；0 = 负向提示（剔除背景） */
  label: 1 | 0;
}

/** 前端 → 后端 SAM 分割请求体 */
export interface SamRequest {
  /** 原图 base64，可带 `data:image/...;base64,` 前缀 */
  image: string;
  /** 单点提示（每次点击单点即可，后端返回该点对应的完整物体 mask） */
  points: PromptPoint[];
  /** 原图 base64 作为缓存键，告诉后端「同一张图不必重复编码」 */
  sig?: string;
  /** 是否返回多个候选 mask，默认 false（取置信度最高者，更快） */
  multimask?: boolean;
}

/** 后端 → 前端 SAM 分割响应体 */
export interface SamResponse {
  ok: boolean;
  /** mask 宽（= 原图宽，像素） */
  width: number;
  /** mask 高（= 原图高，像素） */
  height: number;
  /** 二值 mask PNG 的 base64（白色=前景）。前端解码即得 0/1 数组 */
  mask_image?: string;
  /** 预测置信度（0~1） */
  score?: number;
  error?: string;
}

/** 后端 → 前端 SAM 可用性探测响应体 */
export interface SamStatusResponse {
  ok: boolean;
  /** MobileSAM / 权重是否就绪 */
  available: boolean;
  error?: string;
}
