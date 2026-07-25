# 🛡️ Ubuntu Realtime Server Sentinel

A high-performance, lightweight, open-source real-time server monitoring and threat detection web application built for Ubuntu Linux servers using Node.js, Express, Socket.io, Vite, systeminformation, and MongoDB Atlas.

---

## 🌟 Key Features

1. **Realtime Server Performance Telemetry**:
   - Live stream CPU utilization, RAM usage, Swap, Disk I/O, Network Tx/Rx, and top active processes over WebSockets.
   - Low Overhead Architecture: Live sampling every 2 seconds, MongoDB Atlas persistence every 15 seconds to minimize CPU and DB operations.

2. **Historical Performance & Analytics (Max 30 Days Retention)**:
   - Interactive line graphs for 1 Hour, 24 Hours, 7 Days, and 30 Days.
   - Automatic 30-day data deletion in MongoDB Atlas using TTL Indexes (`expireAfterSeconds: 2592000`).
   - **Manual Purge Button** with safety modal confirmation to clean database history instantly.

3. **Threat, Anomaly & Hack Detection**:
   - Detects CPU load spikes, RAM exhaustion, disk space critical warnings.
   - Identifies suspicious processes (e.g. cryptominers or reverse shell executions).
   - Detects rapid request rate anomalies (potential DDoS or brute-force attack attempts).

4. **Realtime Request Log Viewer**:
   - Terminal-style live stream of incoming HTTP / Nginx access logs.
   - Includes stream pause/resume, search filter (path/IP), and status code level filtering (2xx, 4xx, 5xx) with zero UI freezing.

5. **Clean Minimalist Design System**:
   - Strict UI directives: **No gradients**, **no sparkle icons**, **no marquee scrolling text**, **no section badge tags** (clean developer tool aesthetic).

---

## 🚀 Quick Start (Development)

1. **Clone & Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and fill in your MongoDB Atlas connection string:
   ```bash
   cp .env.example .env
   ```

3. **Run Application**:
   - Full Dev Stack (Backend + Vite Frontend):
     ```bash
     npm run dev:all
     ```
   - Server Only:
     ```bash
     npm run dev
     ```

   Open `http://localhost:3000` in your browser.

---

## 🔧 Production Deployment on Ubuntu Server (systemctl + Nginx)

### 1. Build Frontend Artifacts
```bash
npm run build
```

### 2. Configure Systemd Service (`systemctl`)
Create a new service file at `/etc/systemd/system/ubuntu-monitor.service`:

```ini
[Unit]
Description=Ubuntu Realtime Server Monitoring Service
After=network.target mongodb.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ubuntu-monitor
ExecStart=/usr/bin/node /opt/ubuntu-monitor/server/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=5000

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ubuntu-monitor
sudo systemctl status ubuntu-monitor
```

### 3. Configure Nginx Reverse Proxy
Create an Nginx configuration file at `/etc/nginx/sites-available/ubuntu-monitor`:

```nginx
server {
    listen 80;
    server_name your-server-ip-or-domain;

    # Static Built Frontend
    location / {
        root /opt/ubuntu-monitor/dist;
        try_files $uri $uri/ /index.html;
    }

    # REST API Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSockets Proxy for Realtime Telemetry
    location /socket.io/ {
        proxy_pass http://127.0.0.1:5000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and reload Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/ubuntu-monitor /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 🍃 MongoDB Atlas 30-Day TTL Retention & Manual Purge

All telemetry documents written to MongoDB Atlas include a 30-day TTL index:
- Collection `metrichistories`: TTL Index on `timestamp` (`expireAfterSeconds: 2592000`).
- Collection `securityalerts`: TTL Index on `timestamp` (`expireAfterSeconds: 2592000`).
- Collection `requestlogs`: TTL Index on `timestamp` (`expireAfterSeconds: 2592000`).

To manually purge historical data at any time:
1. Go to the **Analisis History** page in the web interface.
2. Click **Hapus Data Manual**.
3. Select your desired retention range and confirm in the popup modal.

---

## 📄 License
MIT License - Open Source Software
