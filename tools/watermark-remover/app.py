# -*- coding: utf-8 -*-
"""
图片 / 视频去水印工具 - 后端服务
修复算法：Telea / Navier-Stokes（含边缘羽化）+ 泊松融合（seamlessClone）
支持图片单张 / 批量处理（打包 ZIP），视频逐帧修复并保留原音轨
"""
import os
import base64
import subprocess
import threading
import time
import uuid
import zipfile

import cv2
import numpy as np
from flask import Flask, Blueprint, jsonify, request, send_from_directory, render_template

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
RESULT_DIR = os.path.join(BASE_DIR, "results")
WM_PORT = int(os.environ.get("WM_PORT", "5001"))
BASE_PATH = os.environ.get("WM_BASE_PATH", "").rstrip("/")
ALLOWED_EXT = {"png", "jpg", "jpeg", "webp", "bmp"}
ALLOWED_VIDEO_EXT = {"mp4", "mov", "avi", "webm", "mkv"}
MAX_CONTENT_LENGTH = 500 * 1024 * 1024  # 500MB（视频上传）
MAX_BATCH_SIZE = 20                    # 单次批量最多 20 张

# 视频任务状态（内存存储，重启即清空）
VIDEO_TASKS = {}
_tasks_lock = threading.Lock()

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(RESULT_DIR, exist_ok=True)  # 关键：原代码漏建 results 目录，imwrite 会失败

app = Flask(__name__,
             static_url_path=f"{BASE_PATH}/static",
             static_folder="static",
             template_folder="templates")
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH

bp = Blueprint("wm", __name__, url_prefix=BASE_PATH or None)


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXT


def read_image_from_request(file_storage) -> np.ndarray:
    """将上传的文件读取为 OpenCV 图像（BGR）。"""
    data = np.frombuffer(file_storage.read(), np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("无法解析图片文件")
    return img


def prepare_mask(mask: np.ndarray, shape) -> np.ndarray:
    """将蒙版调整为目标尺寸、二值化并膨胀以完全覆盖水印（避免笔画内部空洞）。"""
    if mask.shape[:2] != shape[:2]:
        mask = cv2.resize(mask, (shape[1], shape[0]),
                          interpolation=cv2.INTER_NEAREST)
    _, mask = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY)
    # 加强膨胀：5x5×3次，确保填满笔画内部空隙
    kernel = np.ones((5, 5), np.uint8)
    return cv2.dilate(mask, kernel, iterations=3)


def feather_edges(img: np.ndarray, res: np.ndarray, mask: np.ndarray,
                  sigma: float = 2.0) -> np.ndarray:
    """羽化修复区域边缘，使修复区与原图过渡自然，减轻"补丁感"。"""
    soft = cv2.GaussianBlur(mask.astype(np.float32) / 255.0, (0, 0), sigma)
    soft = soft[..., None]
    out = res.astype(np.float32) * soft + img.astype(np.float32) * (1.0 - soft)
    return out.astype(np.uint8)


