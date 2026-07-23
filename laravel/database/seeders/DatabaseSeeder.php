<?php

namespace Database\Seeders;

use App\Models\Post;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        if (Post::count() > 0) {
            return;
        }

        $now = now();
        $posts = [
            [
                'slug' => 'welcome',
                'title' => '欢迎来到我的个人工具箱',
                'excerpt' => '这里 collects 我在日常开发与生活中高频使用的小工具，以及一个随手记录想法的博客角落。',
                'body' => "这是一个用极简技术栈搭建的个人空间：前端是无构建步骤的原生页面，后端仅依赖 Laravel 与单文件数据库，访问数据全部落在本地，不依赖任何第三方统计服务。\n\n你看到的每一个工具都能在浏览器里直接运行——JSON 格式化、时间戳转换、密码生成……它们不需要上传任何数据。\n\n博客部分我会不定期写一些开发笔记和产品思考。如果某个工具有用，或者你有想加进来的工具，欢迎留言告诉我。",
                'cover' => 'linear-gradient(135deg,#0ea5a4 0%,#22d3ee 100%)',
                'tags' => '公告,随笔',
                'reading_min' => 2,
                'created_at' => $now,
            ],
            [
                'slug' => 'why-local-first',
                'title' => '为什么我把工具箱做成 Local-First',
                'excerpt' => '在线工具千千万，但把数据交给别人总让人心里不踏实。聊聊我做这个工具箱的几个取舍。',
                'body' => "大多数在线小工具都会把你的输入发到服务器。对一段要格式化的 JSON、一个要编码的 token 来说，这未必安全，也未必必要。\n\n这个工具箱里的所有计算都在你的浏览器本地完成，后端只做一件事：记录\"有人来过\"。连统计都不带任何身份信息，只存一个匿名的访问计数。\n\n技术上，它跑在一个轻量的 Laravel 应用上，数据库是 SQLite，拷贝整个文件夹就能换台机器继续用。",
                'cover' => 'linear-gradient(135deg,#6366f1 0%,#a855f7 100%)',
                'tags' => '技术,思考',
                'reading_min' => 4,
                'created_at' => $now->copy()->subDay(),
            ],
            [
                'slug' => 'dev-tools-roundup',
                'title' => '我每天都在用的 5 个开发者小工具',
                'excerpt' => '不是什么大东西，但少了它们，一天的工作效率会肉眼可见地下降。',
                'body' => "1. JSON 格式化：粘贴一团乱麻，一键展开、折叠、校验。\n\n2. 时间戳转换：在 Unix 秒、毫秒和可读时间之间来回横跳。\n\n3. 密码生成器：自定义长度与字符集，顺手复制到剪贴板。\n\n4. Base64 编解码：调试接口时永远用得上。\n\n5. UUID 生成：写测试、造数据时的救命稻草。\n\n这些工具单独看都不起眼，但组合在一个随手可达的页面里，省下的上下文切换成本相当可观。",
                'cover' => 'linear-gradient(135deg,#f59e0b 0%,#ef4444 100%)',
                'tags' => '效率,开发',
                'reading_min' => 3,
                'created_at' => $now->copy()->subDays(2),
            ],
        ];

        foreach ($posts as $p) {
            Post::create($p);
        }
    }
}
