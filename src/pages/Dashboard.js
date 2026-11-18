import { subscribeSocketEvent } from '../utils/socket.js';
import { escapeHtml } from '../utils/html.js';

let currentSortKey = 'cpu'; // 'cpu' or 'mem'
let currentSortOrder = 'desc'; // 'desc' or 'asc'
let lastReceivedMetrics = null;

export function renderDashboard() {
  return `
    <div class="container">
      <div class="page-header" style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h1 class="page-title">Realtime Server Monitoring</h1>
          <p class="page-subtitle">Live hardware telemetry, resource utilization, and active server processes</p>
        </div>
        <div class="mono" style="font-size: 0.85rem; color: var(--text-dim);" id="last-updated-tick">
          Updating live...
        </div>
      </div>

      <!-- 4 Core Metrics Gauges Cards -->
      <div class="grid-4">
        <!-- CPU Card -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">CPU Utilization</span>
            <span class="mono" style="font-size: 0.8rem; color: var(--text-muted);" id="cpu-cores-text">1 Cores</span>
          </div>
          <div class="metric-value" id="val-cpu">0.0%</div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" id="bar-cpu" style="width: 0%;"></div>
          </div>
          <div class="metric-sub" id="sub-cpu">Load Avg: 0.00, 0.00, 0.00</div>
        </div>

        <!-- RAM Card -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">RAM Usage</span>
            <span class="mono" style="font-size: 0.8rem; color: var(--text-muted);" id="val-ram-pct">0%</span>
          </div>
          <div class="metric-value" id="val-ram">0 MB</div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" id="bar-ram" style="width: 0%;"></div>
          </div>
          <div class="metric-sub" id="sub-ram">Total: 0 MB</div>
        </div>

        <!-- Storage Disk Card -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Disk Storage ( / )</span>
            <span class="mono" style="font-size: 0.8rem; color: var(--text-muted);" id="val-disk-pct">0%</span>
          </div>
          <div class="metric-value" id="val-disk">0 GB</div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" id="bar-disk" style="width: 0%;"></div>
          </div>
          <div class="metric-sub" id="sub-disk">Total: 0 GB</div>
        </div>

        <!-- Network Traffic Card -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Network I/O Rate</span>
            <span class="mono" style="font-size: 0.8rem; color: var(--text-muted);">Realtime</span>
          </div>
          <div class="metric-value" id="val-net-rx">0 KB/s</div>
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem;" id="val-net-tx">
            ▲ TX: 0 KB/s
          </div>
          <div class="metric-sub" id="sub-net">Active Conns: 0</div>
        </div>
      </div>

      <!-- OS Overview & Top Processes Section -->
      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <span class="card-title">OS & System Overview</span>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <tbody>
                <tr>
                  <td style="width: 140px; color: var(--text-muted);">Hostname</td>
                  <td class="mono" id="os-hostname">-</td>
                </tr>
                <tr>
                  <td style="color: var(--text-muted);">OS / Distro</td>
                  <td id="os-distro">Ubuntu Linux</td>
                </tr>
                <tr>
                  <td style="color: var(--text-muted);">Kernel</td>
                  <td class="mono" id="os-kernel">-</td>
                </tr>
                <tr>
                  <td style="color: var(--text-muted);">System Uptime</td>
                  <td class="mono" id="os-uptime">-</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Active Processes Card with Interactive Sorting -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Top Active Processes</span>
            <span class="mono" style="font-size: 0.8rem; color: var(--text-muted);" id="proc-count">Total: 0</span>
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>PID</th>
                  <th>Process Name</th>
                  <th>User</th>
                  <th id="th-sort-cpu" style="cursor: pointer; user-select: none; color: var(--color-accent);" title="Click to sort by CPU %">
                    CPU (%) <span id="sort-icon-cpu">▼</span>
                  </th>
                  <th id="th-sort-mem" style="cursor: pointer; user-select: none;" title="Click to sort by RAM %">
                    RAM (%) <span id="sort-icon-mem"></span>
                  </th>
                </tr>
              </thead>
              <tbody id="top-processes-tbody">
                <tr><td colspan="5" style="text-align: center; color: var(--text-dim);">Waiting for telemetry stream...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function initDashboard() {
  // Bind Column Sorting Event Handlers
  const thCpu = document.getElementById('th-sort-cpu');
  const thMem = document.getElementById('th-sort-mem');

  if (thCpu) {
    thCpu.onclick = () => {
      if (currentSortKey === 'cpu') {
        currentSortOrder = currentSortOrder === 'desc' ? 'asc' : 'desc';
      } else {
        currentSortKey = 'cpu';
        currentSortOrder = 'desc';
      }
      updateSortHeaderUI();
      if (lastReceivedMetrics) renderProcessesTable(lastReceivedMetrics.topProcesses);
    };
  }

  if (thMem) {
    thMem.onclick = () => {
      if (currentSortKey === 'mem') {
        currentSortOrder = currentSortOrder === 'desc' ? 'asc' : 'desc';
      } else {
        currentSortKey = 'mem';
        currentSortOrder = 'desc';
      }
      updateSortHeaderUI();
      if (lastReceivedMetrics) renderProcessesTable(lastReceivedMetrics.topProcesses);
    };
  }

  const unsubscribe = subscribeSocketEvent('metrics:update', (data) => {
    lastReceivedMetrics = data;
    updateDashboardUI(data);
  });

  return unsubscribe;
}

function updateSortHeaderUI() {
  const iconCpu = document.getElementById('sort-icon-cpu');
  const iconMem = document.getElementById('sort-icon-mem');
  const thCpu = document.getElementById('th-sort-cpu');
  const thMem = document.getElementById('th-sort-mem');

  const arrow = currentSortOrder === 'desc' ? '▼' : '▲';

  if (iconCpu && iconMem) {
    if (currentSortKey === 'cpu') {
      iconCpu.textContent = arrow;
      iconMem.textContent = '';
      if (thCpu) thCpu.style.color = 'var(--color-accent)';
      if (thMem) thMem.style.color = 'var(--text-muted)';
    } else {
      iconCpu.textContent = '';
      iconMem.textContent = arrow;
      if (thCpu) thCpu.style.color = 'var(--text-muted)';
      if (thMem) thMem.style.color = 'var(--color-accent)';
    }
  }
}

function updateDashboardUI(m) {
  if (!m) return;

  const tickEl = document.getElementById('last-updated-tick');
  if (tickEl) tickEl.textContent = `Last Tick: ${new Date().toLocaleTimeString()}`;

  // CPU
  const cpuVal = document.getElementById('val-cpu');
  const cpuBar = document.getElementById('bar-cpu');
  const cpuSub = document.getElementById('sub-cpu');
  const cpuCores = document.getElementById('cpu-cores-text');

  if (cpuVal) cpuVal.textContent = `${m.cpuLoad}%`;
  if (cpuCores) cpuCores.textContent = `${m.cpuCores || 1} Cores`;
  if (cpuSub && m.loadAverage) cpuSub.textContent = `Load Avg: ${m.loadAverage.join(', ')}`;
  if (cpuBar) {
    cpuBar.style.width = `${Math.min(100, m.cpuLoad)}%`;
    cpuBar.className = `progress-bar-fill ${m.cpuLoad > 85 ? 'danger' : m.cpuLoad > 70 ? 'warning' : ''}`;
  }

  // RAM
  const ramVal = document.getElementById('val-ram');
  const ramPct = document.getElementById('val-ram-pct');
  const ramBar = document.getElementById('bar-ram');
  const ramSub = document.getElementById('sub-ram');

  if (ramVal) ramVal.textContent = `${m.memoryUsed} MB`;
  if (ramPct) ramPct.textContent = `${m.memoryPercentage}%`;
  if (ramSub) ramSub.textContent = `Total: ${m.memoryTotal} MB`;
  if (ramBar) {
    ramBar.style.width = `${Math.min(100, m.memoryPercentage)}%`;
    ramBar.className = `progress-bar-fill ${m.memoryPercentage > 90 ? 'danger' : m.memoryPercentage > 75 ? 'warning' : ''}`;
  }

  // Disk
  const diskVal = document.getElementById('val-disk');
  const diskPct = document.getElementById('val-disk-pct');
  const diskBar = document.getElementById('bar-disk');
  const diskSub = document.getElementById('sub-disk');

  if (diskVal) diskVal.textContent = `${m.diskUsed} GB`;
  if (diskPct) diskPct.textContent = `${m.diskPercentage}%`;
  if (diskSub) diskSub.textContent = `Total: ${m.diskTotal} GB`;
  if (diskBar) {
    diskBar.style.width = `${Math.min(100, m.diskPercentage)}%`;
    diskBar.className = `progress-bar-fill ${m.diskPercentage > 90 ? 'danger' : m.diskPercentage > 80 ? 'warning' : ''}`;
  }

  // Net
  const netRx = document.getElementById('val-net-rx');
  const netTx = document.getElementById('val-net-tx');
  const netSub = document.getElementById('sub-net');

  const formatNet = (bytes) => (bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB/s` : `${(bytes / 1024).toFixed(1)} KB/s`);
  if (netRx) netRx.textContent = `▼ RX: ${formatNet(m.networkRxSec || 0)}`;
  if (netTx) netTx.textContent = `▲ TX: ${formatNet(m.networkTxSec || 0)}`;
  if (netSub) netSub.textContent = `Active Conns: ${m.activeConnections || 0}`;

  // OS Info
  if (m.osInfo) {
    const osHost = document.getElementById('os-hostname');
    const osDist = document.getElementById('os-distro');
    const osKern = document.getElementById('os-kernel');
    const osUpt = document.getElementById('os-uptime');

    if (osHost) osHost.textContent = m.osInfo.hostname || '-';
    if (osDist) osDist.textContent = `${m.osInfo.distro || 'Ubuntu'} (${m.osInfo.platform || 'Linux'})`;
    if (osKern) osKern.textContent = m.osInfo.kernel || '-';
    if (osUpt) {
      const sec = m.osInfo.uptime || 0;
      const days = Math.floor(sec / 86400);
      const hours = Math.floor((sec % 86400) / 3600);
      const mins = Math.floor((sec % 3600) / 60);
      osUpt.textContent = `${days}d ${hours}h ${mins}m`;
    }
  }

  const procCount = document.getElementById('proc-count');
  if (procCount) procCount.textContent = `Total: ${m.processCount || 0}`;

  // Render Processes Table with current sort order
  renderProcessesTable(m.topProcesses);
}

function renderProcessesTable(processes) {
  const procTbody = document.getElementById('top-processes-tbody');
  if (!procTbody || !processes) return;

  if (processes.length === 0) {
    procTbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-dim);">No active processes found</td></tr>`;
    return;
  }

  // Clone & sort processes array based on currentSortKey and currentSortOrder
  const sorted = [...processes].sort((a, b) => {
    const valA = a[currentSortKey] || 0;
    const valB = b[currentSortKey] || 0;
    return currentSortOrder === 'desc' ? valB - valA : valA - valB;
  });

  procTbody.innerHTML = sorted
    .map(
      (p) => `
    <tr>
      <td class="mono">${escapeHtml(p.pid)}</td>
      <td class="mono" style="font-weight: 600;">${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.user)}</td>
      <td class="mono" style="color: ${p.cpu > 50 ? 'var(--color-danger)' : currentSortKey === 'cpu' ? 'var(--color-accent)' : 'var(--text-main)'}">${escapeHtml(p.cpu)}%</td>
      <td class="mono" style="color: ${currentSortKey === 'mem' ? 'var(--color-accent)' : 'var(--text-muted)'}">${escapeHtml(p.mem)}%</td>
    </tr>
  `
    )
    .join('');
}