def poisson_blend(src: np.ndarray, dst: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """泊松融合：以 inpaint 结果为源，与原图做无缝克隆，边缘几乎无痕。"""
    h, w = mask.shape[:2]
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return src
    margin = 8
    # 蒙版贴近图像边缘时 seamlessClone 不稳定，回退为 inpaint 原始结果
    if (xs.min() < margin or ys.min() < margin
            or xs.max() > w - margin or ys.max() > h - margin):
        return src
    try:
        center = (int(xs.mean()), int(ys.mean()))
        # NORMAL_CLONE：完全采用修复内容并做边界融合；
        # MIXED_CLONE 会保留原图高梯度特征（水印文字），导致残留
        return cv2.seamlessClone(src, dst, mask, center, cv2.NORMAL_CLONE)
    except cv2.error:
        return src


def match_texture(img: np.ndarray, res: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """让修复区的噪点强度与周围区域匹配，避免修复区过于光滑产生塑料感。"""
    ring = cv2.dilate(mask, np.ones((21, 21), np.uint8), iterations=1) - mask
    rb = ring > 0
    if rb.sum() < 100:
        return res
    blur = cv2.GaussianBlur(img, (0, 0), 3)
    hp = img.astype(np.float32) - blur.astype(np.float32)
    std = float(hp[rb].std())
    if std < 1.5:  # 周围本身平滑，无需加噪
        return res
    res_hp = res.astype(np.float32) - cv2.GaussianBlur(res, (0, 0), 3).astype(np.float32)
    inner = res_hp[mask > 0]
    inner_std = float(inner.std()) if inner.size else 0.0
    need = max(std - inner_std, 0.0)
    if need < 1.0:
        return res
    need = min(need, 12.0)  # 限制噪声强度上限，避免彩色区域过度加噪导致马赛克
    noise = np.random.normal(0, need, res.shape).astype(np.float32)
    m = mask > 0
    out = res.astype(np.float32)
    out[m] += noise[m]
    return np.clip(out, 0, 255).astype(np.uint8)


def enhance_result(img: np.ndarray, mask: np.ndarray,
                   algorithm: str, radius: int) -> np.ndarray:
    """按所选算法执行修复，并统一做纹理匹配增强。"""
    if algorithm == "poisson":
        base = cv2.inpaint(img, mask, radius, cv2.INPAINT_TELEA)
        res = poisson_blend(base, img, mask)
    else:
        flag = cv2.INPAINT_TELEA if algorithm == "telea" else cv2.INPAINT_NS
        res = cv2.inpaint(img, mask, radius, flag)
    return match_texture(img, res, mask)


def parse_params() -> tuple:
    algorithm = request.form.get("algorithm", "poisson")  # poisson | telea | ns
    radius = int(request.form.get("radius", 5))
    radius = max(1, min(radius, 30))
    return algorithm, radius


def img_to_data_uri(img: np.ndarray) -> str:
    """将 OpenCV 图像编码为 PNG 的 data URI，直接随接口返回，
    避免写盘 + 再单独请求结果图（旧方式曾因 imwrite 静默失败导致结果图 404、前端“点击无反应”）。"""
    ok, buf = cv2.imencode(".png", img)
    if not ok:
        raise RuntimeError("结果图像编码失败")
    return "data:image/png;base64," + base64.b64encode(buf).decode("ascii")


def read_mask_from_request(target_shape) -> np.ndarray:
    mask_data = np.frombuffer(request.files["mask"].read(), np.uint8)
    mask = cv2.imdecode(mask_data, cv2.IMREAD_GRAYSCALE)
    if mask is None:
        raise ValueError("蒙版解析失败")
    mask = prepare_mask(mask, target_shape)
    if int(mask.sum()) == 0:
        raise ValueError("请先用笔刷涂抹水印区域")
    return mask


@bp.route("/")
def index():
    return render_template("index.html", base_path=BASE_PATH)


@bp.route("/api/wm-status", methods=["GET"])
def wm_status():
    """健康检查：供前端 iframe 内判断后端是否在线。"""
    return jsonify({"ok": True})


@bp.route("/api/remove", methods=["POST"])
def remove_watermark():
    """单张去水印：接收原图与蒙版，返回修复结果。"""
    if "image" not in request.files or "mask" not in request.files:
        return jsonify({"ok": False, "error": "缺少图片或蒙版文件"}), 400

    image_file = request.files["image"]
    if image_file.filename == "" or not allowed_file(image_file.filename):
        return jsonify({"ok": False, "error": "不支持的图片格式"}), 400

    try:
        img = read_image_from_request(image_file)
        algorithm, radius = parse_params()
        mask = read_mask_from_request(img.shape)
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400

    result = enhance_result(img, mask, algorithm, radius)

    return jsonify({
        "ok": True,
        "result_url": img_to_data_uri(result),
        "width": int(img.shape[1]),
        "height": int(img.shape[0]),
    })


@bp.route("/api/remove-batch", methods=["POST"])
def remove_watermark_batch():
    """批量去水印：每张图片对应一个蒙版（前端逐张生成），结果打包 ZIP。"""
    images = request.files.getlist("images")
    masks = request.files.getlist("masks")
    if not images:
        return jsonify({"ok": False, "error": "缺少图片文件"}), 400
    if len(masks) != len(images):
        return jsonify({"ok": False, "error": "图片与蒙版数量不一致"}), 400
    if len(images) > MAX_BATCH_SIZE:
        return jsonify({"ok": False, "error": f"单次最多处理 {MAX_BATCH_SIZE} 张图片"}), 400

    algorithm, radius = parse_params()
    batch_id = uuid.uuid4().hex[:10]
    results, zip_entries = [], []

    for idx, f in enumerate(images):
        if f.filename == "" or not allowed_file(f.filename):
            continue
        try:
            img = read_image_from_request(f)
        except ValueError:
            continue
        mask_raw = cv2.imdecode(
            np.frombuffer(masks[idx].read(), np.uint8),
            cv2.IMREAD_GRAYSCALE)
        if mask_raw is None:
            continue
        mask = prepare_mask(mask_raw, img.shape)
        if int(mask.sum()) == 0:
            continue
        res = enhance_result(img, mask, algorithm, radius)
        out_name = f"{batch_id}_{idx:02d}.png"
        cv2.imwrite(os.path.join(RESULT_DIR, out_name), res)
        results.append({
            "name": f.filename,
            "url": img_to_data_uri(res),
            "width": int(img.shape[1]),
            "height": int(img.shape[0]),
        })
        zip_entries.append((out_name, f.filename))

    if not results:
        return jsonify({"ok": False, "error": "没有可处理的图片"}), 400

    zip_name = f"{batch_id}_clean.zip"
    zip_path = os.path.join(RESULT_DIR, zip_name)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, (out_name, orig_name) in enumerate(zip_entries, 1):
            stem = os.path.splitext(os.path.basename(orig_name))[0]
            zf.write(os.path.join(RESULT_DIR, out_name),
                     arcname=f"{i:02d}_去水印_{stem}.png")

    return jsonify({
        "ok": True,
        "count": len(results),
        "results": results,
        "zip_url": f"{BASE_PATH}/results/{zip_name}",
    })


def finalize_video(video_no_audio: str, source_video: str, out_path: str) -> bool:
    """将无声修复视频重编码为浏览器兼容的 H.264，并合并原音轨（无音轨则仅视频）。"""
    try:
        probe = subprocess.run(
            ["ffmpeg", "-i", source_video],
            capture_output=True, text=True, timeout=30)
        has_audio = "Audio:" in probe.stderr
        cmd = ["ffmpeg", "-y", "-i", video_no_audio]
        if has_audio:
            cmd += ["-i", source_video, "-map", "0:v:0", "-map", "1:a:0?"]
        else:
            cmd += ["-map", "0:v:0", "-an"]
        cmd += ["-c:v", "libopenh264", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-shortest", out_path]
        subprocess.run(cmd, capture_output=True, timeout=600, check=True)
        return True
    except (subprocess.SubprocessError, OSError):
        return False


def expand_to_band(mask: np.ndarray, shape) -> np.ndarray:
    """浮动水印模式：将涂抹区域沿其靠近的边缘扩展为贯穿整条带，逐帧覆盖游动的水印。"""
    h, w = shape[:2]
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return mask
    top_r, bot_r = ys.min() / h, 1 - ys.max() / h
    left_r, right_r = xs.min() / w, 1 - xs.max() / w
    band = mask.copy()
    if min(top_r, bot_r) < 0.20:
        if top_r <= bot_r:
            band[0:int(h * 0.22), :] = 255
        else:
            band[int(h * 0.78):, :] = 255
    elif min(left_r, right_r) < 0.20:
        if left_r <= right_r:
            band[:, 0:int(w * 0.22)] = 255
        else:
            band[:, int(w * 0.78):] = 255
    return band


def auto_detect_video(video_path):
    """帧间梯度累积法自动检测视频水印位置（无监督，无需外部模板）。"""
    cap = cv2.VideoCapture(video_path)
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    h, w = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)), int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    acc = np.zeros((h, w), np.float32)
    count = 0
    step = max(1, n // 30)  # 均匀采样 30 帧
    for i in range(0, n, step):
        cap.set(cv2.CAP_PROP_POS_FRAMES, i)
        ok, frame = cap.read()
        if not ok:
            break
        g = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        edge = cv2.Canny(g, 50, 150).astype(np.float32)
        acc += edge
        count += 1
    cap.release()
    if count < 3:
        return None
    acc /= count
    _, mask = cv2.threshold(acc, max(acc.mean() * 1.8, 5), 255, cv2.THRESH_BINARY)
    mask = mask.astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    # 只保留四角区域的连通域
    corner = np.zeros((h, w), np.uint8)
    corner[:int(h * 0.28), :] = 255
    corner[int(h * 0.72):, :] = 255
    corner[:, :int(w * 0.28)] = 255
    corner[:, int(w * 0.72):] = 255
    mask = cv2.bitwise_and(mask, corner)
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    big = max(cnts, key=cv2.contourArea)
    if cv2.contourArea(big) < 80:
        return None
    final = np.zeros((h, w), np.uint8)
    cv2.drawContours(final, [big], -1, 255, -1)
    final = cv2.dilate(final, np.ones((5, 5), np.uint8), iterations=2)
    return final


def _score_position(cx, cy, ww, wh):
    """给候选区域的位置打分：四角、顶部、底部、边缘更可能是水印。"""
    in_corner = (cx < ww * 0.18 and cy < wh * 0.18) or \
                (cx > ww * 0.82 and cy < wh * 0.18) or \
                (cx < ww * 0.18 and cy > wh * 0.82) or \
                (cx > ww * 0.82 and cy > wh * 0.82)
    in_top = cy < wh * 0.15
    in_bottom = cy > wh * 0.85
    in_edge = min(cx, ww - cx, cy, wh - cy) < ww * 0.06
    score = 0
    if in_corner: score += 40
    if in_top: score += 20
    if in_bottom: score += 25
    if in_edge: score += 10
    return score, in_corner, in_top, in_bottom, in_edge


def _detect_corner_badges(gray, wh, ww):
    """检测四角的半透明圆角矩形 badge（如左上角「AI生成」）。
    基于 Canny 边缘 + 矩形拟合，只返回最像 badge 的 1~2 个候选。
    """
    roi = np.zeros((wh, ww), np.uint8)
    mx = int(ww * 0.18)
    my = int(wh * 0.18)
    roi[:my, :mx] = 255
    roi[:my, ww - mx:] = 255
    roi[wh - my:, :mx] = 255
    roi[wh - my:, ww - mx:] = 255

    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 25, 75)
    edges = cv2.bitwise_and(edges, roi)
    # 连接 badge 圆角处可能断裂的边缘
    edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))

    cnts, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    candidates = []
    for c in cnts:
        area = cv2.contourArea(c)
        if area < 80 or area > ww * wh * 0.015:
            continue
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.08 * peri, True)
        x, y, bw, bh = cv2.boundingRect(approx)
        if bw < 20 or bh < 10 or bw > ww * 0.25 or bh > wh * 0.15:
            continue
        ratio = bw / max(bh, 1)
        if not (1.5 < ratio < 10):
            continue
        rect_area = bw * bh
        if rect_area <= 0 or area / rect_area < 0.30:
            continue
        hull = cv2.convexHull(c)
        hull_area = cv2.contourArea(hull)
        if hull_area <= 0 or area / hull_area < 0.55:
            continue
        cx, cy = x + bw / 2, y + bh / 2
        # 必须严格贴近角落（到最近边缘的距离 < 短边 10%）
        corner_dist = min(cx, ww - cx, cy, wh - cy)
        if corner_dist > min(ww, wh) * 0.10:
            continue
        c_mask = np.zeros((wh, ww), np.uint8)
        cv2.drawContours(c_mask, [hull], -1, 255, -1)
        ring = cv2.dilate(c_mask, np.ones((7, 7), np.uint8), iterations=1) - c_mask
        contrast = 0.0
        if c_mask.sum() > 0 and ring.sum() > 0:
            inner_mean = float(gray[c_mask > 0].mean())
            ring_mean = float(gray[ring > 0].mean())
            contrast = abs(inner_mean - ring_mean)
            if contrast < 3:
                continue
        # 打分：对比度越高、越贴角、面积适中，越可能是 badge
        score = contrast * 2.0 + (min(ww, wh) * 0.10 - corner_dist) * 0.15 + area / 800.0
        candidates.append((score, hull))

    if not candidates:
        return None
    candidates.sort(reverse=True, key=lambda x: x[0])
    mask = np.zeros((wh, ww), np.uint8)
    for _, hull in candidates[:2]:
        cv2.drawContours(mask, [hull], -1, 255, -1)
    return mask


