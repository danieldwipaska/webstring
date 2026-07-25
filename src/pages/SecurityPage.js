import { fetchApi } from '../utils/api.js';
import { subscribeSocketEvent } from '../utils/socket.js';

export function renderSecurityPage() {
  return `
    <div class="container">
      <div class="page-header" style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h1 class="page-title">Security & Anomaly Detection</h1>
          <p class="page-subtitle">Automated threat detection, suspicious traffic spikes, and resource degradation telemetry</p>
        </div>

        <div style="display: flex; gap: 0.75rem;">
          <button class="btn btn-secondary btn-sm" id="btn-refresh-alerts">Refresh Alerts</button>
          <button class="btn btn-danger btn-sm" id="btn-clear-alerts">Clear Alert Logs</button>
        </div>
      </div>

      <!-- Live Security Threat Level Overview Card -->
      <div class="card" style="margin-bottom: 1.5rem;" id="security-threat-banner">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
          <div>
            <div style="font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; font-family: var(--font-mono);">Server Security Status</div>
            <div style="font-size: 1.5rem; font-weight: 700; color: var(--color-success); margin-top: 0.2rem;" id="threat-level-status">
              NORMAL - No Threats Detected
            </div>
          </div>
          <div class="mono" style="font-size: 0.85rem; color: var(--text-muted);" id="active-alert-count">
            0 Active Alerts
          </div>
        </div>
      </div>

      <!-- Security Anomaly List Table -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Security Event & Anomaly Log Stream</span>
          <span class="mono" style="font-size: 0.8rem; color: var(--text-muted);" id="alerts-table-count">Total: 0</span>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Severity</th>
                <th>Anomaly Type</th>
                <th>Alert Title</th>
                <th>Description & Source</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="security-alerts-tbody">
              <tr><td colspan="7" style="text-align: center; color: var(--text-dim);">Fetching alert records...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export function initSecurityPage(navigate) {
  loadSecurityAlerts();

  const refreshBtn = document.getElementById('btn-refresh-alerts');
  if (refreshBtn) refreshBtn.onclick = () => loadSecurityAlerts();

  const clearBtn = document.getElementById('btn-clear-alerts');
  if (clearBtn) {
    clearBtn.onclick = async () => {
      if (confirm('Are you sure you want to clear all security alert logs?')) {
        try {
          await fetchApi('/security/alerts/clear', { method: 'DELETE' });
          loadSecurityAlerts();
        } catch (err) {
          alert('Failed to clear alerts: ' + err.message);
        }
      }
    };
  }

  // Subscribe to live incoming security alert events
  const unsubscribe = subscribeSocketEvent('security:alert', (newAlert) => {
    console.log('[Security Alert Live Received]', newAlert);
    loadSecurityAlerts();
  });

  return unsubscribe;
}

async function loadSecurityAlerts() {
  const tbody = document.getElementById('security-alerts-tbody');
  const countEl = document.getElementById('alerts-table-count');
  const statusEl = document.getElementById('threat-level-status');
  const activeCountEl = document.getElementById('active-alert-count');

  try {
    const res = await fetchApi('/security/alerts');
    if (res.success && res.data) {
      const alerts = res.data;

      if (countEl) countEl.textContent = `Total: ${alerts.length}`;

      const activeAlerts = alerts.filter((a) => a.status === 'active');
      if (activeCountEl) activeCountEl.textContent = `${activeAlerts.length} Active Alerts`;

      if (statusEl) {
        if (activeAlerts.some((a) => a.severity === 'critical')) {
          statusEl.textContent = 'CRITICAL - Severe Threats / Resource Exhaustion Detected';
          statusEl.style.color = 'var(--color-danger)';
        } else if (activeAlerts.some((a) => a.severity === 'high')) {
          statusEl.textContent = 'WARNING - Anomaly Detected / High Server Load';
          statusEl.style.color = 'var(--color-warning)';
        } else {
          statusEl.textContent = 'NORMAL - System Operating Stably';
          statusEl.style.color = 'var(--color-success)';
        }
      }

      if (!tbody) return;

      if (alerts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim);">No security alerts detected. Server operating securely.</td></tr>`;
        return;
      }

      tbody.innerHTML = alerts
        .map(
          (a) => `
        <tr>
          <td class="mono" style="font-size: 0.8rem;">${new Date(a.timestamp).toLocaleString()}</td>
          <td><span class="severity-badge severity-${a.severity}">${a.severity}</span></td>
          <td class="mono" style="font-size: 0.8rem; font-weight: 600;">${a.type}</td>
          <td style="font-weight: 600;">${a.title}</td>
          <td style="font-size: 0.85rem; max-width: 320px;">
            ${a.description}
            <div class="mono" style="font-size: 0.75rem; color: var(--text-dim); margin-top: 0.2rem;">Source: ${a.sourceIp}</div>
          </td>
          <td>
            <span class="mono" style="font-size: 0.8rem; color: ${a.status === 'active' ? 'var(--color-danger)' : 'var(--text-muted)'};">
              ${a.status.toUpperCase()}
            </span>
          </td>
          <td>
            ${
              a.status === 'active'
                ? `<button class="btn btn-secondary btn-sm" onclick="window.resolveAlert('${a._id || a.title}')">Resolve</button>`
                : `<span style="color: var(--text-dim); font-size: 0.8rem;">-</span>`
            }
          </td>
        </tr>
      `
        )
        .join('');

      window.resolveAlert = async (id) => {
        try {
          await fetchApi(`/security/alerts/${id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'resolved' }),
          });
          loadSecurityAlerts();
        } catch (err) {
          loadSecurityAlerts();
        }
      };
    }
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--color-danger);">Failed to load security alert logs.</td></tr>`;
    }
  }
}
