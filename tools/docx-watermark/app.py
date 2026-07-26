# -*- coding: utf-8 -*-
"""
Word 图片导出 + 批量自定义水印 - 后端服务

设计：docx 本质是一个 zip 包，内嵌图片都在 word/media/ 目录下。
本后端只用 标准库(zipfile/base64/io/xml/json/re) + Flask 处理上传的 .docx：
- /api/extract：解包并返回 word/media/ 下图片的 data URI
- /api/rebuild：接收原始 docx + 需要替换的图片映射，把处理过的图片
  重新塞回 docx，返回新的 Word 文档
水印绘制全在浏览器端 Canvas 完成，本服务不依赖字体/渲染。

启动：由工具箱 Node 主服务以子进程方式拉起（端口 DOCX_PORT，默认 5002），
并经反向代理以同源 /docx-watermark/ 暴露给前端 iframe。
"""
import io
import os
import re
import json
import base64
import zipfile

from flask import Flask, Blueprint, jsonify, request, render_template, send_file

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOCX_PORT = int(os.environ.get("DOCX_PORT", "5002"))
BASE_PATH = os.environ.get("DOCX_BASE_PATH", "").rstrip("/")
# 生成新 docx 时会重新上传原始 docx + base64 图片，base64 会让体积膨胀约 33%，
# 所以上限需要和去水印视频保持一致（默认 500MB，可通过环境变量覆盖）。
MAX_CONTENT_LENGTH = int(os.environ.get("DOCX_MAX_CONTENT_LENGTH", str(500 * 1024 * 1024)))

# 常见内嵌图片扩展名 → MIME（emf/wmf 是矢量图，浏览器无法预览，但一并导出）
_MIME = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "bmp": "image/bmp",
    "tiff": "image/tiff",
    "tif": "image/tiff",
    "webp": "image/webp",
    "svg": "image/svg+xml",
    "emf": "image/emf",
    "wmf": "image/wmf",
}

app = Flask(__name__,
             static_url_path=f"{BASE_PATH}/static",
             static_folder="static",
             template_folder="templates")
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH
# replacements 是 base64 JSON 字符串（可能几十 MB），默认 500KB 表单内存上限会误报 413
app.config["MAX_FORM_MEMORY_SIZE"] = 50 * 1024 * 1024

bp = Blueprint("docx", __name__, url_prefix=BASE_PATH or None)


def _mime_for(name: str) -> str:
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    return _MIME.get(ext, "application/octet-stream")


@bp.route("/")
def index():
    return render_template("index.html", base_path=BASE_PATH)


@bp.route("/api/docx-status", methods=["GET"])
def docx_status():
    """健康检查：供前端 iframe 判断后端是否在线。"""
    return jsonify({"ok": True})


@bp.route("/api/extract", methods=["POST"])
def extract_images():
    """接收上传的 .docx，抽取 word/media/ 下所有图片，返回 data URI 列表。"""
    if "docx" not in request.files:
        return jsonify({"ok": False, "error": "缺少 docx 文件"}), 400

    f = request.files["docx"]
    if not f.filename or not f.filename.lower().endswith(".docx"):
        return jsonify({"ok": False, "error": "请上传 .docx 格式的 Word 文档（.doc 需先在 Word 中另存为 .docx）"}), 400

    data = f.read()
    # docx 是 zip，文件头应为 PK
    if data[:2] != b"PK":
        return jsonify({"ok": False, "error": "文件不是有效的 docx（zip）格式"}), 400

    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        return jsonify({"ok": False, "error": "无法解压该 docx 文件，可能已损坏"}), 400

    images = []
    with zf:
        for name in zf.namelist():
            if not name.startswith("word/media/") or name.endswith("/"):
                continue
            bn = os.path.basename(name)
            ext = bn.rsplit(".", 1)[-1].lower() if "." in bn else ""
            if ext not in _MIME:
                continue
            raw = zf.read(name)
            if not raw:
                continue
            b64 = base64.b64encode(raw).decode("ascii")
            mime = _MIME[ext]
            images.append({
                "index": len(images),
                "name": bn,
                "mime": mime,
                "data_uri": "data:%s;base64,%s" % (mime, b64),
                "size": len(raw),
            })

    if not images:
        return jsonify({"ok": False, "error": "该文档中没有找到内嵌图片（word/media/ 为空）"}), 400

    return jsonify({"ok": True, "count": len(images), "images": images})


