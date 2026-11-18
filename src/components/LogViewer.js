import { fetchApi } from '../utils/api.js';
import { subscribeSocketEvent } from '../utils/socket.js';
import { escapeHtml } from '../utils/html.js';

export function renderLogViewerControls() {
  return `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem;">
      <div style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
        <button class="btn btn-secondary btn-sm" id="btn-toggle-pause">
          ⏸ Pause Stream
        </button>
        <button class="btn btn-secondary btn-sm" id="btn-clear-logs">
          Clear Window
        </button>
        <label style="font-size: 0.85rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.4rem; cursor: pointer;">
          <input type="checkbox" id="chk-autoscroll" checked /> Auto-scroll down
        </label>
      </div>

      <div style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
        <input type="text" id="log-search-input" class="form-input" placeholder="Filter path / IP..." style="width: 200px; padding: 0.3rem 0.6rem; font-size: 0.8rem;" />
        <select id="log-status-filter" class="form-input" style="width: 140px; padding: 0.3rem 0.6rem; font-size: 0.8rem;">
          <option value="ALL">All Status Codes</option>
          <option value="2xx">2xx Success</option>
          <option value="4xx">4xx Client Error</option>
          <option value="5xx">5xx Server Error</option>
        </select>
      </div>
    </div>
  `;
}

export function initLogViewer() {
  const terminalEl = document.getElementById('terminal-log-window');
  if (!terminalEl) return () => {};

  let logs = [];
  let isPaused = false;
  let autoScroll = true;
  let filterText = '';
  let filterStatus = 'ALL';

  const pauseBtn = document.getElementById('btn-toggle-pause');
  const clearBtn = document.getElementById('btn-clear-logs');
  const autoScrollChk = document.getElementById('chk-autoscroll');
  const searchInput = document.getElementById('log-search-input');
  const statusFilterSelect = document.getElementById('log-status-filter');

  if (pauseBtn) {
    pauseBtn.onclick = () => {
      isPaused = !isPaused;
      pauseBtn.textContent = isPaused ? '▶ Resume Stream' : '⏸ Pause Stream';
      pauseBtn.className = `btn btn-sm ${isPaused ? 'btn-primary' : 'btn-secondary'}`;
    };
  }

  if (clearBtn) {
    clearBtn.onclick = () => {
      logs = [];
      renderLogs();
    };
  }

  if (autoScrollChk) {
    autoScrollChk.onchange = () => {
      autoScroll = autoScrollChk.checked;
    };
  }

  if (searchInput) {
    searchInput.oninput = (e) => {
      filterText = e.target.value.toLowerCase();
      renderLogs();
    };
  }

  if (statusFilterSelect) {
    statusFilterSelect.onchange = (e) => {
      filterStatus = e.target.value;
      renderLogs();
    };
  }

  // Load initial logs buffer from API
  fetchApi('/system/logs')
    .then((res) => {
      if (res.success) {
        const badgeEl = document.getElementById('active-log-source-badge');
        if (badgeEl && res.activeLogSource) {
          badgeEl.textContent = `Source: ${res.activeLogSource}`;
        }
        if (res.data) {
          logs = res.data.reverse();
          renderLogs();
        }
      }
    })
    .catch(() => {});

  // Subscribe to live WebSocket log stream
  const unsubscribe = subscribeSocketEvent('logs:stream', (newLog) => {
    if (isPaused) return;

    logs.push(newLog);
    if (logs.length > 250) {
      logs.shift(); // Keep maximum 250 log entries in UI DOM memory for performance
    }

    renderLogs();
  });

  function renderLogs() {
    if (!terminalEl) return;

    const filtered = logs.filter((log) => {
      // Path or IP search filter
      if (filterText && !log.path.toLowerCase().includes(filterText) && !log.ip.includes(filterText)) {
        return false;
      }
      // Status code filter
      if (filterStatus === '2xx' && (log.statusCode < 200 || log.statusCode >= 300)) return false;
      if (filterStatus === '4xx' && (log.statusCode < 400 || log.statusCode >= 500)) return false;
      if (filterStatus === '5xx' && log.statusCode < 500) return false;
      return true;
    });

    if (filtered.length === 0) {
      terminalEl.innerHTML = `<div style="color: var(--text-dim); padding: 1rem; text-align: center;">No log records match the current filter.</div>`;
      return;
    }

    terminalEl.innerHTML = filtered
      .map((l) => {
        const timeStr = escapeHtml(new Date(l.timestamp).toLocaleTimeString());
        const statusCodeNum = Number(l.statusCode) || 0;
        const statusGroup = `s${Math.floor(statusCodeNum / 100)}xx`;
        const method = escapeHtml(l.method);
        const path = escapeHtml(l.path);
        const ip = escapeHtml(l.ip);
        const responseTimeMs = Number(l.responseTimeMs) || 0;
        return `
        <div class="log-line">
          <span class="log-time">[${timeStr}]</span>
          <span class="log-method ${method}">${method}</span>
          <span class="log-status ${statusGroup}">${statusCodeNum}</span>
          <span class="log-path">${path}</span>
          <span class="mono" style="color: var(--text-dim); font-size: 0.75rem;">${responseTimeMs}ms</span>
          <span class="mono" style="color: var(--text-dim); font-size: 0.75rem;">${ip}</span>
        </div>
      `;
      })
      .join('');

    if (autoScroll) {
      terminalEl.scrollTop = terminalEl.scrollHeight;
    }
  }

  return unsubscribe;
}
