module.exports = {
  apps: [
    {
      // ---- 主应用：工具箱网站 + 去水印 sidecar ----
      name: 'toolbox',
      script: './server/server.js',
      args: '--experimental-sqlite',
      // 单进程模式：本项目 server.js 自行 spawn Python 子进程，绝不能用 cluster
      // （cluster 下多个 worker 会各自 spawn 子进程并争抢 4173 端口）
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        PORT: 4173,
        WM_PORT: 5001,
        WM_BASE_PATH: '/watermark-remover'
      }
    },
    {
      // ---- WebHook 接收端：监听 Gitee Push 事件，触发自动部署 ----
      name: 'toolbox-webhook',
      script: './webhook-server.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '128M',
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        WEBHOOK_PORT: 9000,
        // ⚠️ 必须修改为你的密码，并与 Gitee 后台 WebHook 密码一致
        WEBHOOK_SECRET: 'CHANGE_ME_TO_A_STRONG_SECRET',
        DEPLOY_SCRIPT: '/opt/toolbox-website/deploy.sh'
      }
    }
  ]
};