@bp.route("/api/rebuild", methods=["POST"])
def rebuild_docx():
    """
    接收原始 docx + replacements 映射（文件名 -> data URI），
    把 word/media/ 中的指定图片替换后返回新的 docx。
    输出格式：png（默认）或 jpeg（原图为 jpeg 时保持）。
    """
    if "docx" not in request.files:
        return jsonify({"ok": False, "error": "缺少 docx 文件"}), 400

    f = request.files["docx"]
    if not f.filename or not f.filename.lower().endswith(".docx"):
        return jsonify({"ok": False, "error": "请上传 .docx 文件"}), 400

    replacements_raw = request.form.get("replacements", "{}")
    try:
        replacements = json.loads(replacements_raw)
    except json.JSONDecodeError:
        return jsonify({"ok": False, "error": "replacements 参数不是合法 JSON"}), 400

    if not isinstance(replacements, dict) or not replacements:
        return jsonify({"ok": False, "error": "replacements 为空或格式错误"}), 400

    data = f.read()
    if data[:2] != b"PK":
        return jsonify({"ok": False, "error": "文件不是有效的 docx（zip）格式"}), 400

    try:
        zin = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        return jsonify({"ok": False, "error": "无法解压该 docx 文件"}), 400

    # 决定每个替换图片的新文件名与 MIME，并解码二进制
    name_map = {}       # old_name -> new_name
    mime_map = {}       # new_name -> mime
    binary_map = {}     # new_name -> bytes
    for old_name, data_uri in replacements.items():
        if not isinstance(data_uri, str) or "," not in data_uri:
            continue
        _, b64 = data_uri.split(",", 1)
        try:
            raw = base64.b64decode(b64)
        except Exception:
            continue
        old_ext = old_name.rsplit(".", 1)[-1].lower() if "." in old_name else "png"
        # jpeg 保持 jpeg，其余统一输出 png（canvas 最稳）
        if old_ext in ("jpg", "jpeg"):
            new_ext, mime = "jpg", "image/jpeg"
        else:
            new_ext, mime = "png", "image/png"
        base = old_name.rsplit(".", 1)[0] if "." in old_name else old_name
        new_name = f"{base}.{new_ext}"
        name_map[old_name] = new_name
        mime_map[new_name] = mime
        binary_map[new_name] = raw

    if not binary_map:
        return jsonify({"ok": False, "error": "没有可替换的图片数据"}), 400

    zout = io.BytesIO()
    zfout = zipfile.ZipFile(zout, "w", zipfile.ZIP_DEFLATED)

    for item in zin.infolist():
        name = item.filename
        raw = zin.read(name)
        bn = os.path.basename(name)

        # 被替换的图片：写新文件（跳过旧文件）
        if name.startswith("word/media/") and bn in replacements:
            new_name = name_map[bn]
            zfout.writestr(f"word/media/{new_name}", binary_map[new_name])
            continue

        # [Content_Types].xml：更新 Override 的 PartName 和 ContentType
        if name == "[Content_Types].xml":
            text = raw.decode("utf-8")
            for old_name, new_name in name_map.items():
                # 更新 PartName="/word/media/旧名" 为新的，并同步更新 ContentType
                text = re.sub(
                    r'(<Override[^>]*PartName="/word/media/)' + re.escape(old_name) + r'("[^>]*?ContentType=")[^"]+("[^>]*>)',
                    r'\1' + new_name + r'\2' + mime_map[new_name] + r'\3',
                    text,
                    flags=re.S,
                )
            zfout.writestr(name, text.encode("utf-8"))
            continue

        # .rels 关系文件：更新 Target 指向的新文件名
        if name.endswith(".rels"):
            text = raw.decode("utf-8")
            for old_name, new_name in name_map.items():
                text = text.replace(old_name, new_name)
            zfout.writestr(name, text.encode("utf-8"))
            continue

        # 其他文件原样复制
        zfout.writestr(item, raw)

    zin.close()
    zfout.close()
    zout.seek(0)

    safe_name = re.sub(r'[\\/:*?"<>|]', "_", f.filename)
    base, _ = os.path.splitext(safe_name)
    download_name = f"{base}_watermarked.docx"
    return send_file(
        zout,
        mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        as_attachment=True,
        download_name=download_name,
    )


@app.errorhandler(413)
def too_large(_e):
    mb = MAX_CONTENT_LENGTH // (1024 * 1024)
    return jsonify({"ok": False, "error": f"文档或替换图片总大小超过 {mb}MB 上限，请压缩文档或减少替换图片后再试"}), 413


app.register_blueprint(bp)


if __name__ == "__main__":
    # 仅本机监听，配合工具箱 Node 服务以 iframe 嵌入；端口可由 DOCX_PORT 覆盖。
    # 生产环境通过 Nginx 反代 /docx-watermark/ 到本端口。
    app.run(host="127.0.0.1", port=DOCX_PORT, debug=False, use_reloader=False)
