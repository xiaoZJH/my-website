/* =========================================================
   tools.js · 工具箱注册表与实现
   仅保留图片 / 视频去水印工具
   ========================================================= */
(function () {
  'use strict';

  // 工具图标
  const I = {
    wm: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-5 4 4 3-3 4 4"/><path d="M3 21h18"/><path d="M14 4l5 5-7 7-4-4z"/><path d="M14 4l3-1 1 3"/></svg>',
    docx: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4"/><circle cx="10" cy="11.5" r="2.4"/><path d="M8 18l2.5-3 2 2 2-2.5L18 18"/></svg>',
    removebg: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M8 12s1.5-2 4-2 4 2 4 2"/><path d="M9 15h.01M15 15h.01"/></svg>',
  };

  const TOOLS = [
    {
      id: 'watermark', title: '净影', desc: '图片 / 视频去水印 · 涂抹无痕修复', icon: I.wm,
      fullPage: true,
      render: () => `<div class="field"><p style="color:var(--text-soft)">正在打开去水印工具…</p></div>`,
      mount: () => {},
    },
    {
      id: 'remove-bg', title: '离境', desc: 'AI 智能抠图 · 一键移除背景，导出透明 PNG', icon: I.removebg,
      fullPage: true,
      render: () => `<div class="field"><p style="color:var(--text-soft)">正在打开抠图工具…</p></div>`,
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
    'remove-bg': { category: '媒体处理', cover: 'linear-gradient(135deg,#ff6b6b,#2dd4bf)' },
    'docx-watermark': { category: '媒体处理', cover: 'linear-gradient(135deg,#8b5cf6,#ec4899)' },
  };
  TOOLS.forEach((t) => {
    const m = TOOL_META[t.id];
    if (m) { t.category = m.category; t.cover = m.cover; }
  });

  window.TOOLS = TOOLS;
})();
