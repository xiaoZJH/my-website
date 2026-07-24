module.exports = {
  apps: [{
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
  }]
};
