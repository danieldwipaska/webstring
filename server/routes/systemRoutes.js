import express from 'express';
import { getDBStatus } from '../config/db.js';
import { getRecentLogs, getActiveLogSource } from '../services/logWatcher.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// GET /api/system/status (Public or protected)
router.get('/status', (req, res) => {
  const memoryUsage = process.memoryUsage();
  res.json({
    success: true,
    data: {
      uptimeSeconds: Math.floor(process.uptime()),
      db: getDBStatus(),
      processMemoryMb: {
        rss: Math.round(memoryUsage.rss / (1024 * 1024)),
        heapTotal: Math.round(memoryUsage.heapTotal / (1024 * 1024)),
        heapUsed: Math.round(memoryUsage.heapUsed / (1024 * 1024)),
      },
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    },
  });
});

// GET /api/system/logs - Fetch recent HTTP request logs (Protected)
router.get('/logs', protect, (req, res) => {
  res.json({
    success: true,
    activeLogSource: getActiveLogSource(),
    data: getRecentLogs(),
  });
});

// GET /api/system/setup-instructions - Get systemctl and Nginx configs (Public)
router.get('/setup-instructions', (req, res) => {
  const port = process.env.PORT || 5000;
  const appDir = process.cwd();

  const systemdService = `[Unit]
Description=Ubuntu Realtime Server Monitoring Service
After=network.target mongodb.service

[Service]
Type=simple
User=root
WorkingDirectory=${appDir}
ExecStart=/usr/bin/node ${appDir}/server/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=${port}

[Install]
WantedBy=multi-user.target`;

  const nginxConfig = `server {
    listen 80;
    server_name your-server-ip-or-domain;

    # Serve static built frontend files
    location / {
        root ${appDir}/dist;
        try_files $uri $uri/ /index.html;
    }

    # Proxy REST API requests
    location /api/ {
        proxy_pass http://127.0.0.1:${port}/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Proxy Realtime WebSocket requests
    location /socket.io/ {
        proxy_pass http://127.0.0.1:${port}/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}`;

  res.json({
    success: true,
    data: {
      systemdService,
      nginxConfig,
      cliCommands: [
        '# 1. Install dependencies & build frontend',
        'npm install',
        'npm run build',
        '',
        '# 2. Setup Systemd Service',
        'sudo nano /etc/systemd/system/ubuntu-monitor.service',
        'sudo systemctl daemon-reload',
        'sudo systemctl enable --now ubuntu-monitor',
        'sudo systemctl status ubuntu-monitor',
        '',
        '# 3. Setup Nginx Reverse Proxy',
        'sudo nano /etc/nginx/sites-available/ubuntu-monitor',
        'sudo ln -s /etc/nginx/sites-available/ubuntu-monitor /etc/nginx/sites-enabled/',
        'sudo nginx -t',
        'sudo systemctl reload nginx',
      ],
    },
  });
});

export default router;
