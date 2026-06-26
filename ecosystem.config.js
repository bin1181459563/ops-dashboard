module.exports = {
  apps: [
    {
      name: 'ops-backend',
      cwd: '/Users/Zhuanz/Desktop/codex/ops-dashboard/backend',
      script: 'python3',
      args: '-m uvicorn app.main:app --host 0.0.0.0 --port 8000',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
    },
    {
      name: 'ops-frontend',
      cwd: '/Users/Zhuanz/Desktop/codex/ops-dashboard/frontend',
      script: 'npx',
      args: 'next dev -p 9100',
      interpreter: 'none',
      env: {
        NODE_ENV: 'development',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
    },
  ],
};
