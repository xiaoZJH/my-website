/* =========================================================
   tools.js · 工具箱注册表与实现
   仅保留图片 / 视频去水印工具
   ========================================================= */
(function () {
  'use strict';

  // 仅保留去水印 / Word 图片导出图标
  const I = {
    wm: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-5 4 4 3-3 4 4"/><path d="M3 21h18"/><path d="M14 4l5 5-7 7-4-4z"/><path d="M14 4l3-1 1 3"/></svg>',
    docx: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4"/><circle cx="10" cy="11.5" r="2.4"/><path d="M8 18l2.5-3 2 2 2-2.5L18 18"/></svg>',
  };

  const TOOLS = [
    {
      id: 'watermark', title: '图片 / 视频去水印', desc: '涂抹水印区域，一键无痕修复', icon: I.wm,
      fullPage: true,
      render: () => `<div class="field"><p style="color:var(--text-soft)">正在打开去水印工具…</p></div>`,
      mount: () => {},
    },
    {
      id: 'docx-watermark', title: 'Word 图片导出 · 批量水印', desc: '抽取 Word 内嵌图片，批量加自定义水印', icon: I.docx,
      fullPage: true,
      render: () => `<div class="field"><p style="color:var(--text-soft)">正在打开 Word 图片导出工具…</p></div>`,
      mount: () => {},
    },
  ];

  // 每个工具的「壁纸式」封面渐变 + 分类（用于网格与筛选）
  const TOOL_META = {
    watermark: { category: '媒体处理', cover: 'linear-gradient(135deg,#0ea5e9,#14b8a6)' },
    'docx-watermark': { category: '媒体处理', cover: 'linear-gradient(135deg,#8b5cf6,#ec4899)' },
  };
  TOOLS.forEach((t) => {
    const m = TOOL_META[t.id];
    if (m) { t.category = m.category; t.cover = m.cover; }
  });

  window.TOOLS = TOOLS;
})();
