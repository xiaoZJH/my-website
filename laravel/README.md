# Laravel 版 · 个人工具箱

与根目录 Node 版**功能对等**（真实访问统计、博客、工具箱），后端改为你选择的
**Laravel 11 + Livewire 3 + Flux**。前端资源（`public/css`、`public/js`）与 Node 版**完全复用**。

## 环境要求

- PHP >= 8.2
- Composer
- 启用 SQLite 扩展（默认开启）

## 安装步骤

```bash
# 1. 新建一个干净的 Laravel 11 项目（若已有可跳过）
composer create-project laravel/laravel toolbox
cd toolbox

# 2. 安装 Livewire 与 Flux（官方 UI 套件）
composer require livewire/livewire livewire/flux
php artisan flux:install        # 生成 Flux 的 Tailwind 资源与指令

# 3. 把本目录下的源码覆盖进项目
#    app/Models/Visit.php, app/Models/Post.php
#    app/Livewire/Stats.php
#    resources/views/layouts/app.blade.php, resources/views/spa.blade.php
#    resources/views/livewire/stats.blade.php
#    routes/web.php, routes/api.php, bootstrap/app.php
#    database/migrations/*, database/seeders/DatabaseSeeder.php

# 4. 复用前端资源：把根目录 public/css、public/js 复制进本项目的 public/
#    cp -r ../public/css public/ && cp -r ../public/js public/

# 5. 建库 + 写入示例文章
php artisan migrate --seed

# 6. 启动
php artisan serve
# 打开 http://localhost:8000
```

## 关键实现说明

- **访问统计**：`routes/api.php` 的 `/api/visit` 写入 `visits` 表（同 IP + 同路径 30 分钟去重）；
  `/api/stats` 聚合累计 / 今日 / 独立访客 / 近 7 天。
- **实时计数芯片**：`App\Livewire\Stats` + `resources/views/livewire/stats.blade.php`，
  导航栏通过 `@livewire('stats')` 渲染真实数据。
- **Flux 暗色**：主题切换由前端 `app.js` 同时设置 `data-theme` 与 `.dark` 类，
  兼容 Flux 的暗色模式。
- **SPA 外壳**：所有页面返回 `spa.blade.php`（继承 `layouts.app`），
  视图由 `public/js/app.js` 基于 hash 路由渲染，工具/博客逻辑与 Node 版一致。
- **文章管理**：`App\Models\Post` + `DatabaseSeeder` 内置 3 篇示例；
  可接 `filament` 等后台做可视化编辑（未包含）。

## 目录速览

```
laravel/
├── app/Models/{Visit,Post}.php
├── app/Livewire/Stats.php
├── bootstrap/app.php
├── routes/{web,api}.php
├── database/migrations/*_create_{visits,posts}_table.php
├── database/seeders/DatabaseSeeder.php
└── resources/views/{layouts/app,spa,livewire/stats}.blade.php
```
