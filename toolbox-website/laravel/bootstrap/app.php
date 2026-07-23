<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // 若希望由中间件记录访问，可在此追加自定义 RecordVisit 中间件
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })->create();
