import si from 'systeminformation';
import { MetricHistory } from '../models/MetricHistory.js';
import { getDBStatus } from '../config/db.js';

let latestMetrics = {
  cpuLoad: 0,
  cpuCores: 1,
  memoryUsed: 0,
  memoryTotal: 0,
  memoryPercentage: 0,
  diskUsed: 0,
  diskTotal: 0,
  diskPercentage: 0,
  networkTxSec: 0,
  networkRxSec: 0,
  activeConnections: 0,
  processCount: 0,
  loadAverage: [0, 0, 0],
  osInfo: { platform: 'Linux', distro: 'Ubuntu', hostname: 'ubuntu-server' },
  topProcesses: [],
  timestamp: new Date().toISOString(),
};

// Cache static OS info once to avoid running subprocesses every sampling tick
let cachedOsInfo = null;

async function getCachedOsInfo() {
  if (!cachedOsInfo) {
    try {
      cachedOsInfo = await si.osInfo();
    } catch {
      cachedOsInfo = { platform: 'Linux', distro: 'Ubuntu', hostname: 'ubuntu-server', kernel: '' };
    }
  }
  return cachedOsInfo;
}

// In-memory cache for recent metrics (up to 120 points = 4 mins at 2s interval)
const inMemoryHistory = [];
const MAX_IN_MEMORY_POINTS = 120;

let lastTx = 0;
let lastRx = 0;
let lastNetTime = Date.now();
let lastDbSaveTime = 0;

export async function collectMetrics() {
  try {
    const [currentLoad, mem, fs, processes, osInfo, netStats, netConns] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.processes(),
      getCachedOsInfo(),
      si.networkStats().catch(() => []),
      si.networkConnections().catch(() => []),
    ]);

    // Disk calculations (main mount / or first disk)
    const mainFs = fs.find((f) => f.mount === '/') || fs[0] || { use: 0, size: 100, used: 0 };

    // Net stats (prefer primary external/non-loopback interface)
    let netTxSec = 0;
    let netRxSec = 0;
    const now = Date.now();
    const timeDiffSec = Math.max(1, (now - lastNetTime) / 1000);

    if (netStats && netStats.length > 0) {
      const primaryNet =
        netStats.find(
          (n) =>
            n.iface &&
            n.iface !== 'lo' &&
            !n.iface.startsWith('veth') &&
            !n.iface.startsWith('docker') &&
            !n.iface.startsWith('br-')
        ) || netStats[0];

      if (lastTx > 0 && primaryNet.tx_bytes >= lastTx) {
        netTxSec = Math.round((primaryNet.tx_bytes - lastTx) / timeDiffSec);
      }
      if (lastRx > 0 && primaryNet.rx_bytes >= lastRx) {
        netRxSec = Math.round((primaryNet.rx_bytes - lastRx) / timeDiffSec);
      }
      lastTx = primaryNet.tx_bytes || 0;
      lastRx = primaryNet.rx_bytes || 0;
    }
    lastNetTime = now;

    const establishedConns = Array.isArray(netConns)
      ? netConns.filter((c) => c.state === 'ESTABLISHED').length
      : 0;

    // Top processes
    const topProc = (processes.list || [])
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 10)
      .map((p) => ({
        pid: p.pid,
        name: p.name,
        cpu: Math.round(p.cpu * 10) / 10,
        mem: Math.round(p.mem * 10) / 10,
        user: p.user || 'root',
      }));

    const cpuLoad = Math.round(currentLoad.currentLoad * 10) / 10;
    const memoryUsed = Math.round((mem.active || mem.used) / (1024 * 1024));
    const memoryTotal = Math.round(mem.total / (1024 * 1024));
    const memoryPercentage = Math.round(((mem.active || mem.used) / mem.total) * 100);
    const diskUsed = Math.round(mainFs.used / (1024 * 1024 * 1024));
    const diskTotal = Math.round(mainFs.size / (1024 * 1024 * 1024));
    const diskPercentage = Math.round(mainFs.use || 0);

    latestMetrics = {
      cpuLoad,
      cpuCores: currentLoad.cpus ? currentLoad.cpus.length : 1,
      memoryUsed,
      memoryTotal,
      memoryPercentage,
      diskUsed,
      diskTotal,
      diskPercentage,
      networkTxSec: netTxSec,
      networkRxSec: netRxSec,
      activeConnections: establishedConns,
      processCount: processes.all || 0,
      loadAverage: [
        Math.round((currentLoad.avgLoad || 0) * 100) / 100,
        Math.round((currentLoad.currentLoadUser || 0) * 100) / 100,
        Math.round((currentLoad.currentLoadSystem || 0) * 100) / 100,
      ],
      osInfo: {
        platform: osInfo.platform || 'Linux',
        distro: osInfo.distro || 'Ubuntu',
        hostname: osInfo.hostname || 'ubuntu-server',
        kernel: osInfo.kernel || '',
        uptime: Math.round(si.time().uptime),
      },
      topProcesses: topProc,
      timestamp: new Date(),
    };

    // Store in memory cache
    inMemoryHistory.push(latestMetrics);
    if (inMemoryHistory.length > MAX_IN_MEMORY_POINTS) {
      inMemoryHistory.shift();
    }

    // DB Persistence every DB_PERSIST_INTERVAL_MS (default 15s)
    const dbInterval = parseInt(process.env.DB_PERSIST_INTERVAL_MS || '15000', 10);
    if (now - lastDbSaveTime >= dbInterval) {
      lastDbSaveTime = now;
      if (getDBStatus().isConnected) {
        MetricHistory.create({
          cpuLoad,
          cpuCores: latestMetrics.cpuCores,
          memoryUsed,
          memoryTotal,
          memoryPercentage,
          diskUsed,
          diskTotal,
          diskPercentage,
          networkTxSec: netTxSec,
          networkRxSec: netRxSec,
          activeConnections: latestMetrics.activeConnections,
          processCount: latestMetrics.processCount,
          loadAverage: latestMetrics.loadAverage,
          timestamp: new Date(),
        }).catch((err) => console.warn(`[DB Metric Save Warning] ${err.message}`));
      }
    }
  } catch (err) {
    console.error(`[Metrics Collection Error] ${err.message}`);
  }

  return latestMetrics;
}

export function getLatestMetrics() {
  return latestMetrics;
}

export function getInMemoryHistory() {
  return inMemoryHistory;
}
