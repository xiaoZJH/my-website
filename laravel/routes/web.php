<?php

use Illuminate\Support\Facades\Route;

// 所有页面共用同一个 SPA 外壳，前端通过 hash 路由（#/、#/tools、#/blog…）切换视图
Route::get('/', fn () => view('spa'));
Route::get('/tools', fn () => view('spa'));
Route::get('/blog', fn () => view('spa'));
Route::get('/about', fn () => view('spa'));
Route::get('/blog/{slug}', fn () => view('spa'));
