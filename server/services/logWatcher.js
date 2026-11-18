import fs from 'fs';
import readline from 'readline';
import { RequestLog } from '../models/RequestLog.js';
import { getDBStatus } from '../config/db.js';
import { reportTrafficAnomaly } from './anomalyDetector.js';

// In-memory buffer of recent logs for live WebSockets (max 200)
const logBuffer = [];
const MAX_LOG_BUFFER = 200;

// Queue for bulk database writes (max 50 items per 15-second batch to protect Mongo Atlas IOPS)
const pendingDbLogs = [];
const MAX_PENDING_DB_BATCH = 50;

// IP request rate counter for anomaly detection (resets every 10 seconds)
const ipRequestCounts = new Map();
const MAX_TRACKED_IPS = 5000;
let activeLogSource = 'Application Stream';

setInterval(() => {
  ipRequestCounts.clear();
}, 10000);

// Bulk insert pending request logs to MongoDB Atlas every 15 seconds
setInterval(async () => {
  if (pendingDbLogs.length > 0 && getDBStatus().isConnected) {
    const batchToInsert = pendingDbLogs.splice(0, MAX_PENDING_DB_BATCH);
    try {
      await RequestLog.insertMany(batchToInsert, { ordered: false });
    } catch {
      // Ignore non-fatal bulk insert warnings
    }
  }
}, 15000);

export function pushInternalLog(logEntry, io) {
  const rawPath = typeof logEntry.path === 'string' ? logEntry.path : '/';
  const sanitizedPath = rawPath.split('?')[0].substring(0, 300);

  const formattedLog = {
    id: Date.now() + Math.random().toString(36).substring(2, 7),
    ip: logEntry.ip || '127.0.0.1',
    method: logEntry.method || 'GET',
    path: sanitizedPath,
    statusCode: logEntry.statusCode || 200,
    responseTimeMs: logEntry.responseTimeMs || 0,
    userAgent: typeof logEntry.userAgent === 'string' ? logEntry.userAgent.substring(0, 200) : '',
    source: logEntry.source || activeLogSource,
    timestamp: new Date().toISOString(),
  };

  // 1. In-Memory Ring Buffer for UI
  logBuffer.unshift(formattedLog);
  if (logBuffer.length > MAX_LOG_BUFFER) {
    logBuffer.pop();
  }

  // 2. Anomaly Detection Rate Counter (bounded Map)
  if (!ipRequestCounts.has(formattedLog.ip) && ipRequestCounts.size >= MAX_TRACKED_IPS) {
    const oldestKey = ipRequestCounts.keys().next().value;
    if (oldestKey !== undefined) ipRequestCounts.delete(oldestKey);
  }
  const currentCount = (ipRequestCounts.get(formattedLog.ip) || 0) + 1;
  ipRequestCounts.set(formattedLog.ip, currentCount);

  const threshold = parseInt(process.env.TRAFFIC_ANOMALY_THRESHOLD || '120', 10);
  if (currentCount > threshold) {
    reportTrafficAnomaly(formattedLog.ip, currentCount, formattedLog.path, io);
  }

  // 3. Emit to authenticated WebSocket clients only (protected by io.use auth middleware)
  if (io) {
    io.emit('logs:stream', formattedLog);
  }

  // 4. Queue for Bulk MongoDB Persistence (Errors 4xx/5xx or 5% sample rate)
  if (formattedLog.statusCode >= 400 || Math.random() < 0.05) {
    if (pendingDbLogs.length < MAX_PENDING_DB_BATCH * 2) {
      pendingDbLogs.push({
        ip: formattedLog.ip,
        method: formattedLog.method,
        path: formattedLog.path,
        statusCode: formattedLog.statusCode,
        responseTimeMs: formattedLog.responseTimeMs,
        userAgent: formattedLog.userAgent,
        timestamp: new Date(),
      });
    }
  }
}

export function autoDetectAndStartLogTailer(customPath, io) {
  const isEnabled = (process.env.ENABLE_SYSTEM_LOG_TAILER || 'false').toLowerCase() === 'true';
  if (!isEnabled) {
    activeLogSource = 'Application Stream (System access log tailing disabled for multi-app isolation)';
    console.log('[Log Watcher] System access log tailing disabled (ENABLE_SYSTEM_LOG_TAILER != true). Monitoring application traffic only.');
    return;
  }

  const candidatePaths = [
    customPath,
    process.env.LOG_FILE_PATH,
    '/var/log/nginx/access.log',
    '/var/log/nginx/other_vhosts_access.log',
    '/var/log/apache2/access.log',
    '/var/log/httpd/access_log',
  ].filter(Boolean);

  let targetPath = null;
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      targetPath = p;
      break;
    }
  }

  if (!targetPath) {
    activeLogSource = 'Application Stream (No configured system access log found)';
    console.log('[Log Watcher] No external web server access log accessible. Monitoring application HTTP traffic.');
    return;
  }

  activeLogSource = `System Access Log (${targetPath})`;
  startLogTailerFile(targetPath, io);
}

function startLogTailerFile(filePath, io) {
  try {
    console.log(`[Log Watcher Sentinel] Tailing server access log file: ${filePath}`);
    let filePosition = fs.statSync(filePath).size;

    fs.watch(filePath, (eventType) => {
      if (eventType === 'change' || eventType === 'rename') {
        try {
          if (!fs.existsSync(filePath)) return;
          const stats = fs.statSync(filePath);

          // Handle logrotate truncation
          if (stats.size < filePosition) {
            filePosition = 0;
          }

          if (stats.size > filePosition) {
            const stream = fs.createReadStream(filePath, {
              start: filePosition,
              end: stats.size - 1,
              encoding: 'utf8',
            });

            const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
            rl.on('line', (line) => {
              if (!line.trim()) return;
              // Parse Combined Log Format (Nginx / Apache)
              const match = line.match(
                /^(\S+) \S+ \S+ \[.*?\] "(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS) (\S+).*?" (\d{3}) \S+(?: "[^"]*" "([^"]*)")?/
              );
              if (match) {
                pushInternalLog(
                  {
                    ip: match[1],
                    method: match[2],
                    path: match[3],
                    statusCode: parseInt(match[4], 10),
                    responseTimeMs: 0,
                    userAgent: match[5] || '',
                    source: `Server Log (${filePath})`,
                  },
                  io
                );
              }
            });

            filePosition = stats.size;
          }
        } catch {
          // Ignore transient read errors during log rotation
        }
      }
    });
  } catch (err) {
    console.warn(`[Log Watcher Warning] Could not tail ${filePath}: ${err.message}`);
  }
}

export function getRecentLogs() {
  return logBuffer;
}

export function getActiveLogSource() {
  return activeLogSource;
}
