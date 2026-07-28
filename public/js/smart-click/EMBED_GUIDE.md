# 智能点选抠图（Smart Click Matting）嵌入指南

底层：MobileSAM / TinySAM 点击分割；前端 TypeScript + HTML5 Canvas；风格对标 WPS 智能点选蒙版（半透明蓝）。

模块位置：
- 前端：`public/js/smart-click/`（`types / coordinate / pointStore / maskRenderer / matting / samClient / smartClickTool / index`）
- 后端：`tools/watermark-remover/sam/sam_service.py`

> **状态：本指南描述的接线已直接应用到项目**（`public/index.html`、`public/js/app.js` 的 `renderRemoveBg`、`public/css/styles.css`、`tools/watermark-remover/app.py`）。下方章节可作为架构说明与二次维护参考，无需再次手动接线。
> 启用点选功能的前置条件：在 Flask venv 安装 `segment-anything-mobile-sam` 并放置 `mobile_sam.pt` 权重到 `tools/watermark-remover/sam/weights/`。

---

## 0. 编译（现有 app.js 是 classic script，非 ES module）

把 TS 通过 esbuild 打包成单文件 IIFE bundle，挂到全局 `window.SmartClick`，即可在 `app.js` 里直接用：

```bash
cd toolbox-website
npx -y esbuild public/js/smart-click/index.ts --bundle --format=iife --global-name=SmartClick --outfile=public/js/smart-click/bundle.js
```

> 已为你生成好 `public/js/smart-click/bundle.js`（19KB，可直接用）。重新生成时 bump 版本号即可。

`index.html` 里在 app.js **之前**加一行：

```html
<script src="/js/smart-click/bundle.js?v=1"></script>
<script src="/js/app.js?v=30"></script>
```

在 `app.js` 顶部取用：
```js
const { SmartClickTool, CoordinateTransformer } = window.SmartClick;
```

---

## 1. 工具栏新增【智能点选】切换 + SAM 模式 + 撤销/清空

在 `renderRemoveBg` 的 `.rb-toolbar` 内（`#rbModel` 旁）追加：

```html
<button class="btn btn--toggle" id="rbModeClick" type="button">智能点选</button>
<select id="rbSamMode" class="rb-select" title="智能点选输出模式">
  <option value="alpha">掩码直接抠图</option>
  <option value="fuse">融合 u2net 优化</option>
</select>
<button class="btn btn--ghost" id="rbUndo" type="button" disabled>撤销点</button>
<button class="btn btn--ghost" id="rbClearPts" type="button" disabled>清空点</button>
```

并把原 `.rb-hint` 文案在 click 模式下切换为：
「左键=保留物体，右键=剔除背景；滚轮缩放，空格+拖拽平移；多次打点可叠加优化。」

---

## 2. 用 CoordinateTransformer 接管坐标（替换原 stage/eventToRel）

在 `renderRemoveBg` 作用域内新增：

```js
const transformer = new CoordinateTransformer();

// 替换原 fitCanvas：同时喂给 transformer
function fitCanvas() {
  if (!sourceImage) return;
  const maxW = canvasWrap.clientWidth || 600;
  const maxH = Math.min(window.innerHeight * 0.62, 620);
  transformer.setImageSize(sourceImage.naturalWidth, sourceImage.naturalHeight);
  const v = transformer.fit(maxW, maxH);          // 居中适配
  const dpr = window.devicePixelRatio || 1;
  // click 模式需要画布填满 wrap 以便平移/缩放；crop 模式保持原尺寸
  if (smartTool.getMode() === 'click') {
    canvas.style.width = maxW + 'px';
    canvas.style.height = maxH + 'px';
    canvas.width = Math.round(maxW * dpr);
    canvas.height = Math.round(maxH * dpr);
  } else {
    const dw = Math.round(sourceImage.naturalWidth * v.scale);
    const dh = Math.round(sourceImage.naturalHeight * v.scale);
    canvas.style.width = dw + 'px';
    canvas.style.height = dh + 'px';
    canvas.width = Math.round(dw * dpr);
    canvas.height = Math.round(dh * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  redrawActive();
}
```

新增一个统一入口 `redrawActive()`，让两种模式各有渲染逻辑：

```js
function redrawActive() {
  if (smartTool.getMode() === 'click') smartTool.redraw();   // 智能点选接管
  else draw();                                                // 原框选逻辑不变
}

const smartTool = new SmartClickTool({
  canvas, ctx,
  getSource: () => sourceImage,
  transformer,
  endpoint: '/watermark-remover/api/sam-segment',
  getImageBase64: () => fileToDataURL(currentFile),           // 见下方工具函数
  onPreview: (pngUrl) => {                                    // 输出到右侧预览（复用现有 rbAfter）
    afterImg.onload = () => { downloadBtn.disabled = false; emptyTip.style.display = 'none'; };
    afterImg.src = pngUrl;
    currentResult = pngUrl;
  },
  onStatus: setStatus,
  onPointsChange: (n) => { rbUndo.disabled = n === 0; rbClearPts.disabled = n === 0; },
});
```

