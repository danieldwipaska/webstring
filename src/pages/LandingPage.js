import { fetchApi } from '../utils/api.js';

export function renderLandingPage(navigate) {
  return `
    <div class="container">
      <!-- Main Hero Section -->
      <section style="padding: 3rem 0; text-align: left; border-bottom: 1px solid var(--border-color); margin-bottom: 3rem;">
        <h1 style="font-size: 2.5rem; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 1rem; color: var(--text-main);">
          Ubuntu Realtime Server Sentinel
        </h1>
        <p style="font-size: 1.1rem; color: var(--text-muted); max-width: 800px; line-height: 1.6; margin-bottom: 2rem;">
          Real-time performance telemetry and threat monitoring platform for Ubuntu Linux servers. Ultra lightweight (low-overhead), integrated with MongoDB Atlas, featuring up to 30 days of data analytics retention, automated security anomaly detection, and live HTTP/Nginx log streaming via systemctl & Nginx.
        </p>
        <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
          <button class="btn btn-primary" id="btn-launch-dashboard">Launch Live Dashboard</button>
          <a href="#setup-guide" class="btn btn-secondary">Open Source Setup Guide</a>
          <a href="https://wa.me/6285172160300" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">Chat on WhatsApp</a>
        </div>
      </section>

      <!-- Key Features Section -->
      <section style="margin-bottom: 4rem;">
        <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1.5rem;">Core Monitoring Features</h2>

        <div class="grid-4">
          <div class="card">
            <div class="card-title" style="margin-bottom: 0.5rem; font-size: 1.05rem;">
              Low-Overhead Realtime Telemetry
            </div>
            <p style="font-size: 0.875rem; color: var(--text-muted); line-height: 1.5;">
              Samples CPU, RAM, Swap, Disk I/O, and Network Tx/Rx metrics every 2 seconds over WebSockets without straining your Ubuntu server's CPU.
            </p>
          </div>

          <div class="card">
            <div class="card-title" style="margin-bottom: 0.5rem; font-size: 1.05rem;">
              30-Day Retention & Historical Analytics
            </div>
            <p style="font-size: 0.875rem; color: var(--text-muted); line-height: 1.5;">
              Interactive multi-axis performance graphs (1h, 24h, 7d, 30d). Synchronized to MongoDB Atlas with 30-day TTL automated purging + instant manual purge option.
            </p>
          </div>

          <div class="card">
            <div class="card-title" style="margin-bottom: 0.5rem; font-size: 1.05rem;">
              Threat & Anomaly Detection
            </div>
            <p style="font-size: 0.875rem; color: var(--text-muted); line-height: 1.5;">
              Detects sustained CPU/RAM exhaustion, brute-force / DDoS request spikes, and suspicious processes (cryptominers or unauthorized reverse shells).
            </p>
          </div>

          <div class="card">
            <div class="card-title" style="margin-bottom: 0.5rem; font-size: 1.05rem;">
              Live Request Log Streaming
            </div>
            <p style="font-size: 0.875rem; color: var(--text-muted); line-height: 1.5;">
              Streams live incoming HTTP / Nginx access logs with stream pause/play controls, search filters, and status code level filtering (2xx, 4xx, 5xx).
            </p>
          </div>
        </div>
      </section>

      <!-- Open Source Self-Hosting Guide (Systemctl & Nginx) -->
      <section id="setup-guide" style="margin-bottom: 4rem;">
        <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem;">Self-Hosting & Deployment Instructions</h2>
        <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 2rem;">
          This open-source application is engineered to run directly on your Ubuntu server as a background service (<code>systemctl</code>) proxied by Nginx.
        </p>

        <div class="card" style="margin-bottom: 1.5rem;">
          <div class="card-title">1. Setup Systemd Unit Service (systemctl)</div>
          <p style="font-size: 0.875rem; color: var(--text-muted); margin-top: 0.5rem;">
            Create a unit file at <code>/etc/systemd/system/ubuntu-monitor.service</code> to automatically start the application on boot:
          </p>
          <div class="code-box" id="systemd-code-box">Loading configuration template...</div>
        </div>

        <div class="card" style="margin-bottom: 1.5rem;">
          <div class="card-title">2. Setup Nginx Reverse Proxy</div>
          <p style="font-size: 0.875rem; color: var(--text-muted); margin-top: 0.5rem;">
            Configure Nginx at <code>/etc/nginx/sites-available/ubuntu-monitor</code> to handle static files, REST API, and WebSockets handshake:
          </p>
          <div class="code-box" id="nginx-code-box">Loading configuration template...</div>
        </div>

        <div class="card" style="margin-bottom: 1.5rem;">
          <div class="card-title">3. Execution CLI Commands</div>
          <div class="code-box" id="cli-code-box">Loading CLI commands...</div>
        </div>
      </section>

      <!-- CALL TO ACTION (CTA) SECTION -->
      <section style="margin-bottom: 4rem; border-top: 1px solid var(--border-color); padding-top: 3rem;">
        <div class="card" style="padding: 2rem; background-color: var(--bg-card); border: 1px solid var(--border-color);">
          <h2 style="font-size: 1.6rem; font-weight: 700; margin-bottom: 0.75rem; color: var(--text-main);">
            Connect & Collaborate with the Creator
          </h2>
          <p style="font-size: 0.95rem; color: var(--text-muted); line-height: 1.6; max-width: 800px; margin-bottom: 1.75rem;">
            Ubuntu Server Sentinel is an open-source project created by <strong>Daniel Kamasi</strong>. Need custom server infrastructure monitoring, DevOps automation, software development, or technical consulting? Get in touch directly or explore our web engineering solutions below.
          </p>

          <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
            <a href="https://wa.me/6285172160300" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
              </svg>
              WhatsApp (+62 851-7216-0300)
            </a>

            <a href="https://webshake.id" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
              Business Web (Webshake.id)
            </a>

            <a href="https://danielkamasi.my.id" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              Personal Web (danielkamasi.my.id)
            </a>
          </div>
        </div>
      </section>
    </div>
  `;
}

export async function initLandingPage(navigate) {
  const btnLaunch = document.getElementById('btn-launch-dashboard');
  if (btnLaunch) {
    btnLaunch.onclick = () => navigate('dashboard');
  }

  // Load dynamic systemctl and nginx setup instructions from API
  try {
    const res = await fetchApi('/system/setup-instructions');
    if (res.success) {
      const systemdBox = document.getElementById('systemd-code-box');
      const nginxBox = document.getElementById('nginx-code-box');
      const cliBox = document.getElementById('cli-code-box');

      if (systemdBox) systemdBox.textContent = res.data.systemdService;
      if (nginxBox) nginxBox.textContent = res.data.nginxConfig;
      if (cliBox) cliBox.textContent = res.data.cliCommands.join('\n');
    }
  } catch (err) {
    console.warn('Could not fetch setup instructions from server API.');
  }
}
