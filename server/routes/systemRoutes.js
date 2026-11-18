import express from 'express';
import { getDBStatus } from '../config/db.js';
import {
  getRecentLogs,
  getActiveLogSource,
  listHistoricalLogFiles,
  queryHistoricalLogs,
} from '../services/logWatcher.js';
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

// GET /api/system/logs/files - List allowlisted configured log files & sources (Protected)
router.get('/logs/files', protect, (req, res) => {
  res.json({
    success: true,
    systemTailerEnabled: (process.env.ENABLE_SYSTEM_LOG_TAILER || 'false').toLowerCase() === 'true',
    dbConnected: getDBStatus().isConnected,
    sources: listHistoricalLogFiles(),
  });
});

// GET /api/system/logs/history - Read and query historical log files / MongoDB logs (Protected)
router.get('/logs/history', protect, async (req, res) => {
  try {
    const source = typeof req.query.source === 'string' ? req.query.source : 'ALL';
    const file = typeof req.query.file === 'string' ? req.query.file : 'latest';
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const level = typeof req.query.level === 'string' ? req.query.level : 'ALL';
    const from = typeof req.query.from === 'string' ? req.query.from : '';
    const to = typeof req.query.to === 'string' ? req.query.to : '';
    const limit = typeof req.query.limit === 'string' ? req.query.limit : '200';
    const order = typeof req.query.order === 'string' ? req.query.order : 'desc';

    const result = await queryHistoricalLogs({
      source,
      file,
      q,
      level,
      from,
      to,
      limit,
      order,
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[Historical Logs Query Error]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to query historical logs.' });
  }
});

// GET /api/system/setup-instructions - Static hardened deployment templates (no runtime path/port leakage)
router.get('/setup-instructions', (req, res) => {
  const systemdService = `[Unit]
Description=Webstring Realtime Server Sentinel Service
After=network-online.target mongod.service
Wants=network-online.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/webstring
EnvironmentFile=/var/www/webstring/.env
Environment=PATH=/opt/node20/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=3004
ExecStart=/opt/node20/bin/node /var/www/webstring/server/index.js
Restart=always
RestartSec=10
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true

[Install]
WantedBy=multi-user.target`;

  const nginxConfig = `server {
    listen 80;
    server_name monitor.your-domain.com;

    access_log /var/log/nginx/monitor-access.log;

    # Optional: Restrict dashboard access to trusted admin/VPN IPs only
    # allow 203.0.113.10;
    # deny all;

    # Serve static built frontend files
    location / {
        root /var/www/webstring/dist;
        try_files $uri $uri/ /index.html;
    }

    # Proxy REST API requests
    location /api/ {
        proxy_pass http://127.0.0.1:3004/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Proxy Realtime WebSocket requests
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3004/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}`;

  res.json({
    success: true,
    data: {
      systemdService,
      nginxConfig,
      cliCommands: [
        '# 1. Install dependencies & build frontend',
        'cd /var/www/webstring && npm ci && npm run build',
        '',
        '# 2. Configure .env with a strong 64-char random JWT_SECRET',
        'openssl rand -hex 32',
        '',
        '# 3. Setup Systemd Service',
        'sudo cp deployment/ubuntu-monitor.service /etc/systemd/system/ubuntu-monitor.service',
        'sudo systemctl daemon-reload',
        'sudo systemctl enable --now ubuntu-monitor',
        '',
        '# 4. Setup Isolated Nginx Subdomain & HTTPS (Certbot)',
        'sudo cp deployment/nginx-monitor.conf /etc/nginx/sites-available/ubuntu-monitor',
        'sudo ln -s /etc/nginx/sites-available/ubuntu-monitor /etc/nginx/sites-enabled/',
        'sudo nginx -t && sudo systemctl reload nginx',
        'sudo certbot --nginx -d monitor.your-domain.com',
      ],
    },
  });
});

export default router;
