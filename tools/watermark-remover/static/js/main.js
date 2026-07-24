/* 净影 · 图片 / 视频去水印工具（单张 / 批量 / 视频逐帧） */
(() => {
  "use strict";

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const uploadView = $("upload-view");
  const editorView = $("editor-view");
  const resultView = $("result-view");
  const singleResult = $("single-result");
  const batchResult = $("batch-result");
  const videoResult = $("video-result");
  const dropZone = $("drop-zone");
  const fileInput = $("file-input");
  const pickBtn = $("pick-btn");

  const imgCanvas = $("img-canvas");
  const paintCanvas = $("paint-canvas");
  const imgCtx = imgCanvas.getContext("2d");
  const paintCtx = paintCanvas.getContext("2d");

  const thumbBar = $("thumb-bar");
  const canvasTip = $("canvas-tip");
  const videoHint = $("video-hint");
  const videoHintText = $("video-hint-text");

  const brushSizeInput = $("brush-size");
  const brushSizeVal = $("brush-size-val");
  const eraserBtn = $("eraser-btn");
  const undoBtn = $("undo-btn");
  const clearBtn = $("clear-btn");
  const radiusInput = $("radius");
  const radiusVal = $("radius-val");
  const processBtn = $("process-btn");
  const restartBtn = $("restart-btn");

  const beforeImg = $("before-img");
  const afterImg = $("after-img");
  const compare = $("compare");
  const compareBefore = $("compare-before");
  const compareHandle = $("compare-handle");
  const downloadBtn = $("download-btn");
  const backEditBtn = $("back-edit-btn");
  const againBtn = $("again-btn");

  const batchGrid = $("batch-grid");
  const batchSummary = $("batch-summary");
  const zipBtn = $("zip-btn");
  const batchBackEditBtn = $("batch-back-edit-btn");
  const batchAgainBtn = $("batch-again-btn");

  const resultVideo = $("result-video");
  const videoDownloadBtn = $("video-download-btn");
  const videoBackEditBtn = $("video-back-edit-btn");
  const videoAgainBtn = $("video-again-btn");
  const videoFullscreenBtn = $("video-fullscreen-btn");

  const fullscreenBtn = $("fullscreen-btn");
  const zoomBtn = $("zoom-btn");
  const lightbox = $("lightbox");
  const lightboxImg = $("lightbox-img");
  const lightboxClose = $("lightbox-close");

  const loading = $("loading-overlay");
  const loadingText = $("loading-text");
  const progressBar = $("progress-bar");
  const progressFill = $("progress-fill");
  const progressText = $("progress-text");
  const toast = $("toast");

  const autoBtn = $("auto-btn");

  const MAX_FILES = 20;
  const MAX_FILE_SIZE = 20 * 1024 * 1024;      // 图片 20MB
  const MAX_VIDEO_SIZE = 500 * 1024 * 1024;    // 视频 500MB

  // 生产环境部署在子路径（如 /watermark-remover/）时，API 调用需要带前缀
  const BASE_PATH = (document.querySelector('meta[name="base-path"]')?.content || "").replace(/\/$/, "");

  // ---------- 状态 ----------
  let files = [];               // File[]（图片模式）
  let fileDataURLs = [];
  let imageCache = [];
  let strokesMap = new Map();
  let currentIndex = 0;
  let strokes = [];
  let currentStroke = null;
  let isEraser = false;
  let isDrawing = false;
  let selectionMode = "brush";   // "brush" | "rect" | "ellipse"
  let currentShape = null;       // 选区拖拽预览
  let isVideoMode = false;
  let videoFile = null;
  let pollingTimer = null;
  let wmOnline = true;   // 去水印后端(Flask)是否在线

  // ---------- 视图切换 ----------
  function show(view) {
    uploadView.hidden = view !== "upload";
    editorView.hidden = view !== "edit";
    resultView.hidden = view !== "result";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showToast(msg, ms = 2800) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => (toast.hidden = true), ms);
  }

  function setLoading(on, text) {
    loadingText.textContent = text || "正在智能修复，请稍候…";
    loading.hidden = !on;
    if (!on) {
      progressBar.hidden = true;
      progressText.hidden = true;
      progressFill.style.width = "0%";
    }
  }

  function setProgress(pct, extra) {
    progressBar.hidden = false;
    progressText.hidden = false;
    progressFill.style.width = pct + "%";
    progressText.textContent = extra || `${pct}%`;
  }

  // ---------- 上传 ----------
  pickBtn.addEventListener("click", (e) => { e.stopPropagation(); fileInput.click(); });
  dropZone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    if (fileInput.files.length) loadFiles([...fileInput.files]);
    fileInput.value = "";
  });

  ["dragenter", "dragover"].forEach((ev) =>
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
    })
  );
  dropZone.addEventListener("drop", (e) => {
    if (e.dataTransfer.files.length) loadFiles([...e.dataTransfer.files]);
  });

  function loadFiles(list) {
    // 视频优先：含视频则进入视频模式（一次一个）
    const video = list.find((f) => f.type.startsWith("video/"));
    if (video) {
      if (video.size > MAX_VIDEO_SIZE) { showToast("视频超过 500MB，请压缩后再试"); return; }
      if (list.length > 1) showToast("视频模式一次处理一个，已取所选第一个视频");
      setupVideoMode(video);
      return;
    }

    const valid = [];
    for (const f of list) {
      if (!f.type.startsWith("image/")) { showToast(`「${f.name}」不是图片，已跳过`); continue; }
      if (f.size > MAX_FILE_SIZE) { showToast(`「${f.name}」超过 20MB，已跳过`); continue; }
      valid.push(f);
    }
    if (valid.length === 0) return;
    if (valid.length > MAX_FILES) {
      showToast(`一次最多处理 ${MAX_FILES} 张，已取前 ${MAX_FILES} 张`);
      valid.length = MAX_FILES;
    }
    files = valid;
    isVideoMode = false;
    setLoading(true, "正在加载图片…");

    Promise.all(files.map((f) => new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(f);
    }))).then((urls) => {
      fileDataURLs = urls;
      return Promise.all(urls.map((u) => new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = u;
      })));
    }).then((images) => {
      imageCache = images;
      setupEditor();
    }).catch(() => showToast("图片读取失败，请重试"))
      .finally(() => setLoading(false));
  }

  // ---------- 视频模式 ----------
  function extractVideoFrame(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.muted = true;
      video.preload = "auto";
      video.playsInline = true;
      const cleanup = () => URL.revokeObjectURL(url);
      video.addEventListener("loadeddata", () => {
        video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
      });
      video.addEventListener("seeked", () => {
        const c = document.createElement("canvas");
        c.width = video.videoWidth;
        c.height = video.videoHeight;
        c.getContext("2d").drawImage(video, 0, 0);
        cleanup();
        resolve(c);
      });
      video.addEventListener("error", () => { cleanup(); reject(new Error("视频解码失败")); });
      video.src = url;
    });
  }

  function setupVideoMode(file) {
    setLoading(true, "正在读取视频预览帧…");
    extractVideoFrame(file).then((frameCanvas) => {
      isVideoMode = true;
      videoFile = file;
      files = [file];
      const dataURL = frameCanvas.toDataURL("image/png");
      fileDataURLs = [dataURL];
      const img = new Image();
      img.onload = () => {
        imageCache = [img];
        setupEditor();
        setLoading(false);
      };
      img.src = dataURL;
    }).catch(() => {
      setLoading(false);
      showToast("无法读取该视频，请换 MP4 格式试试");
    });
  }

  // ---------- 编辑器初始化 ----------
  function setupEditor() {
    strokesMap = new Map();
    currentIndex = 0;
    strokes = [];
    currentStroke = null;
    currentShape = null;
    isEraser = false;
    selectionMode = "brush";
    document.querySelectorAll(".shape-btn").forEach((b) => b.classList.remove("active"));
    document.querySelector('[data-mode="brush"]').classList.add("active");
    eraserBtn.classList.remove("active");
    drawCurrentImage();
    renderThumbs();
    updateProcessBtn();
    updateTip();
    videoHint.hidden = !isVideoMode;
    if (isVideoMode) updateVideoHints();
    show("edit");
  }

  function updateVideoHints() {
    if (!isVideoMode) return;
    const floating = document.querySelector('input[name="wmode"]:checked').value === "floating";
    if (floating) {
      videoHintText.textContent = "涂抹水印所在的角落或边缘（一小块即可），系统会自动沿该边整条带逐帧处理，覆盖游动的水印。";
      canvasTip.textContent = "浮动水印：涂抹所在的边缘区域，系统将沿整边逐帧处理以覆盖其游动。";
    } else {
      videoHintText.textContent = "涂抹区域将逐帧应用到整个视频，请确保水印全程位置固定。";
      canvasTip.textContent = "在视频画面上涂抹水印区域，将逐帧应用到整个视频（水印位置需固定）。";
    }
  }

  function drawCurrentImage() {
    const img = imageCache[currentIndex];
    imgCanvas.width = paintCanvas.width = img.naturalWidth;
    imgCanvas.height = paintCanvas.height = img.naturalHeight;
    imgCtx.drawImage(img, 0, 0);
    redrawPaint();
  }

  function updateTip() {
    if (isVideoMode) {
      canvasTip.textContent = "在视频画面上涂抹水印区域，将逐帧应用到整个视频（水印位置需固定）";
    } else if (files.length <= 1) {
      canvasTip.textContent = "在水印上涂抹红色区域，尽量完全覆盖水印及边缘";
    } else {
      canvasTip.textContent =
        `正在编辑第 ${currentIndex + 1} / ${files.length} 张 · 点击缩略图切换，每张可单独涂抹；未涂抹的将沿用第 1 张已涂抹图的区域`;
    }
  }

  // ---------- 缩略图切换 ----------
  function syncStrokes() {
    strokesMap.set(currentIndex, strokes);
  }

  function switchImage(idx) {
    if (idx === currentIndex || idx < 0 || idx >= files.length) return;
    syncStrokes();
    currentIndex = idx;
    strokes = strokesMap.get(idx) || [];
    currentStroke = null;
    drawCurrentImage();
    renderThumbs();
    updateTip();
  }

  function renderThumbs() {
    if (files.length <= 1 || isVideoMode) { thumbBar.hidden = true; thumbBar.innerHTML = ""; return; }
    thumbBar.hidden = false;
    thumbBar.innerHTML = "";
    files.forEach((f, i) => {
      const painted = (strokesMap.get(i) || []).length > 0;
      const item = document.createElement("div");
      item.className = "thumb-item" + (i === currentIndex ? " current" : "");
      item.title = f.name;
      const badge = i === currentIndex ? '<span class="thumb-badge">编辑中</span>' : "";
      const check = painted ? '<span class="thumb-check">✓</span>' : "";
      item.innerHTML = `${badge}${check}<img src="${fileDataURLs[i]}" alt=""><p class="thumb-name">${f.name}</p>`;
      item.addEventListener("click", () => switchImage(i));
      thumbBar.appendChild(item);
    });
  }

  function updateProcessBtn() {
    if (isVideoMode) {
      processBtn.textContent = "✦ 开始视频去水印";
    } else {
      processBtn.textContent = files.length > 1
        ? `✦ 批量去水印（${files.length} 张）`
        : "✦ 开始去水印";
    }
  }

  // ---------- 涂抹 ----------
  function getPos(e) {
    const r = paintCanvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * paintCanvas.width) / r.width,
      y: ((e.clientY - r.top) * paintCanvas.height) / r.height,
    };
  }

  function drawStroke(ctx, stroke, forMask) {
    // 形状选区（矩形/椭圆）
    if (stroke.type === "shape") {
      ctx.save();
      const comp = stroke.erase ? "destination-out" : "source-over";
      ctx.globalCompositeOperation = forMask ? "source-over" : comp;
      const color = forMask
        ? (stroke.erase ? "#000" : "#fff")
        : (stroke.erase ? "rgba(0,0,0,0)" : "rgba(244, 63, 94, 0.45)");
      ctx.fillStyle = color;
      ctx.beginPath();
      if (stroke.shapeType === "rect") {
        ctx.rect(stroke.x, stroke.y, stroke.w, stroke.h);
      } else {
        const cx = stroke.x + stroke.w / 2, cy = stroke.y + stroke.h / 2;
        ctx.ellipse(cx, cy, Math.abs(stroke.w / 2), Math.abs(stroke.h / 2), 0, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.restore();
      return;
    }
    // 自由画笔
    if (stroke.points.length === 0) return;
    ctx.save();
    if (forMask) {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = stroke.erase ? "#000" : "#fff";
      ctx.fillStyle = ctx.strokeStyle;
    } else {
      ctx.globalCompositeOperation = stroke.erase ? "destination-out" : "source-over";
      ctx.strokeStyle = "rgba(244, 63, 94, 0.55)";
      ctx.fillStyle = ctx.strokeStyle;
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = stroke.size;

    if (stroke.points.length === 1) {
      const p = stroke.points[0];
      ctx.beginPath();
      ctx.arc(p.x, p.y, stroke.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function redrawPaint() {
    paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    for (const s of strokes) drawStroke(paintCtx, s, false);
    if (currentStroke) drawStroke(paintCtx, currentStroke, false);
    if (currentShape) drawStroke(paintCtx, currentShape, false);
  }

  paintCanvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    paintCanvas.setPointerCapture(e.pointerId);
    isDrawing = true;
    if (selectionMode !== "brush") {
      const p = getPos(e);
      currentShape = { type: "shape", shapeType: selectionMode, x: p.x, y: p.y, w: 0, h: 0, erase: isEraser };
      return;
    }
    currentStroke = {
      points: [getPos(e)],
      size: parseInt(brushSizeInput.value, 10),
      erase: isEraser,
    };
    redrawPaint();
  });

  paintCanvas.addEventListener("pointermove", (e) => {
    if (!isDrawing) return;
    if (currentShape) {
      const p = getPos(e);
      currentShape.w = p.x - currentShape.x;
      currentShape.h = p.y - currentShape.y;
      redrawPaint();
      return;
    }
    if (!currentStroke) return;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events) currentStroke.points.push(getPos(ev));
    redrawPaint();
  });

  function endStroke() {
    if (!isDrawing) return;
    isDrawing = false;
    if (currentShape) {
      if (Math.abs(currentShape.w) > 5 && Math.abs(currentShape.h) > 5) {
        const s = {
          type: "shape", shapeType: currentShape.shapeType, erase: isEraser,
          x: Math.min(currentShape.x, currentShape.x + currentShape.w),
          y: Math.min(currentShape.y, currentShape.y + currentShape.h),
          w: Math.abs(currentShape.w), h: Math.abs(currentShape.h),
        };
        strokes.push(s);
        syncStrokes();
        renderThumbs();
      }
      currentShape = null;
      redrawPaint();
      return;
    }
    if (currentStroke && currentStroke.points.length > 0) {
      strokes.push(currentStroke);
      syncStrokes();
      renderThumbs();
    }
    currentStroke = null;
    redrawPaint();
  }
  paintCanvas.addEventListener("pointerup", endStroke);
  paintCanvas.addEventListener("pointercancel", endStroke);
  // 兜底：iframe 内偶发 pointerup 不冒泡到画布（指针在画布外松手），
  // 在 window 上也监听一次，确保草稿笔触一定被提交进 strokes，否则点「开始去水印」会误判“未涂抹”。
  window.addEventListener("pointerup", endStroke);
  window.addEventListener("pointercancel", endStroke);

  // ---------- 工具栏 ----------
  brushSizeInput.addEventListener("input", () => {
    brushSizeVal.textContent = brushSizeInput.value;
  });
  radiusInput.addEventListener("input", () => {
    radiusVal.textContent = radiusInput.value;
  });
  eraserBtn.addEventListener("click", () => {
    isEraser = !isEraser;
    eraserBtn.classList.toggle("active", isEraser);
  });
  document.querySelectorAll(".shape-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".shape-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectionMode = btn.dataset.mode;
      if (selectionMode !== "brush") isEraser = false;
      eraserBtn.classList.remove("active");
    });
  });
  document.querySelectorAll('input[name="wmode"]').forEach((r) =>
    r.addEventListener("change", () => { if (isVideoMode) updateVideoHints(); })
  );
  undoBtn.addEventListener("click", () => { strokes.pop(); syncStrokes(); renderThumbs(); redrawPaint(); });
  clearBtn.addEventListener("click", () => { strokes = []; syncStrokes(); renderThumbs(); redrawPaint(); });
  restartBtn.addEventListener("click", resetAll);

  function resetAll() {
    files = [];
    fileDataURLs = [];
    imageCache = [];
    strokesMap = new Map();
    currentIndex = 0;
    strokes = [];
    isVideoMode = false;
    videoFile = null;
    resultVideo.removeAttribute("src");
    resultVideo.load();
    if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; }
    show("upload");
  }

  // ---------- 生成 mask ----------
  function firstStrokedIndex() {
    for (let i = 0; i < files.length; i++) {
      const s = strokesMap.get(i);
      if (s && s.length > 0) return i;
    }
    return -1;
  }

  function buildMaskBlobFor(index) {
    const srcIdx = (strokesMap.get(index) || []).length > 0 ? index : firstStrokedIndex();
    if (srcIdx === -1) return Promise.resolve(null);

    const srcImg = imageCache[srcIdx];
    const dstImg = imageCache[index];
    const scaleX = dstImg.naturalWidth / srcImg.naturalWidth;
    const scaleY = dstImg.naturalHeight / srcImg.naturalHeight;
    const scaleAvg = (scaleX + scaleY) / 2;

    return new Promise((resolve) => {
      const mc = document.createElement("canvas");
      mc.width = dstImg.naturalWidth;
      mc.height = dstImg.naturalHeight;
      const mctx = mc.getContext("2d");
      mctx.fillStyle = "#000";
      mctx.fillRect(0, 0, mc.width, mc.height);
      for (const s of strokesMap.get(srcIdx)) {
        let scaled;
        if (s.type === "shape") {
          scaled = {
            type: "shape", shapeType: s.shapeType,
            x: s.x * scaleX, y: s.y * scaleY,
            w: s.w * scaleX, h: s.h * scaleY,
            erase: s.erase,
          };
        } else {
          scaled = {
            points: s.points.map((p) => ({ x: p.x * scaleX, y: p.y * scaleY })),
            size: s.size * scaleAvg,
            erase: s.erase,
          };
        }
        drawStroke(mctx, scaled, true);
      }
      mc.toBlob(resolve, "image/png");
    });
  }

  // ---------- 处理入口 ----------
  processBtn.addEventListener("click", async () => {
    if (!wmOnline) {
      showToast("去水印后端服务未启动,无法处理(需在服务器安装 Python + OpenCV 并重启 toolbox)");
      return;
    }
    syncStrokes();
    // 兜底：若存在未提交的草稿笔触，先提交，避免 iframe 内 pointerup 偶发丢失导致“已涂抹却被判未涂抹”
    if (isDrawing && currentStroke && currentStroke.points.length > 0) endStroke();
    if (firstStrokedIndex() === -1) {
      // 未涂抹区域：单张图片自动尝试检测并去除；视频 / 批量给出明确引导
      if (!isVideoMode && files.length === 1) {
        showToast("未手动涂抹，已自动尝试检测并去除水印…", 3200);
        await autoRemoveImage();
        return;
      }
      if (isVideoMode) {
        showToast("视频请先用笔刷涂抹水印区域，或点「🤖 自动识别」以自动模式处理");
      } else {
        showToast("批量模式需为每张图片涂抹水印区域（也可单独处理单张时自动识别）");
      }
      return;
    }
    if (isVideoMode) {
      processVideo();
      return;
    }
    processBtn.disabled = true;
    setLoading(true, files.length > 1 ? `正在批量修复 ${files.length} 张图片…` : "正在智能修复，请稍候…");
    try {
      if (files.length > 1) {
        await processBatch();
      } else {
        await processSingle();
      }
    } catch (err) {
      console.error(err);
      showToast("网络错误，处理失败");
    } finally {
      setLoading(false);
      processBtn.disabled = false;
    }
  });

  function currentAlgo() {
    return document.querySelector('input[name="algo"]:checked').value;
  }

  // ---------- 单张处理 ----------
  async function processSingle() {
    const maskBlob = await buildMaskBlobFor(0);
    if (!maskBlob) { showToast("请先用笔刷涂抹水印区域"); return; }
    const fd = new FormData();
    fd.append("image", files[0]);
    fd.append("mask", maskBlob, "mask.png");
    fd.append("algorithm", currentAlgo());
    fd.append("radius", radiusInput.value);

    const resp = await fetch(BASE_PATH + "/api/remove", { method: "POST", body: fd });
    const data = await resp.json();
    if (!data.ok) { showToast(data.error || "处理失败，请重试"); return; }

    beforeImg.src = fileDataURLs[0];
    downloadBtn.href = data.result_url;
    afterImg.onload = () => {
      initCompare();
      showResultSection(singleResult);
    };
    afterImg.src = data.result_url + "?t=" + Date.now();
  }

  // ---------- 批量处理 ----------
  async function processBatch() {
    const fd = new FormData();
    const maskBlobs = await Promise.all(files.map((_, i) => buildMaskBlobFor(i)));
    let reused = 0;
    files.forEach((f, i) => {
      fd.append("images", f);
      fd.append("masks", maskBlobs[i], `mask_${i}.png`);
      if ((strokesMap.get(i) || []).length === 0) reused++;
    });
    fd.append("algorithm", currentAlgo());
    fd.append("radius", radiusInput.value);

    if (reused > 0) showToast(`${reused} 张未涂抹的图片已沿用第 ${firstStrokedIndex() + 1} 张的涂抹区域`);

    const resp = await fetch(BASE_PATH + "/api/remove-batch", { method: "POST", body: fd });
    const data = await resp.json();
    if (!data.ok) { showToast(data.error || "批量处理失败，请重试"); return; }

    batchSummary.textContent = `共处理 ${data.count} 张图片，点击缩略图可查看大图`;
    zipBtn.href = data.zip_url;
    zipBtn.setAttribute("download", "去水印批量结果.zip");

    batchGrid.innerHTML = "";
    data.results.forEach((r) => {
      const item = document.createElement("div");
      item.className = "batch-item";
      item.innerHTML = `
        <img src="${r.url}" alt="${r.name}" title="点击查看大图">
        <div class="batch-meta">
          <span class="batch-name" title="${r.name}">${r.name}</span>
          <a class="btn btn-ghost btn-sm" href="${r.url}" download="去水印_${r.name}">下载</a>
        </div>`;
      item.querySelector("img").addEventListener("click", () => openLightbox(r.url));
      batchGrid.appendChild(item);
    });

    showResultSection(batchResult);
  }

  // ---------- 视频处理 ----------
  async function processVideo() {
    const algo = currentAlgo();
    const mode = document.querySelector('input[name="wmode"]:checked').value;
    if (algo === "poisson") {
      showToast("提示：泊松融合逐帧处理较慢，长视频建议改用 Telea 算法", 4000);
    }
    if (mode !== "auto") {
      const mb = await buildMaskBlobFor(0);
      if (!mb) { showToast("请先用笔刷涂抹水印区域"); return; }
    }

    processBtn.disabled = true;
    setLoading(true, "正在上传视频…");
    setProgress(0, "正在上传视频…");

    const fd = new FormData();
    fd.append("video", videoFile);
    fd.append("algorithm", algo);
    fd.append("radius", radiusInput.value);
    fd.append("mode", mode);

    try {
      const resp = await fetch(BASE_PATH + "/api/video/remove", { method: "POST", body: fd });
      const data = await resp.json();
      if (!data.ok) {
        showToast(data.error || "任务创建失败");
        setLoading(false);
        processBtn.disabled = false;
        return;
      }
      loadingText.textContent = "正在逐帧修复视频…";
      setProgress(0, "准备处理…");
      pollVideoTask(data.task_id);
    } catch (err) {
      console.error(err);
      showToast("网络错误，任务创建失败");
      setLoading(false);
      processBtn.disabled = false;
    }
  }

  function pollVideoTask(taskId) {
    if (pollingTimer) clearInterval(pollingTimer);
    pollingTimer = setInterval(async () => {
      try {
        const resp = await fetch(`${BASE_PATH}/api/video/status/${taskId}`);
        const d = await resp.json();
        if (!d.ok) { throw new Error(d.error || "查询失败"); }
        if (d.status === "processing") {
          const extra = d.total > 0
            ? `${d.progress}%（共 ${d.total} 帧）`
            : `已处理 ${d.frames || 0} 帧…`;
          setProgress(d.progress, extra);
        } else if (d.status === "done") {
          clearInterval(pollingTimer);
          pollingTimer = null;
          setLoading(false);
          processBtn.disabled = false;
          resultVideo.src = d.result_url;
          videoDownloadBtn.href = d.result_url;
          videoDownloadBtn.setAttribute("download", `去水印_${d.name || "video"}.mp4`);
          showResultSection(videoResult);
        } else if (d.status === "error") {
          throw new Error(d.error || "处理失败");
        }
      } catch (err) {
        clearInterval(pollingTimer);
        pollingTimer = null;
        setLoading(false);
        processBtn.disabled = false;
        showToast(err.message || "视频处理失败，请重试", 4000);
      }
    }, 1000);
  }

  // ---------- 结果区块切换 ----------
  function showResultSection(section) {
    singleResult.hidden = section !== singleResult;
    batchResult.hidden = section !== batchResult;
    videoResult.hidden = section !== videoResult;
    show("result");
  }

  // ---------- 前后对比滑块 ----------
  function setCompare(pct) {
    pct = Math.max(0, Math.min(100, pct));
    compareBefore.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    compareHandle.style.left = pct + "%";
  }

  function initCompare() { setCompare(50); }

  let compareDragging = false;
  function compareMove(e) {
    const r = compare.getBoundingClientRect();
    setCompare(((e.clientX - r.left) / r.width) * 100);
  }
  compare.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    compareDragging = true;
    compare.setPointerCapture(e.pointerId);
    compareMove(e);
  });
  compare.addEventListener("pointermove", (e) => {
    if (compareDragging) compareMove(e);
  });
  ["pointerup", "pointercancel"].forEach((ev) =>
    compare.addEventListener(ev, () => (compareDragging = false))
  );
  // 已移除 compare.click 自动弹灯箱，避免拖动滑块时误触发；
  // 想看大图请点「🔍 放大查看」按钮或「⛶ 全屏对比」按钮

  backEditBtn.addEventListener("click", () => show("edit"));
  againBtn.addEventListener("click", resetAll);
  batchBackEditBtn.addEventListener("click", () => show("edit"));
  batchAgainBtn.addEventListener("click", resetAll);
  videoBackEditBtn.addEventListener("click", () => show("edit"));
  videoAgainBtn.addEventListener("click", resetAll);
  videoFullscreenBtn.addEventListener("click", () => {
    if (resultVideo.requestFullscreen) resultVideo.requestFullscreen();
  });

  // ---------- 自动识别 ----------
  autoBtn.addEventListener("click", async () => {
    if (files.length === 0) { showToast("请先上传文件"); return; }
    autoBtn.disabled = true;
    autoBtn.textContent = "⏳ 识别中…";
    try {
      if (isVideoMode) {
        await processVideoAuto();
      } else {
        await autoRemoveImage();
      }
    } finally {
      autoBtn.disabled = false;
      autoBtn.textContent = "🤖 自动识别";
    }
  });

  // ---------- 全屏对比 & 灯箱放大 ----------
  fullscreenBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      if (compare.requestFullscreen) compare.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  });
  document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement === compare) {
      fullscreenBtn.textContent = "⛶ 退出全屏";
    } else {
      fullscreenBtn.textContent = "⛶ 全屏对比";
    }
  });
  zoomBtn.addEventListener("click", () => {
    if (afterImg && afterImg.src) openLightbox(afterImg.src);
  });

  function openLightbox(src) {
    lightboxImg.src = src;
    lightbox.hidden = false;
  }
  function closeLightbox() {
    lightbox.hidden = true;
    lightboxImg.src = "";
  }
  lightboxClose.addEventListener("click", closeLightbox);
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !lightbox.hidden) closeLightbox();
  });

  // ---------- 自动识别：图片 ----------
  async function autoRemoveImage() {
    if (files.length !== 1) { showToast("自动识别仅支持单张图片"); return; }
    const fd = new FormData();
    fd.append("image", files[0]);
    fd.append("algorithm", currentAlgo());
    fd.append("radius", radiusInput.value);
    setLoading(true, "正在检测水印位置并去除…");
    try {
      const resp = await fetch(BASE_PATH + "/api/detect", { method: "POST", body: fd });
      const data = await resp.json();
      if (!data.ok) { showToast(data.error || "自动识别失败"); return; }
      beforeImg.src = fileDataURLs[0];
      downloadBtn.href = data.result_url;
      afterImg.onload = () => { initCompare(); showResultSection(singleResult); };
      afterImg.src = data.result_url + "?t=" + Date.now();
    } catch (err) {
      console.error(err);
      showToast("去水印服务未响应,请确认服务器后端已启动(需安装 Python + OpenCV)");
    } finally { setLoading(false); }
  }

  // ---------- 自动识别：视频 ----------
  async function processVideoAuto() {
    const algo = currentAlgo();
    if (algo === "poisson") showToast("提示：泊松融合逐帧处理较慢，长视频建议改用 Telea", 4000);
    processBtn.disabled = true;
    setLoading(true, "正在自动检测水印并修复视频…");
    setProgress(0, "准备中…");
    const fd = new FormData();
    fd.append("video", videoFile);
    fd.append("algorithm", algo);
    fd.append("radius", radiusInput.value);
    fd.append("mode", "auto");
    try {
      const resp = await fetch(BASE_PATH + "/api/video/remove", { method: "POST", body: fd });
      const data = await resp.json();
      if (!data.ok) { showToast(data.error || "任务创建失败"); setLoading(false); processBtn.disabled = false; return; }
      loadingText.textContent = "正在逐帧修复视频（自动检测模式）…";
      setProgress(0, "开始处理…");
      pollVideoTask(data.task_id);
    } catch (err) { showToast("网络错误"); setLoading(false); processBtn.disabled = false; }
  }

  // ---------- 后端健康检测 ----------
  async function checkWmStatus() {
    try {
      const r = await fetch("/api/wm-status");
      const d = await r.json();
      wmOnline = !!(d && d.ok);
    } catch (_) { wmOnline = false; }
    if (!wmOnline) {
      showToast("⚠ 去水印后端服务未启动,处理会失败。需在服务器安装 Python + OpenCV 并重启 toolbox。", 5000);
    }
  }
  checkWmStatus();
})();
