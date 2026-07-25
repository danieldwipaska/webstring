import { renderLogViewerControls, initLogViewer } from '../components/LogViewer.js';

export function renderRealtimeLogsPage() {
  return `
    <div class="container">
      <div class="page-header" style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h1 class="page-title">Realtime Request Log Viewer</h1>
          <p class="page-subtitle">Streaming all overall requests entering this Ubuntu server live (Nginx, Apache & Global Traffic)</p>
        </div>
        <div class="mono" style="font-size: 0.8rem; color: var(--color-accent);" id="active-log-source-badge">
          Source: Auto-Detecting System Access Logs...
        </div>
      </div>

      <div class="card">
        ${renderLogViewerControls()}
        <div class="terminal-window" id="terminal-log-window">
          <div style="color: var(--text-dim); padding: 1rem; text-align: center;">Connecting to overall server live request log stream...</div>
        </div>
      </div>
    </div>
  `;
}

export function initRealtimeLogsPage() {
  return initLogViewer();
}
