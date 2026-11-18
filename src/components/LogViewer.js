import { fetchApi } from '../utils/api.js';
import { subscribeSocketEvent } from '../utils/socket.js';
import { escapeHtml } from '../utils/html.js';

export function renderLogViewerControls() {
  return `
    <!-- Mode Tabs -->
    <div style="display: flex; gap: 0.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.85rem; margin-bottom: 1rem; flex-wrap: wrap; align-items: center; justify-content: space-between;">
      <div style="display: flex; gap: 0.5rem;">
        <button class="btn btn-primary btn-sm" id="tab-live-logs">Live Stream</button>
        <button class="btn btn-secondary btn-sm" id="tab-history-logs">Historical Log Query</button>
      </div>
      <span class="mono" style="font-size: 0.78rem; color: var(--text-dim);" id="log-mode-hint">
        Streaming real-time logs over WebSocket
      </span>
    </div>

    <!-- Live Stream Controls -->
    <div id="live-controls-bar" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem;">
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
        <input type="text" id="log-search-input" class="form-input" placeholder="Filter path / message / source..." style="width: 220px; padding: 0.3rem 0.6rem; font-size: 0.8rem;" />
        <select id="log-status-filter" class="form-input" style="width: 155px; padding: 0.3rem 0.6rem; font-size: 0.8rem;">
          <option value="ALL">All Levels / Codes</option>
          <option value="2xx">2xx / INFO</option>
          <option value="4xx">4xx / WARN</option>
          <option value="5xx">5xx / ERROR</option>
          <option value="ERROR">ERROR Only</option>
          <option value="WARN">WARN Only</option>
          <option value="INFO">INFO Only</option>
          <option value="DEBUG">DEBUG Only</option>
        </select>
      </div>
    </div>

    <!-- Historical Query Controls -->
    <div id="history-controls-bar" style="display: none; margin-bottom: 1rem;">
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 0.75rem; margin-bottom: 0.75rem;">
        <div>
          <label class="form-label" style="font-size: 0.75rem; margin-bottom: 0.25rem;" for="hist-source-select">Log Source</label>
          <select id="hist-source-select" class="form-input" style="padding: 0.35rem 0.6rem; font-size: 0.8rem;">
            <option value="ALL">All Configured Sources</option>
          </select>
        </div>
        <div>
          <label class="form-label" style="font-size: 0.75rem; margin-bottom: 0.25rem;" for="hist-file-select">Target File</label>
          <select id="hist-file-select" class="form-input" style="padding: 0.35rem 0.6rem; font-size: 0.8rem;">
            <option value="latest">Latest File</option>
            <option value="all">All Matching Files</option>
          </select>
        </div>
        <div>
          <label class="form-label" style="font-size: 0.75rem; margin-bottom: 0.25rem;" for="hist-level-select">Level / Status</label>
          <select id="hist-level-select" class="form-input" style="padding: 0.35rem 0.6rem; font-size: 0.8rem;">
            <option value="ALL">All Levels / Codes</option>
            <option value="ERROR">ERROR (Winston)</option>
            <option value="WARN">WARN (Winston)</option>
            <option value="INFO">INFO (Winston)</option>
            <option value="DEBUG">DEBUG (Winston)</option>
            <option value="5xx">5xx / ERROR</option>
            <option value="4xx">4xx / WARN</option>
            <option value="2xx">2xx / OK</option>
            <option value="GET">HTTP GET</option>
            <option value="POST">HTTP POST</option>
          </select>
        </div>
        <div>
          <label class="form-label" style="font-size: 0.75rem; margin-bottom: 0.25rem;" for="hist-limit-select">Limit & Order</label>
          <div style="display: flex; gap: 0.4rem;">
            <select id="hist-limit-select" class="form-input" style="padding: 0.35rem 0.5rem; font-size: 0.8rem;">
              <option value="100">100</option>
              <option value="200" selected>200</option>
              <option value="500">500</option>
            </select>
            <select id="hist-order-select" class="form-input" style="padding: 0.35rem 0.5rem; font-size: 0.8rem;">
              <option value="desc">Newest</option>
              <option value="asc">Oldest</option>
            </select>
          </div>
        </div>
      </div>

      <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: flex-end;">
        <div style="flex: 2; min-width: 220px;">
          <label class="form-label" style="font-size: 0.75rem; margin-bottom: 0.25rem;" for="hist-query-input">Keyword / Path / IP / Error Query</label>
          <input type="text" id="hist-query-input" class="form-input" placeholder="e.g. timeout, /api/auth, disconnected, 192.168..." style="padding: 0.38rem 0.65rem; font-size: 0.82rem;" />
        </div>
        <div style="min-width: 175px;">
          <label class="form-label" style="font-size: 0.75rem; margin-bottom: 0.25rem;" for="hist-from-input">From</label>
          <input type="datetime-local" id="hist-from-input" class="form-input" style="padding: 0.34rem 0.55rem; font-size: 0.78rem;" />
        </div>
        <div style="min-width: 175px;">
          <label class="form-label" style="font-size: 0.75rem; margin-bottom: 0.25rem;" for="hist-to-input">To</label>
          <input type="datetime-local" id="hist-to-input" class="form-input" style="padding: 0.34rem 0.55rem; font-size: 0.78rem;" />
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-primary btn-sm" id="btn-run-history-query">Run Query</button>
          <button class="btn btn-secondary btn-sm" id="btn-reset-history-query">Reset</button>
          <button class="btn btn-secondary btn-sm" id="btn-refresh-log-files">Refresh Files</button>
        </div>
      </div>

      <div class="mono" id="hist-summary-bar" style="margin-top: 0.65rem; font-size: 0.75rem; color: var(--text-muted);">
        Select a source/file and click Run Query to inspect older logs.
      </div>
    </div>
  `;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderLogRows(items, showFullDate = false) {
  return items
    .map((l) => {
      const dateObj = new Date(l.timestamp);
      const timeStr = escapeHtml(
        Number.isNaN(dateObj.getTime())
          ? String(l.timestamp || '-')
          : showFullDate
            ? dateObj.toLocaleString()
            : dateObj.toLocaleTimeString()
      );
      const statusCodeNum = Number(l.statusCode) || 0;
      const statusGroup = `s${Math.floor(statusCodeNum / 100)}xx`;
      const method = escapeHtml(l.method || 'INFO');
      const path = escapeHtml(l.path || '');
      const detail = l.detail ? `<div class="mono" style="color: #fca5a5; font-size: 0.74rem; margin-top: 0.15rem; white-space: pre-wrap;">${escapeHtml(l.detail)}</div>` : '';
      const ip = escapeHtml(l.ip || 'app');
      const source = escapeHtml(l.source || 'sentinel');
      const fileBadge = l.file ? `<span class="mono" style="color: var(--text-dim); font-size: 0.7rem;">(${escapeHtml(l.file)})</span>` : '';
      const responseTimeMs = Number(l.responseTimeMs) || 0;
      const latencyBadge = l.isHttp !== false ? `<span class="mono" style="color: var(--text-dim); font-size: 0.75rem;">${responseTimeMs}ms</span>` : '';
      return `
        <div class="log-line" style="flex-direction: column; gap: 0.1rem;">
          <div style="display: flex; gap: 0.75rem; align-items: flex-start; width: 100%; flex-wrap: wrap;">
            <span class="log-time">[${timeStr}]</span>
            <span class="mono" style="color: var(--color-accent); font-size: 0.72rem;">[${source}]</span>
            <span class="log-method ${method}">${method}</span>
            <span class="log-status ${statusGroup}">${statusCodeNum}</span>
            <span class="log-path">${path}</span>
            ${latencyBadge}
            <span class="mono" style="color: var(--text-dim); font-size: 0.75rem;">${ip}</span>
            ${fileBadge}
          </div>
          ${detail}
        </div>
      `;
    })
    .join('');
}

export function initLogViewer() {
  const terminalEl = document.getElementById('terminal-log-window');
  if (!terminalEl) return () => {};

  let mode = 'live'; // 'live' | 'history'
  let liveLogs = [];
  let historyLogs = [];
  let isPaused = false;
  let autoScroll = true;
  let filterText = '';
  let filterStatus = 'ALL';
  let catalogSources = [];
  let dbConnected = false;

  const tabLive = document.getElementById('tab-live-logs');
  const tabHistory = document.getElementById('tab-history-logs');
  const liveControls = document.getElementById('live-controls-bar');
  const historyControls = document.getElementById('history-controls-bar');
  const modeHint = document.getElementById('log-mode-hint');

  const pauseBtn = document.getElementById('btn-toggle-pause');
  const clearBtn = document.getElementById('btn-clear-logs');
  const autoScrollChk = document.getElementById('chk-autoscroll');
  const searchInput = document.getElementById('log-search-input');
  const statusFilterSelect = document.getElementById('log-status-filter');

  const histSourceSelect = document.getElementById('hist-source-select');
  const histFileSelect = document.getElementById('hist-file-select');
  const histLevelSelect = document.getElementById('hist-level-select');
  const histLimitSelect = document.getElementById('hist-limit-select');
  const histOrderSelect = document.getElementById('hist-order-select');
  const histQueryInput = document.getElementById('hist-query-input');
  const histFromInput = document.getElementById('hist-from-input');
  const histToInput = document.getElementById('hist-to-input');
  const histRunBtn = document.getElementById('btn-run-history-query');
  const histResetBtn = document.getElementById('btn-reset-history-query');
  const histRefreshFilesBtn = document.getElementById('btn-refresh-log-files');
  const histSummaryBar = document.getElementById('hist-summary-bar');

  function switchMode(nextMode) {
    mode = nextMode;
    if (mode === 'live') {
      tabLive.className = 'btn btn-primary btn-sm';
      tabHistory.className = 'btn btn-secondary btn-sm';
      liveControls.style.display = 'flex';
      historyControls.style.display = 'none';
      if (modeHint) modeHint.textContent = 'Streaming real-time logs over WebSocket';
      renderLiveLogs();
    } else {
      tabLive.className = 'btn btn-secondary btn-sm';
      tabHistory.className = 'btn btn-primary btn-sm';
      liveControls.style.display = 'none';
      historyControls.style.display = 'block';
      if (modeHint) modeHint.textContent = 'Querying historical & rotated log files (Winston, NestJS, Nginx, MongoDB)';
      if (catalogSources.length === 0) {
        loadAvailableLogFiles();
      }
      renderHistoryLogs();
    }
  }

  if (tabLive) tabLive.onclick = () => switchMode('live');
  if (tabHistory) tabHistory.onclick = () => switchMode('history');

  if (pauseBtn) {
    pauseBtn.onclick = () => {
      isPaused = !isPaused;
      pauseBtn.textContent = isPaused ? '▶ Resume Stream' : '⏸ Pause Stream';
      pauseBtn.className = `btn btn-sm ${isPaused ? 'btn-primary' : 'btn-secondary'}`;
    };
  }

  if (clearBtn) {
    clearBtn.onclick = () => {
      liveLogs = [];
      renderLiveLogs();
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
      renderLiveLogs();
    };
  }

  if (statusFilterSelect) {
    statusFilterSelect.onchange = (e) => {
      filterStatus = e.target.value;
      renderLiveLogs();
    };
  }

  async function loadAvailableLogFiles() {
    if (!histSourceSelect) return;
    try {
      const res = await fetchApi('/system/logs/files');
      if (res.success) {
        catalogSources = res.sources || [];
        dbConnected = Boolean(res.dbConnected);

        const prevSource = histSourceSelect.value;
        const options = ['<option value="ALL">All Configured Disk Sources</option>'];
        for (const s of catalogSources) {
          options.push(
            `<option value="${escapeHtml(s.source)}">${escapeHtml(s.source)} (${s.files.length} files)</option>`
          );
        }
        if (dbConnected) {
          options.push('<option value="sentinel-http-db">MongoDB Persisted HTTP Logs (30d)</option>');
        }
        histSourceSelect.innerHTML = options.join('');

        if (prevSource && [...histSourceSelect.options].some((o) => o.value === prevSource)) {
          histSourceSelect.value = prevSource;
        }
        populateFileDropdown();

        if (!res.systemTailerEnabled && histSummaryBar) {
          histSummaryBar.textContent =
            'System log tailing is disabled (ENABLE_SYSTEM_LOG_TAILER=false). Enable it with LOG_FILE_PATHS in .env to query external/Winston logs, or select MongoDB HTTP Logs.';
        }
      }
    } catch (err) {
      if (histSummaryBar) histSummaryBar.textContent = `Failed to load log files: ${err.message}`;
    }
  }

  function populateFileDropdown() {
    if (!histFileSelect || !histSourceSelect) return;
    const selectedSource = histSourceSelect.value;

    if (selectedSource === 'sentinel-http-db') {
      histFileSelect.innerHTML = '<option value="all">MongoDB Collection (requestlogs)</option>';
      histFileSelect.disabled = true;
      return;
    }

    histFileSelect.disabled = false;
    const options = [
      '<option value="latest">Latest File</option>',
      '<option value="all">All Matching Files (up to 25 newest)</option>',
    ];

    if (selectedSource !== 'ALL') {
      const srcObj = catalogSources.find((s) => s.source === selectedSource);
      if (srcObj && srcObj.files.length > 0) {
        for (const f of srcObj.files) {
          options.push(
            `<option value="${escapeHtml(f.name)}">${escapeHtml(f.name)} (${formatBytes(f.sizeBytes)})</option>`
          );
        }
      }
    }

    histFileSelect.innerHTML = options.join('');
  }

  async function runHistoryQuery() {
    if (!histRunBtn || !histSummaryBar) return;
    histRunBtn.disabled = true;
    histRunBtn.textContent = 'Querying...';
    histSummaryBar.textContent = 'Scanning log files...';

    try {
      const params = new URLSearchParams({
        source: histSourceSelect?.value || 'ALL',
        file: histFileSelect?.value || 'latest',
        level: histLevelSelect?.value || 'ALL',
        limit: histLimitSelect?.value || '200',
        order: histOrderSelect?.value || 'desc',
      });

      const qVal = histQueryInput?.value.trim();
      if (qVal) params.set('q', qVal);
      if (histFromInput?.value) params.set('from', new Date(histFromInput.value).toISOString());
      if (histToInput?.value) params.set('to', new Date(histToInput.value).toISOString());

      const res = await fetchApi(`/system/logs/history?${params.toString()}`);
      if (res.success) {
        historyLogs = res.items || [];
        const filesDesc =
          res.filesScanned && res.filesScanned.length > 0 ? res.filesScanned.join(', ') : 'none';
        const truncNote = res.truncated ? ' [Scan limit reached — narrow file or date range for deeper search]' : '';
        histSummaryBar.textContent = `Matched ${historyLogs.length} entries | Scanned ${res.scannedLines || 0} lines across: ${filesDesc}${truncNote}`;
        renderHistoryLogs();
      }
    } catch (err) {
      histSummaryBar.textContent = `Query failed: ${err.message}`;
    } finally {
      histRunBtn.disabled = false;
      histRunBtn.textContent = 'Run Query';
    }
  }

  if (histSourceSelect) histSourceSelect.onchange = populateFileDropdown;
  if (histRunBtn) histRunBtn.onclick = runHistoryQuery;
  if (histRefreshFilesBtn) histRefreshFilesBtn.onclick = loadAvailableLogFiles;
  if (histQueryInput) {
    histQueryInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runHistoryQuery();
      }
    };
  }
  if (histResetBtn) {
    histResetBtn.onclick = () => {
      if (histQueryInput) histQueryInput.value = '';
      if (histFromInput) histFromInput.value = '';
      if (histToInput) histToInput.value = '';
      if (histLevelSelect) histLevelSelect.value = 'ALL';
      if (histLimitSelect) histLimitSelect.value = '200';
      if (histOrderSelect) histOrderSelect.value = 'desc';
      if (histSourceSelect) histSourceSelect.value = 'ALL';
      populateFileDropdown();
      historyLogs = [];
      renderHistoryLogs();
    };
  }

  // Load initial live logs buffer from API
  fetchApi('/system/logs')
    .then((res) => {
      if (res.success) {
        const badgeEl = document.getElementById('active-log-source-badge');
        if (badgeEl && res.activeLogSource) {
          badgeEl.textContent = `Source: ${res.activeLogSource}`;
        }
        if (res.data) {
          liveLogs = res.data.reverse();
          renderLiveLogs();
        }
      }
    })
    .catch(() => {});

  // Subscribe to live WebSocket log stream
  const unsubscribe = subscribeSocketEvent('logs:stream', (newLog) => {
    if (isPaused) return;

    liveLogs.push(newLog);
    if (liveLogs.length > 250) {
      liveLogs.shift();
    }

    if (mode === 'live') {
      renderLiveLogs();
    }
  });

  function renderLiveLogs() {
    if (!terminalEl || mode !== 'live') return;

    const filtered = liveLogs.filter((log) => {
      if (
        filterText &&
        !log.path.toLowerCase().includes(filterText) &&
        !(log.detail || '').toLowerCase().includes(filterText) &&
        !log.ip.includes(filterText) &&
        !(log.source || '').toLowerCase().includes(filterText)
      ) {
        return false;
      }
      const methodUpper = (log.method || '').toUpperCase();
      if (filterStatus === '2xx' && (log.statusCode < 200 || log.statusCode >= 300)) return false;
      if (filterStatus === '4xx' && (log.statusCode < 400 || log.statusCode >= 500)) return false;
      if (filterStatus === '5xx' && log.statusCode < 500) return false;
      if (['ERROR', 'WARN', 'INFO', 'DEBUG'].includes(filterStatus) && methodUpper !== filterStatus) return false;
      return true;
    });

    if (filtered.length === 0) {
      terminalEl.innerHTML = `<div style="color: var(--text-dim); padding: 1rem; text-align: center;">No log records match the current filter.</div>`;
      return;
    }

    terminalEl.innerHTML = renderLogRows(filtered, false);

    if (autoScroll) {
      terminalEl.scrollTop = terminalEl.scrollHeight;
    }
  }

  function renderHistoryLogs() {
    if (!terminalEl || mode !== 'history') return;

    if (historyLogs.length === 0) {
      terminalEl.innerHTML = `<div style="color: var(--text-dim); padding: 1rem; text-align: center;">No historical log records loaded or matched. Adjust filters and click Run Query.</div>`;
      return;
    }

    terminalEl.innerHTML = renderLogRows(historyLogs, true);
  }

  return unsubscribe;
}
