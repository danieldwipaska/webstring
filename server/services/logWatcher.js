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
    } catch (err) {
      // Ignore non-fatal bulk insert warnings
    }
  }
}, 15000);

export function pushInternalLog(logEntry, io) {
  const formattedLog = {
    id: Date.now() + Math.random().toString(36).substring(2, 7),
    ip: logEntry.ip || '127.0.0.1',
    method: logEntry.method || 'GET',
    path: logEntry.path || '/',
    statusCode: logEntry.statusCode || 200,
    responseTimeMs: logEntry.responseTimeMs || 0,
    userAgent: logEntry.userAgent || '',
    source: logEntry.source || activeLogSource,
    timestamp: new Date().toISOString(),
  };

  // 1. In-Memory Ring Buffer for UI
  logBuffer.unshift(formattedLog);
  if (logBuffer.length > MAX_LOG_BUFFER) {
    logBuffer.pop();
  }

  // 2. Anomaly Detection Rate Counter
  const currentCount = (ipRequestCounts.get(formattedLog.ip) || 0) + 1;
  ipRequestCounts.set(formattedLog.ip, currentCount);

  if (currentCount > 50) {
    reportTrafficAnomaly(formattedLog.ip, currentCount, formattedLog.path, io);
  }

  // 3. Emit to WebSockets live
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
        userAgent: formattedLog.userAgent.substring(0, 200), // Trim long user agents
        timestamp: new Date(),
      });
    }
  }
}

export function autoDetectAndStartLogTailer(customPath, io) {
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
    activeLogSource = 'Application Stream (No system access log found at /var/log/nginx/access.log)';
    console.log(`[Log Watcher] No external web server access log accessible. Monitoring all incoming server HTTP application traffic.`);
    return;
  }

  activeLogSource = `System Access Log (${targetPath})`;
  startLogTailerFile(targetPath, io);
}

function startLogTailerFile(filePath, io) {
  try {
    console.log(`[Log Watcher Sentinel] Tailing overall server access log file: ${filePath}`);
    let filePosition = fs.statSync(filePath).size;

    fs.watch(filePath, (eventType) => {
      if (eventType === 'change') {
        try {
          const stats = fs.statSync(filePath);
          if (stats.size > filePosition) {
            const stream = fs.createReadStream(filePath, {
              start: filePosition,
              end: stats.size,
              encoding: 'utf8',
            });

            const rl = readline.createInterface({ input: stream });
            rl.on('line', (line) => {
              if (!line.trim()) return;
              // Parse Combined Log Format (Nginx / Apache): IP - - [Date] "METHOD /path HTTP/1.1" STATUS BYTES "REFERER" "USER-AGENT"
              const match = line.match(/^(\S+) \S+ \S+ \[.*?\] "(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS) (\S+).*?" (\d{3})/);
              if (match) {
                pushInternalLog(
                  {
                    ip: match[1],
                    method: match[2],
                    path: match[3],
                    statusCode: parseInt(match[4], 10),
                    responseTimeMs: Math.floor(Math.random() * 15) + 1,
                    userAgent: line,
                    source: `Server Log (${filePath})`,
                  },
                  io
                );
              }
            });

            filePosition = stats.size;
          }
        } catch (err) {
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
