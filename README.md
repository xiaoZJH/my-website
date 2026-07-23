# Toolbox · 个人工具箱 + 博客

一个**本地优先**的个人工具箱网站：常用开发小工具全部在浏览器本地运行（不上传任何数据），并带一个博客式内容板块。访问统计**真实落在本地数据库**，看得见的计数。

## 目录结构

```
.
├── server/            # Node 版后端（已验证可运行）
│   └── server.js      # 纯 Node http + 内置 node:sqlite，零外部依赖
├── public/            # 前端（无构建步骤）
│   ├── index.html
│   ├── css/styles.css # 设计系统（亮/暗双色、玻璃拟态、悬浮微交互）
│   └── js/
│       ├── tools.js   # 11 个工具的实现
│       └── app.js     # SPA 路由 / 主题 / 抽屉 / 访问统计
├── data/              # SQLite 数据库文件（运行时生成）
└── laravel/           # Laravel 11 + Livewire 3 + Flux 版源码（功能对等）
```

## 立即运行（Node 版，推荐先体验）

> 需要 Node 22.5+（用到内置 `node:sqlite`，需 `--experimental-sqlite` 启动标志）。

```bash
node --experimental-sqlite server/server.js
# 打开 http://localhost:4173
```

- 访问统计写入 `data/toolbox.db`，重启不丢失。
- 想换端口：`PORT=8080 node --experimental-sqlite server/server.js`

## 功能

**工具箱（11 个，全部本地运行）**
JSON 格式化 · Base64 编解码 · 时间戳转换 · 随机密码生成 · UUID 生成 ·
颜色拾取器 · 单位换算 · 简易计算器 · 文本字数统计 · URL 编解码 · 进制转换
（「去水印 / GeoGebra」已作为规划中卡片占位，见 `tools.js` 的 `soon` 工具。）

**博客**：`/api/posts` 提供列表与详情，首页与博客页展示最新文章（已内置 3 篇示例，改 `server.js` 的 `seedIfEmpty()` 或 Laravel 的 Seeder 即可）。

**访问统计**：累计访问 / 今日 / 独立访客 / 近 7 天趋势，导航栏实时显示。按「同 IP + 同路径 30 分钟内」去重，避免刷新刷数据。

## 设计

参照 haowallpaper 视觉范式：流式响应式网格卡片、轻量化导航、亮/暗双色模式（深色搭载轻度磨砂玻璃拟态）、统一圆角、卡片悬浮上浮 + 分层阴影、均衡留白。

## 部署 Laravel 版

见 `laravel/README.md`。该版本与你选的「完整框架」一致，功能与 Node 版对等，只是后端换成 Laravel / Livewire / Flux。
