import { SecurityAlert } from '../models/SecurityAlert.js';
import { getDBStatus } from '../config/db.js';

// Cooldown tracker to avoid spamming duplicate alerts (e.g. 5 minutes per alert type)
const alertCooldowns = new Map();
const COOLDOWN_MS = 5 * 60 * 1000;

// High CPU sustained counter
let highCpuCount = 0;
let highRamCount = 0;

export async function checkAnomalies(metrics, io) {
  const alertsToEmit = [];

  const cpuThreshold = parseInt(process.env.ANOMALY_CPU_THRESHOLD || '85', 10);
  const ramThreshold = parseInt(process.env.ANOMALY_RAM_THRESHOLD || '90', 10);
  const diskThreshold = parseInt(process.env.ANOMALY_DISK_THRESHOLD || '90', 10);

  // 1. High CPU Load Detection (sustained >= 3 consecutive checks)
  if (metrics.cpuLoad >= cpuThreshold) {
    highCpuCount++;
    if (highCpuCount >= 3) {
      triggerAlert(
        alertsToEmit,
        'CPU_HIGH_LOAD',
        'high',
        `High CPU Usage Warning (${metrics.cpuLoad}%)`,
        `CPU utilization has exceeded threshold (${cpuThreshold}%) for sustained duration. Top process may be consuming excessive resources.`,
        'System Hardware',
        { cpuLoad: metrics.cpuLoad, topProcesses: metrics.topProcesses }
      );
    }
  } else {
    highCpuCount = 0;
  }

  // 2. High RAM Exhaustion
  if (metrics.memoryPercentage >= ramThreshold) {
    highRamCount++;
    if (highRamCount >= 3) {
      triggerAlert(
        alertsToEmit,
        'MEMORY_EXHAUSTION',
        'critical',
        `Memory Exhaustion Warning (${metrics.memoryPercentage}%)`,
        `RAM usage is dangerously high (${metrics.memoryUsed}MB / ${metrics.memoryTotal}MB). OOM Killer risks terminating server processes.`,
        'System Memory',
        { memoryPercentage: metrics.memoryPercentage, memoryUsed: metrics.memoryUsed }
      );
    }
  } else {
    highRamCount = 0;
  }

  // 3. Disk Space Critical
  if (metrics.diskPercentage >= diskThreshold) {
    triggerAlert(
      alertsToEmit,
      'DISK_SPACE_CRITICAL',
      'high',
      `Disk Storage Almost Full (${metrics.diskPercentage}%)`,
      `Primary partition usage is at ${metrics.diskPercentage}% (${metrics.diskUsed}GB / ${metrics.diskTotal}GB). Consider clearing logs or expanding storage.`,
      'System Storage',
      { diskPercentage: metrics.diskPercentage }
    );
  }

  // 4. Suspicious Process Detection (Cryptomining, unauthorized reverse shells)
  const suspiciousKeywords = ['xmrig', 'minerd', 'cpuminer', 'masscan', 'zmap'];
  if (metrics.topProcesses && metrics.topProcesses.length > 0) {
    for (const proc of metrics.topProcesses) {
      const lowerName = proc.name.toLowerCase();
      if (suspiciousKeywords.some((keyword) => lowerName.includes(keyword))) {
        triggerAlert(
          alertsToEmit,
          'SUSPICIOUS_IP_ACCESS',
          'critical',
          `Suspicious Process Detected: ${proc.name} (PID ${proc.pid})`,
          `Indication of potential unauthorized cryptominer or compromise. Process CPU consumption: ${proc.cpu}%. User: ${proc.user}.`,
          `PID: ${proc.pid}`,
          { pid: proc.pid, name: proc.name, user: proc.user, cpu: proc.cpu }
        );
      }
    }
  }

  // Save alerts to DB and broadcast live over WebSockets
  for (const alertData of alertsToEmit) {
    if (getDBStatus().isConnected) {
      try {
        await SecurityAlert.create(alertData);
      } catch (err) {
        console.warn(`[Security Alert DB Save Warning] ${err.message}`);
      }
    }
    if (io) {
      io.emit('security:alert', alertData);
    }
  }

  return alertsToEmit;
}

// Check for suspicious request rates or brute force traffic (called from log watcher or middleware)
export async function reportTrafficAnomaly(ip, requestCount, path, io) {
  const alertsToEmit = [];
  
  if (requestCount > 60) { // >60 requests per 10 seconds from single IP
    triggerAlert(
      alertsToEmit,
      'TRAFFIC_DDoS_SPIKE',
      'critical',
      `Potential DDoS / Brute Force Attack from ${ip}`,
      `Detected excessive request frequency (${requestCount} req/10s) targeting endpoint '${path}'. Indication of automated scanner or attack.`,
      ip,
      { ip, requestCount, path }
    );
  }

  for (const alertData of alertsToEmit) {
    if (getDBStatus().isConnected) {
      try {
        await SecurityAlert.create(alertData);
      } catch (err) {
        console.warn(`[Security Alert DB Save Warning] ${err.message}`);
      }
    }
    if (io) {
      io.emit('security:alert', alertData);
    }
  }
}

function triggerAlert(list, type, severity, title, description, sourceIp, metadata) {
  const cooldownKey = `${type}_${sourceIp}`;
  const lastAlertTime = alertCooldowns.get(cooldownKey) || 0;
  const now = Date.now();

  if (now - lastAlertTime > COOLDOWN_MS) {
    alertCooldowns.set(cooldownKey, now);
    list.push({
      type,
      severity,
      title,
      description,
      sourceIp,
      metadata,
      status: 'active',
      timestamp: new Date(),
    });
  }
}
