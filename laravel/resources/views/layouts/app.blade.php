<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="本地优先的个人工具箱与博客：常用开发小工具随手可用，访问统计真实落在本地数据库。">
    <title>Toolbox · 个人工具箱</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="{{ asset('css/styles.css') }}">
    @livewireStyles
    @fluxStyles
</head>
<body>
    {{-- 轻量化导航栏（Flux 组件） --}}
    <header class="nav">
        <div class="nav__inner">
            <a class="brand" href="#/">
                <span class="brand__mark" aria-hidden="true"></span>
                <span class="brand__name">Toolbox</span>
            </a>

            <flux:navbar>
                <flux:navlist>
                    <flux:navlist.item href="#/">首页</flux:navlist.item>
                    <flux:navlist.item href="#/tools">工具箱</flux:navlist.item>
                    <flux:navlist.item href="#/blog">博客</flux:navlist.item>
                    <flux:navlist.item href="#/about">关于</flux:navlist.item>
                </flux:navlist>
            </flux:navbar>

            <div class="nav__right">
                @livewire('stats')
                <button class="theme-toggle" id="themeToggle" type="button" aria-label="切换深浅色">
                    <svg class="icon-sun" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
                    <svg class="icon-moon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
                </button>
            </div>
        </div>
    </header>

    <main id="view" class="view"></main>

    <footer class="footer">
        <div class="footer__inner">
            <p class="footer__copy">本地优先 · 数据不出本机 · 访问统计存于本地 SQLite</p>
            <p class="footer__meta">Laravel + Livewire + Flux · {{ date('Y') }}</p>
        </div>
    </footer>

    {{-- 工具抽屉（由前端 app.js 控制开合） --}}
    <div class="drawer" id="drawer" aria-hidden="true">
        <div class="drawer__scrim" data-close></div>
        <aside class="drawer__panel" role="dialog" aria-modal="true" aria-labelledby="drawerTitle">
            <div class="drawer__head">
                <div class="drawer__title-wrap">
                    <span class="drawer__icon" id="drawerIcon" aria-hidden="true"></span>
                    <h2 class="drawer__title" id="drawerTitle">工具</h2>
                </div>
                <button class="drawer__close" type="button" data-close aria-label="关闭">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                </button>
            </div>
            <div class="drawer__body" id="drawerBody"></div>
        </aside>
    </div>

    <script src="{{ asset('js/tools.js') }}"></script>
    <script src="{{ asset('js/app.js') }}"></script>
    @livewireScripts
    @fluxScripts
</body>
</html>
