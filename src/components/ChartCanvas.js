import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  Title,
  CategoryScale,
  Tooltip,
  Legend,
} from 'chart.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, Title, CategoryScale, Tooltip, Legend);

export function renderChart(canvasId, { labels, datasets }) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;

  // Destroy existing chart instance if any
  const existingChart = Chart.getChart(canvasId);
  if (existingChart) {
    existingChart.destroy();
  }

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map((ds) => ({
        label: ds.label,
        data: ds.data,
        borderColor: ds.borderColor || '#38bdf8',
        backgroundColor: 'transparent', // Strict requirement: NO gradients or fill transparent
        borderWidth: 2,
        pointRadius: labels.length > 50 ? 0 : 2,
        tension: 0.2,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          labels: {
            color: '#94a3b8',
            font: { family: 'Inter', size: 12 },
          },
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          borderColor: '#334155',
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          grid: { color: '#1e293b' },
          ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 } },
        },
        y: {
          grid: { color: '#1e293b' },
          ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 } },
          min: 0,
        },
      },
    },
  });
}
