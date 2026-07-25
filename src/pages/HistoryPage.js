import { fetchApi } from '../utils/api.js';
import { renderChart } from '../components/ChartCanvas.js';
import { createModal } from '../components/Modal.js';

let currentChart1 = null;
let currentChart2 = null;

export function renderHistoryPage() {
  return `
    <div class="container">
      <div class="page-header" style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h1 class="page-title">Performance Analytics History</h1>
          <p class="page-subtitle">Historical trends for CPU, RAM, Network I/O, and process load (Max 30-day retention)</p>
        </div>

        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">
          <span style="font-size: 0.85rem; color: var(--text-muted); margin-right: 0.5rem;">Time Range:</span>
          <button class="btn btn-secondary btn-sm active-tf" data-tf="1h">1 Hour</button>
          <button class="btn btn-secondary btn-sm" data-tf="24h">24 Hours</button>
          <button class="btn btn-secondary btn-sm" data-tf="7d">7 Days</button>
          <button class="btn btn-secondary btn-sm" data-tf="30d">30 Days (Max)</button>

          <button class="btn btn-danger btn-sm" id="btn-purge-manual" style="margin-left: 1rem;">
            Purge Data Manually
          </button>
        </div>
      </div>

      <!-- Chart 1: CPU & RAM Trend -->
      <div class="card" style="margin-bottom: 1.5rem;">
        <div class="card-header">
          <span class="card-title">CPU Utilization (%) & Memory RAM (%) Trends</span>
          <span class="mono" style="font-size: 0.8rem; color: var(--text-muted);" id="chart1-info">Loading...</span>
        </div>
        <div style="height: 320px; position: relative;">
          <canvas id="chart-cpu-ram"></canvas>
        </div>
      </div>

      <!-- Chart 2: Network Throughput & Connections -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Network Throughput Rate (KB/s)</span>
          <span class="mono" style="font-size: 0.8rem; color: var(--text-muted);" id="chart2-info">Loading...</span>
        </div>
        <div style="height: 320px; position: relative;">
          <canvas id="chart-net-proc"></canvas>
        </div>
      </div>
    </div>
  `;
}

export function initHistoryPage(navigate) {
  let selectedTf = '1h';

  // Bind timeframe selector buttons
  const tfButtons = document.querySelectorAll('[data-tf]');
  tfButtons.forEach((btn) => {
    btn.onclick = () => {
      tfButtons.forEach((b) => b.classList.remove('btn-primary'));
      tfButtons.forEach((b) => b.classList.add('btn-secondary'));
      btn.classList.remove('btn-secondary');
      btn.classList.add('btn-primary');

      selectedTf = btn.getAttribute('data-tf');
      loadHistoryData(selectedTf);
    };
  });

  // Highlight initial 1h button
  const initialBtn = document.querySelector('[data-tf="1h"]');
  if (initialBtn) {
    initialBtn.classList.remove('btn-secondary');
    initialBtn.classList.add('btn-primary');
  }

  // Setup Manual Purge Modal
  const purgeBtn = document.getElementById('btn-purge-manual');
  if (purgeBtn) {
    const purgeModal = createModal({
      id: 'purge-modal-dialog',
      title: 'Manual Data Purge Confirmation',
      confirmText: 'Yes, Purge Data Now',
      confirmClass: 'btn-danger',
      bodyHTML: `
        <p style="margin-bottom: 1rem; color: var(--text-main);">
          Are you sure you want to manually purge historical performance telemetry records from MongoDB Atlas?
        </p>
        <p style="font-size: 0.85rem; color: var(--color-warning); margin-bottom: 1rem;">
          Note: MongoDB Atlas automatically purges documents older than 30 days via background TTL Indexes. Use this option to instantly free up database space on demand.
        </p>
        <div class="form-group">
          <label class="form-label">Select Target Range to Purge:</label>
          <select id="purge-range-select" class="form-input">
            <option value="all">All Historical Telemetry Records</option>
            <option value="older_than_7d">Records Older Than 7 Days</option>
            <option value="older_than_24h">Records Older Than 24 Hours</option>
          </select>
        </div>
      `,
      onConfirm: async () => {
        const rangeSelect = document.getElementById('purge-range-select');
        const rangeVal = rangeSelect ? rangeSelect.value : 'all';

        try {
          const res = await fetchApi('/metrics/purge', {
            method: 'POST',
            body: JSON.stringify({
              confirmationToken: 'PURGE_CONFIRMED',
              purgeRange: rangeVal,
            }),
          });

          if (res.success) {
            alert(res.message || 'Telemetry history purged successfully.');
            loadHistoryData(selectedTf);
          } else {
            alert('Failed to purge data: ' + res.message);
          }
        } catch (err) {
          alert('Error purging data: ' + err.message);
        }
      },
    });

    purgeBtn.onclick = () => purgeModal.open();
  }

  // Initial data load
  loadHistoryData(selectedTf);
}

async function loadHistoryData(timeframe) {
  const info1 = document.getElementById('chart1-info');
  const info2 = document.getElementById('chart2-info');

  if (info1) info1.textContent = 'Fetching telemetry samples...';
  if (info2) info2.textContent = 'Fetching telemetry samples...';

  try {
    const res = await fetchApi(`/metrics/history?timeframe=${timeframe}`);
    if (res.success && res.data) {
      const records = res.data;

      if (records.length === 0) {
        if (info1) info1.textContent = 'No telemetry records collected yet for this timeframe.';
        if (info2) info2.textContent = 'No telemetry records collected yet.';
        return;
      }

      if (info1) info1.textContent = `Points: ${records.length} records`;
      if (info2) info2.textContent = `Points: ${records.length} records`;

      const labels = records.map((r) => {
        const d = new Date(r.timestamp);
        return timeframe === '1h' || timeframe === '24h'
          ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:00`;
      });

      const cpuData = records.map((r) => r.cpuLoad || 0);
      const ramData = records.map((r) => r.memoryPercentage || 0);
      const rxData = records.map((r) => Math.round((r.networkRxSec || 0) / 1024));
      const txData = records.map((r) => Math.round((r.networkTxSec || 0) / 1024));

      // Render CPU & RAM Chart
      currentChart1 = renderChart('chart-cpu-ram', {
        labels,
        datasets: [
          { label: 'CPU Load (%)', data: cpuData, borderColor: '#38bdf8' },
          { label: 'Memory RAM (%)', data: ramData, borderColor: '#f59e0b' },
        ],
      });

      // Render Network Chart
      currentChart2 = renderChart('chart-net-proc', {
        labels,
        datasets: [
          { label: 'Network RX (KB/s)', data: rxData, borderColor: '#10b981' },
          { label: 'Network TX (KB/s)', data: txData, borderColor: '#06b6d4' },
        ],
      });
    }
  } catch (err) {
    if (info1) info1.textContent = 'Failed to load telemetry history.';
    if (info2) info2.textContent = 'Failed to load telemetry history.';
  }
}
