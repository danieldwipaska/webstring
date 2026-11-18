import express from 'express';
import { getDBStatus } from '../config/db.js';
import { getRecentLogs, getActiveLogSource } from '../services/logWatcher.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// GET /api/system/status (Protected - avoids leaking internal DB/runtime details publicly)
router.get('/status', protect, (req, res) => {
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

// GET /api/system/setup-instructions - Static hardened deployment templates (no runtime path/port leakage)
router.get('/setup-instructions', (req, res) => {
  const systemdService = `[Unit]
Description=Ubuntu Realtime Server Monitoring Service
After=network.target mongod.service

[Service]
Type=simple
User=ubuntu-monitor
Group=ubuntu-monitor
WorkingDirectory=/opt/ubuntu-monitor
EnvironmentFile=/opt/ubuntu-monitor/.env
ExecStart=/usr/bin/node /opt/ubuntu-monitor/server/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=5000
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target`;

  const nginxConfig = `server {
    listen 80;
    server_name monitor.your-domain.com;

    # Optional: Restrict dashboard access to trusted admin/VPN IPs only
    # allow 10.0.0.0/8;
    # deny all;

    # Serve static built frontend files
    location / {
        root /opt/ubuntu-monitor/dist;
        try_files $uri $uri/ /index.html;
    }

    # Proxy REST API requests
    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Proxy Realtime WebSocket requests
    location /socket.io/ {
        proxy_pass http://127.0.0.1:5000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}`;

  res.json({
    success: true,
    data: {
      systemdService,
      nginxConfig,
      cliCommands: [
        '# 1. Create dedicated non-root system user & install',
        'sudo useradd --system --no-create-home --shell /usr/sbin/nologin ubuntu-monitor',
        'npm ci && npm run build',
        '',
        '# 2. Configure .env with a strong 64-char random JWT_SECRET',
        'openssl rand -hex 32',
        '',
        '# 3. Setup Systemd Service',
        'sudo cp deployment/ubuntu-monitor.service /etc/systemd/system/ubuntu-monitor.service',
        'sudo systemctl daemon-reload',
        'sudo systemctl enable --now ubuntu-monitor',
        '',
        '# 4. Setup Isolated Nginx Subdomain & TLS (Certbot)',
        'sudo cp deployment/nginx-monitor.conf /etc/nginx/sites-available/ubuntu-monitor',
        'sudo ln -s /etc/nginx/sites-available/ubuntu-monitor /etc/nginx/sites-enabled/',
        'sudo nginx -t && sudo systemctl reload nginx',
      ],
    },
  });
});

export default router;
