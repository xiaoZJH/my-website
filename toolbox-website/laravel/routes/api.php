<?php

use App\Models\Post;
use App\Models\Visit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// 真实访问统计：写入 SQLite，按「同 IP + 同路径 30 分钟内」去重，避免刷新刷数据
Route::get('/stats', function () {
    $total = Visit::count();
    $today = Visit::whereDate('created_at', today())->count();
    $unique = Visit::distinct()->count('ip');
    $last7 = collect(range(6, 0))->map(function ($i) {
        $d = today()->subDays($i);
        return [
            'date' => $d->format('n/j'),
            'count' => Visit::whereDate('created_at', $d)->count(),
        ];
    });

    return response()->json(compact('total', 'today', 'unique', 'last7'));
});

Route::post('/visit', function (Request $request) {
    $ip = $request->ip();
    $path = (string) $request->input('path', '/');
    $recent = Visit::where('ip', $ip)
        ->where('path', $path)
        ->where('created_at', '>=', now()->subMinutes(30))
        ->exists();
    if (! $recent) {
        Visit::create(['ip' => $ip, 'path' => $path]);
    }

    return response()->json(['ok' => true]);
});

Route::get('/posts', function () {
    $posts = Post::orderByDesc('created_at')
        ->get(['id', 'slug', 'title', 'excerpt', 'cover', 'tags', 'reading_min', 'created_at']);

    return response()->json(['posts' => $posts]);
});

Route::get('/posts/{slug}', function ($slug) {
    $post = Post::where('slug', $slug)->first();
    if (! $post) {
        return response()->json(['error' => 'not found'], 404);
    }

    return response()->json(['post' => $post]);
});