def _detect_text_blocks(gray, wh, ww):
    """在很窄的边缘带检测半透明/小字文字块，避免把天空/纹理误判为水印。"""
    edge = np.zeros((wh, ww), np.uint8)
    edge[:int(wh * 0.10), :] = 255
    edge[int(wh * 0.90):, :] = 255
    edge[:, :int(ww * 0.10)] = 255
    edge[:, int(ww * 0.90):] = 255

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    blurred = cv2.GaussianBlur(enhanced, (0, 0), 1.5)
    sharpened = cv2.addWeighted(enhanced, 1.4, blurred, -0.4, 0)

    kernel_h = cv2.getStructuringElement(cv2.MORPH_RECT, (13, 5))
    top_hat = cv2.morphologyEx(sharpened, cv2.MORPH_TOPHAT, kernel_h)
    black_hat = cv2.morphologyEx(sharpened, cv2.MORPH_BLACKHAT, kernel_h)
    _, top_bin = cv2.threshold(top_hat, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    _, black_bin = cv2.threshold(black_hat, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    text_mask = cv2.bitwise_or(top_bin, black_bin)
    text_mask = cv2.bitwise_and(text_mask, edge)
    text_mask = cv2.morphologyEx(text_mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))

    mser = cv2.MSER_create()
    try:
        regions, _ = mser.detectRegions(sharpened)
    except cv2.error:
        regions = []
    mser_mask = np.zeros((wh, ww), np.uint8)
    for region in regions:
        hull = cv2.convexHull(region.reshape(-1, 1, 2))
        area = cv2.contourArea(hull)
        if area < 40 or area > 15000:
            continue
        x, y, bw, bh = cv2.boundingRect(hull)
        if bw < 10 or bh < 5 or bw > ww * 0.30 or bh > wh * 0.20:
            continue
        ratio = bw / max(bh, 1)
        if not (0.3 < ratio < 10):
            continue
        cx, cy = x + bw / 2, y + bh / 2
        pos_score, *_ = _score_position(cx, cy, ww, wh)
        if pos_score < 25:
            continue
        cv2.drawContours(mser_mask, [hull], -1, 255, -1)

    return cv2.bitwise_or(text_mask, mser_mask)


def _detect_bottom_banners(gray, wh, ww):
    """检测顶部/底部半透明横幅条带。"""
    band_mask = np.zeros((wh, ww), np.uint8)
    if wh < 40 or ww < 40:
        return band_mask

    band_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (ww // 4, 7))
    band_hat = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, band_kernel)
    _, band_bin = cv2.threshold(band_hat, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    band_region = np.zeros((wh, ww), np.uint8)
    band_region[:int(wh * 0.18), :] = 255
    band_region[int(wh * 0.82):, :] = 255
    band_mask = cv2.bitwise_and(band_bin, band_region)

    # 兜底：按行均值偏移检测低对比度半透明条带
    row_mean = gray.mean(axis=1).astype(np.float32)
    row_std = gray.std(axis=1).astype(np.float32)
    bottom_h = int(wh * 0.22)
    if wh > bottom_h:
        upper_mean = float(row_mean[:wh - bottom_h].mean())
    else:
        upper_mean = float(row_mean.mean())
    band_y = np.zeros((wh,), np.uint8)
    for y in range(wh - bottom_h, wh):
        diff = abs(float(row_mean[y]) - upper_mean)
        if diff > 5 and float(row_std[y]) < 55:
            band_y[y] = 255
    if band_y.sum() > 0:
        ys = np.where(band_y)[0]
        segments = []
        start = ys[0]
        prev = ys[0]
        for y in ys[1:]:
            if y == prev + 1:
                prev = y
            else:
                segments.append((start, prev))
                start = prev = y
        segments.append((start, prev))
        for s, e in segments:
            if e - s + 1 >= 3:
                band_mask[max(s, wh - bottom_h):e+1, :] = 255
    return band_mask


def auto_detect_image(img: np.ndarray) -> np.ndarray:
    """图片自动检测：优先识别四角半透明圆角矩形 badge（如 AI生成），
    未命中时再回退到文字块/横幅检测。返回与 img 等大的二值蒙版；未检测到返回 None。
    """
    h, w = img.shape[:2]
    min_dim = min(h, w)
    if min_dim < 64:
        return None

    scale = 1.0
    work = img.copy()
    if min_dim > 1024:
        scale = 1024.0 / min_dim
        work = cv2.resize(work, (int(w * scale), int(h * scale)))
    wh, ww = work.shape[:2]
    img_area = wh * ww

    gray = cv2.cvtColor(work, cv2.COLOR_BGR2GRAY)

    # 1) 优先检测四角 badge
    badge_mask = _detect_corner_badges(gray, wh, ww)
    if badge_mask is not None and int(badge_mask.sum()) > 0:
        final_mask = cv2.dilate(badge_mask, np.ones((25, 25), np.uint8), iterations=2)
        if scale < 1.0:
            final_mask = cv2.resize(final_mask, (w, h), interpolation=cv2.INTER_NEAREST)
            final_mask = cv2.dilate(final_mask, np.ones((15, 15), np.uint8), iterations=2)
        if int(final_mask.sum()) / 255 <= h * w * 0.05:
            return final_mask

    # 2) 回退：文字/横幅检测
    text_mask = _detect_text_blocks(gray, wh, ww)
    band_mask = _detect_bottom_banners(gray, wh, ww)
    combined = cv2.bitwise_or(text_mask, band_mask)
    combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))

    cnts, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates = []
    for c in cnts:
        area = cv2.contourArea(c)
        if area < 80 or area > img_area * 0.05:
            continue
        x, y, bw, bh = cv2.boundingRect(c)
        if bw < 12 or bh < 8:
            continue
        cx, cy = x + bw / 2, y + bh / 2
        ratio = bw / max(bh, 1)
        pos_score, in_corner, in_top, in_bottom, in_edge = _score_position(cx, cy, ww, wh)

        shape_score = 0
        if 0.3 < ratio < 10:
            shape_score += 15
        if in_bottom and bw > ww * 0.20 and bh < wh * 0.12:
            shape_score += 30
        if in_top and bw < ww * 0.28 and bh < wh * 0.08:
            shape_score += 15
        if in_corner and bw < ww * 0.25 and bh < wh * 0.12:
            shape_score += 10

        c_mask = np.zeros((wh, ww), np.uint8)
        cv2.drawContours(c_mask, [c], -1, 255, -1)
        ring = cv2.dilate(c_mask, np.ones((7, 7), np.uint8), iterations=1) - c_mask
        contrast_score = 0
        if c_mask.sum() > 0 and ring.sum() > 0:
            inner_mean = float(gray[c_mask > 0].mean())
            ring_mean = float(gray[ring > 0].mean())
            contrast_score = min(abs(inner_mean - ring_mean), 60)

        total_score = pos_score + shape_score + contrast_score
        if total_score < 60:
            continue
        candidates.append((total_score, area, c))

    if not candidates:
        return None

    candidates.sort(reverse=True, key=lambda x: x[0])
    final_mask = np.zeros((wh, ww), np.uint8)
    total_area = 0
    for score, area, c in candidates:
        if total_area + area > img_area * 0.08:
            break
        cv2.drawContours(final_mask, [c], -1, 255, -1)
        total_area += area

    if int(final_mask.sum()) == 0:
        return None

    final_mask = cv2.dilate(final_mask, np.ones((25, 25), np.uint8), iterations=2)

    if scale < 1.0:
        final_mask = cv2.resize(final_mask, (w, h), interpolation=cv2.INTER_NEAREST)
        final_mask = cv2.dilate(final_mask, np.ones((9, 9), np.uint8), iterations=2)

    if int(final_mask.sum()) / 255 > h * w * 0.10:
        return None
    return final_mask


