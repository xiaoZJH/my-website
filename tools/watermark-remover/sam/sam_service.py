# sam_service.py — 智能点选后端：MobileSAM / TinySAM 点击分割服务
#
# 设计：
#   - 提供一个 register_sam(app) 函数，可挂到你现有的 Flask app.py 上。
#   - 路由 /api/sam-segment：接收 {image: base64, points:[{x,y,label}]}，返回二值 mask PNG(base64)。
#   - 另提供 apply_sam_mask_to_alpha()，供现有 /api/remove-bg 在收到 sam_mask 时融合优化。
#
# 依赖（在 Flask 的 venv 中安装）：
#   pip install segment-anything-mobile-sam  # 或 pip install mobile_sam
#   pip install timm torch numpy pillow opencv-python-headless
# 权重（MobileSAM vit_t）：https://github.com/ChaoningZhang/MobileSAM 的 mobile_sam.pt

import base64
import io
import threading
import numpy as np
import cv2
from flask import jsonify
from PIL import Image

# 全局 predictor（懒加载，线程锁串行化推理，避免 onnx/torch 并发问题）
_PREDICTOR = None
_LOCK = threading.Lock()


def _get_predictor():
    """懒加载 MobileSAM predictor（首次调用时构建）。"""
    global _PREDICTOR
    if _PREDICTOR is not None:
        return _PREDICTOR
    # 优先 mobile_sam，其次 segment_anything
    try:
        from mobile_sam import sam_model_registry, SamPredictor  # type: ignore
        CKPT = "weights/mobile_sam.pt"  # 按部署环境调整
        sam = sam_model_registry["vit_t"](checkpoint=CKPT)
    except Exception:
        from segment_anything import sam_model_registry, SamPredictor  # type: ignore
        CKPT = "weights/sam_vit_b_01ec64.pth"
        sam = sam_model_registry["vit_b"](checkpoint=CKPT)
    sam.to("cpu")  # 有 CUDA 可改 "cuda"
    _PREDICTOR = SamPredictor(sam)
    return _PREDICTOR


def _b64_to_array(b64: str) -> np.ndarray:
    raw = base64.b64decode(b64.split(",", 1)[-1])
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    return np.array(img)


def _mask_to_b64(mask: np.ndarray) -> str:
    mimg = (mask.astype(np.uint8) * 255)
    buf = io.BytesIO()
    Image.fromarray(mimg).save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def register_sam(bp):
    """把 SAM 相关路由挂到现有 Flask blueprint（带 BASE_PATH 前缀）上。"""

    @bp.route("/api/sam-segment", methods=["POST"])
    def sam_segment():
        from flask import request
        data = request.get_json(force=True)
        try:
            image_arr = _b64_to_array(data["image"])
            pts = data.get("points", [])
            if not pts:
                return jsonify(ok=False, error="points 为空")
            point_coords = np.array([[p["x"], p["y"]] for p in pts], dtype=np.float32)
            point_labels = np.array([int(p["label"]) for p in pts], dtype=np.int64)
            multimask = bool(data.get("multimask", False))

            with _LOCK:
                predictor = _get_predictor()
                predictor.set_image(image_arr)
                masks, scores, _ = predictor.predict(
                    point_coords=point_coords,
                    point_labels=point_labels,
                    multimask_output=multimask,
                )
            # 取置信度最高的 mask
            idx = int(np.argmax(scores)) if len(scores) > 1 else 0
            mask = (masks[idx] > 0).astype(np.uint8)
            h, w = mask.shape
            return jsonify(
                ok=True,
                width=w,
                height=h,
                mask_image=_mask_to_b64(mask),
                mask=(mask.flatten().tolist() if w * h < 400_000 else None),  # 大图不返回 1D 数组
                score=float(scores[idx]),
            )
        except Exception as e:  # noqa
            return jsonify(ok=False, error=str(e))


def apply_sam_mask_to_alpha(alpha: np.ndarray, sam_mask_b64: str) -> np.ndarray:
    """
    融合：现有 u2net 的 alpha 与 SAM 的二值 mask 取交集式约束。
    - 仅在 SAM 前景区域内的 u2net 像素保留；
    - SAM 明确为前景(1) 的区域，即使 u2net 偏弱也补强；
    - SAM 明确为背景(0) 的区域，强制清零（剔除误留背景）。
    返回新的 alpha（uint8, 0~255，尺寸与 alpha 一致，需调用方先 resize 对齐）。
    """
    sam_mask = (cv2.resize(_b64_to_array(sam_mask_b64), (alpha.shape[1], alpha.shape[0])) > 127).astype(np.uint8)
    out = alpha.copy()
    out[sam_mask == 0] = 0                      # SAM 判定为背景 → 清掉
    # SAM 前景且 u2net 也有一点点 → 保留并拉满，消除半透明残边
    out[(sam_mask == 1) & (alpha > 10)] = 255
    return out