`fileToDataURL` 工具（把已上传的 File 转 base64，避免重复编码 blob）：

```js
function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
```

---

## 3. 模式切换（需求 2.3：切回框选自动清除 SAM）

```js
const modeBtn = document.getElementById('rbModeClick');
modeBtn.addEventListener('click', () => {
  const next = smartTool.getMode() === 'click' ? 'crop' : 'click';
  smartTool.setMode(next);
  modeBtn.classList.toggle('is-active', next === 'click');
  modeBtn.textContent = next === 'click' ? '退出点选' : '智能点选';
  fitCanvas();   // 重算画布尺寸/transform
});
```

`smartTool.setMode('crop')` 内部已自动 `points.clear()` + 清空蒙版。

---

## 4. 复用现有按钮（需求 2.2）

把 `processBtn` 的点击逻辑改为按模式分流：

```js
processBtn.addEventListener('click', async () => {
  if (smartTool.getMode() === 'click') {
    if (!smartTool.hasMask()) { setStatus('请先在图上打点', 'error'); return; }
    setLoading('正在生成透明 PNG…');
    try {
      const mode = document.getElementById('rbSamMode').value;
      if (mode === 'alpha') await smartTool.applyAsAlpha();           // 模式1
      else await smartTool.fuseWithU2net(currentFile, '/watermark-remover/api/remove-bg'); // 模式2
      setStatus('抠图完成 ✔', 'info');
    } catch (e) { setError(String(e.message || e)); }
    processBtn.disabled = false;
  } else {
    runRemoveBg();   // 原框选逻辑
  }
});

// 撤销 / 清空 点（需求 1.6）
document.getElementById('rbUndo').addEventListener('click', () => smartTool.undo());
document.getElementById('rbClearPts').addEventListener('click', () => smartTool.clearAll());
// 原有的「清除选区」在 click 模式下也顺手清点
clearCropBtn.addEventListener('click', () => {
  if (smartTool.getMode() === 'click') smartTool.clearAll();
  else { crop = null; clearCropBtn.disabled = true; draw(); }
});
// 重新上传：清点 + 回框选
resetBtn.addEventListener('click', () => { smartTool.clearAll(); smartTool.setMode('crop'); reset(); });
```

> `下载 PNG`（`rbDownload`）和 `重新上传`（`rbReset`）已存在，无需改动即可复用——因为预览统一走 `rbAfter` / `currentResult`。

---

## 5. 后端接入（Flask sidecar）

1) 在 Flask venv 安装：
```bash
pip install segment-anything-mobile-sam timm torch numpy pillow opencv-python-headless
```
2) 下载权重 `mobile_sam.pt` 放到 `tools/watermark-remover/sam/weights/`。
3) 在 `app.py` 顶部挂载：
```python
from sam.sam_service import register_sam
register_sam(app)
```
4) 让现有 `/api/remove-bg` 支持融合：在 `remove-bg` 处理函数里读 `sam_mask` 字段，
   解码后调用：
```python
from sam.sam_service import apply_sam_mask_to_alpha
sam_mask = request.files.get('sam_mask')  # 或 form['sam_mask'] base64
# ... 得到 u2net 的 alpha(numpy) 后：
alpha = apply_sam_mask_to_alpha(alpha, sam_mask_b64)
```

> 注意：Flask sidecar 改完必须**重启 Node 父进程**才会重载（与现有抠图后端一致）。

---

## 6. 接口规范速查

请求（前端 → `/api/sam-segment`）：
```json
{
  "image": "data:image/png;base64,...",
  "points": [ {"x":820,"y":410,"label":1}, {"x":300,"y":200,"label":0} ]
}
```
响应（后端 → 前端）：
```json
{ "ok": true, "width": 1000, "height": 1200,
  "mask_image": "data:image/png;base64,...", "score": 0.96 }
```
前端用 `decodeMaskImage(mask_image, width, height)` 得到 `Uint8Array`，即可渲染/合并/导出。

---

## 7. 文件职责一览（输出要求对应）

- ① `coordinate.ts` —— Canvas 坐标转换（缩放/平移，鼠标屏幕坐标→原图像素坐标矩阵）
- ② `pointStore.ts` + `smartClickTool` —— 打点监听、点位管理（增/删/清空/撤销）
- ③ `maskRenderer.ts` —— SAM mask 半透明蓝蒙版渲染 + 点位绘制 + 掩码合并
- ④ `matting.ts` + `smartClickTool.applyAsAlpha/fuseWithU2net` —— 透明 PNG 输出到右侧预览
- ⑤ 分层：`smartClickTool`（交互工具类） / `maskRenderer`（渲染类） / `samClient`（请求类），均带注释