def auto_detect_video(task_id: str, video_path: str, mask_raw: np.ndarray,
                       algorithm: str, radius: int, orig_name: str, mode: str = "fixed"):
    """后台线程：逐帧修复视频水印并更新进度。"""
    task = VIDEO_TASKS[task_id]
    noaudio_path = os.path.join(RESULT_DIR, f"{task_id}_noaudio.mp4")
    try:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError("无法解析视频文件")
        fps = cap.get(cv2.CAP_PROP_FPS)
        if not fps or fps <= 1 or fps > 120:
            fps = 25.0
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0

        if mode == "auto":
            mask = auto_detect_video(video_path)
            if mask is None or int(mask.sum()) == 0:
                raise ValueError("未在画面四角检测到明显水印，请切换到手绘涂抹模式")
        else:
            mask = prepare_mask(mask_raw, (h, w))
            if mode == "floating":
                mask = expand_to_band(mask, (h, w))
        if int(mask.sum()) == 0:
            raise ValueError("蒙版为空，无法处理")

        writer = cv2.VideoWriter(
            noaudio_path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
        if not writer.isOpened():
            raise ValueError("视频编码器初始化失败")

        task["total"] = total
        done = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            writer.write(enhance_result(frame, mask, algorithm, radius))
            done += 1
            if total > 0:
                task["progress"] = min(99, int(done * 100 / total))
            if done % 30 == 0:
                task["frames"] = done
        cap.release()
        writer.release()

        if done == 0:
            raise ValueError("视频中没有可处理的帧")

        final_name = f"{task_id}.mp4"
        final_path = os.path.join(RESULT_DIR, final_name)
        if not finalize_video(noaudio_path, video_path, final_path):
            os.replace(noaudio_path, final_path)
        elif os.path.exists(noaudio_path):
            os.remove(noaudio_path)

        task.update({
            "status": "done",
            "progress": 100,
            "result_url": f"{BASE_PATH}/results/{final_name}",
            "name": orig_name,
        })
    except Exception as e:  # noqa: BLE001 - 任务内任何异常都需回传给前端
        task.update({"status": "error", "error": str(e)})
        if os.path.exists(noaudio_path):
            os.remove(noaudio_path)
    finally:
        if os.path.exists(video_path):
            os.remove(video_path)


@bp.route("/api/video/remove", methods=["POST"])
def remove_video_watermark():
    """创建视频去水印任务：保存视频与蒙版，后台逐帧修复，返回任务 ID。"""
    if "video" not in request.files:
        return jsonify({"ok": False, "error": "缺少视频文件"}), 400

    video_file = request.files["video"]
    ext = video_file.filename.rsplit(".", 1)[-1].lower() if "." in video_file.filename else ""
    if video_file.filename == "" or ext not in ALLOWED_VIDEO_EXT:
        return jsonify({"ok": False, "error": "不支持的视频格式（支持 MP4/MOV/AVI/WebM/MKV）"}), 400

    mode = request.form.get("mode", "fixed")
    mask_raw = None
    if mode != "auto":
        if "mask" not in request.files:
            return jsonify({"ok": False, "error": "缺少蒙版文件"}), 400
        mask_raw = cv2.imdecode(
            np.frombuffer(request.files["mask"].read(), np.uint8),
            cv2.IMREAD_GRAYSCALE)
        if mask_raw is None:
            return jsonify({"ok": False, "error": "蒙版解析失败"}), 400

    algorithm, radius = parse_params()

    task_id = uuid.uuid4().hex[:12]
    video_path = os.path.join(UPLOAD_DIR, f"{task_id}.{ext}")
    video_file.save(video_path)

    with _tasks_lock:
        VIDEO_TASKS[task_id] = {
            "status": "processing", "progress": 0,
            "total": 0, "frames": 0,
        }
    threading.Thread(
        target=process_video_task,
        args=(task_id, video_path, mask_raw, algorithm, radius, video_file.filename, mode),
        daemon=True).start()

    return jsonify({"ok": True, "task_id": task_id})


@bp.route("/api/video/status/<task_id>")
def video_task_status(task_id):
    task = VIDEO_TASKS.get(task_id)
    if not task:
        return jsonify({"ok": False, "error": "任务不存在或已过期"}), 404
    return jsonify({"ok": True, **task})


@bp.route("/results/<path:filename>")
def serve_result(filename):
    return send_from_directory(RESULT_DIR, filename)


@app.errorhandler(413)
def too_large(_e):
    return jsonify({"ok": False, "error": "图片过大，请压缩后再试"}), 413


# ====== 自动检测去水印（无需手动涂抹） ======
@bp.route("/api/detect", methods=["POST"])
def auto_detect_remove():
    """自动检测图片/视频中的水印并去除。"""
    if "image" not in request.files:
        return jsonify({"ok": False, "error": "缺少图片"}), 400
    image_file = request.files["image"]
    if image_file.filename == "" or not allowed_file(image_file.filename):
        return jsonify({"ok": False, "error": "不支持的图片格式"}), 400
    try:
        img = read_image_from_request(image_file)
        algorithm, radius = parse_params()
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    mask = auto_detect_image(img)
    if mask is None:
        return jsonify({"ok": False, "error": "未在画面四角检测到明显水印，请切换到手绘涂抹模式"}), 400
    result = enhance_result(img, mask, algorithm, radius)
    return jsonify({
        "ok": True,
        "result_url": img_to_data_uri(result),
        "width": int(img.shape[1]),
        "height": int(img.shape[0]),
    })


app.register_blueprint(bp)


if __name__ == "__main__":
    # 仅本机监听，配合工具箱 Node 服务以 iframe 嵌入；端口可由 WM_PORT 覆盖
    # 生产环境通过 Nginx 反代 /watermark-remover/ 到本端口
    app.run(host="127.0.0.1", port=WM_PORT, debug=False, use_reloader=False)
