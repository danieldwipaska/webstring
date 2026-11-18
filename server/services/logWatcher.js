import fs from 'fs';
import path from 'path';
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
    source: logEntry.source || 'sentinel',
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

/**
 * Parses a configured log path entry. Supports "label:/path/to/file.log" or "/path/to/file.log".
 */
function parseLogTargetEntry(rawEntry) {
  const trimmed = rawEntry.trim();
  if (!trimmed) return null;

  const colonIdx = trimmed.indexOf(':');
  if (colonIdx > 0 && !trimmed.slice(0, colonIdx).includes('/')) {
    const label = trimmed.slice(0, colonIdx).trim();
    const filePath = trimmed.slice(colonIdx + 1).trim();
    if (filePath) return { label, filePath };
  }

  return {
    label: path.basename(trimmed) || 'system-log',
    filePath: trimmed,
  };
}

/**
 * Parses a single log line from either JSON-line HTTP logs (e.g. NestJS CustomLoggerService)
 * or Nginx/Apache Combined Log Format.
 */
export function parseLogLine(line, sourceLabel) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // 1. JSON-line HTTP log format (e.g. bahari-app logs/http.log)
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj.method === 'string' && (obj.url || obj.path) && obj.statusCode !== undefined) {
        return {
          ip: typeof obj.ipAddress === 'string' ? obj.ipAddress : typeof obj.ip === 'string' ? obj.ip : '127.0.0.1',
          method: obj.method.toUpperCase(),
          path: obj.url || obj.path,
          statusCode: parseInt(obj.statusCode, 10) || 200,
          responseTimeMs: Math.round(Number(obj.responseTime ?? obj.responseTimeMs ?? 0) || 0),
          userAgent: typeof obj.userAgent === 'string' ? obj.userAgent : '',
          source: sourceLabel,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  // 2. Nginx / Apache Combined Log Format
  const match = trimmed.match(
    /^(\S+) \S+ \S+ \[.*?\] "(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS) (\S+).*?" (\d{3}) \S+(?: "[^"]*" "([^"]*)")?/
  );
  if (match) {
    return {
      ip: match[1],
      method: match[2],
      path: match[3],
      statusCode: parseInt(match[4], 10),
      responseTimeMs: 0,
      userAgent: match[5] || '',
      source: sourceLabel,
    };
  }

  return null;
}

export function autoDetectAndStartLogTailer(customPath, io) {
  const isEnabled = (process.env.ENABLE_SYSTEM_LOG_TAILER || 'false').toLowerCase() === 'true';
  if (!isEnabled) {
    activeLogSource = 'Application Stream (System access log tailing disabled for multi-app isolation)';
    console.log(
      '[Log Watcher] System access log tailing disabled (ENABLE_SYSTEM_LOG_TAILER != true). Monitoring application traffic only.'
    );
    return;
  }

  const configuredMulti = (process.env.LOG_FILE_PATHS || '')
    .split(',')
    .map(parseLogTargetEntry)
    .filter(Boolean);

  let targets = configuredMulti;

  if (targets.length === 0) {
    const singleRaw = customPath || process.env.LOG_FILE_PATH;
    if (singleRaw) {
      const parsed = parseLogTargetEntry(singleRaw);
      if (parsed) targets = [parsed];
    }
  }

  if (targets.length === 0) {
    const fallbackPaths = [
      '/var/log/nginx/access.log',
      '/var/log/nginx/other_vhosts_access.log',
      '/var/log/apache2/access.log',
      '/var/log/httpd/access_log',
    ];
    for (const p of fallbackPaths) {
      if (fs.existsSync(p)) {
        targets = [{ label: 'nginx', filePath: p }];
        break;
      }
    }
  }

  const activeTargets = [];
  for (const target of targets) {
    if (!fs.existsSync(target.filePath)) {
      console.warn(`[Log Watcher Warning] Log file not found (${target.label}): ${target.filePath}`);
      continue;
    }
    if (startLogTailerFile(target.filePath, target.label, io)) {
      activeTargets.push(`${target.label} (${target.filePath})`);
    }
  }

  if (activeTargets.length === 0) {
    activeLogSource = 'Application Stream (No accessible configured log files found)';
    console.log('[Log Watcher] No external access log accessible. Monitoring application HTTP traffic only.');
    return;
  }

  activeLogSource = activeTargets.join(' | ');
}

function startLogTailerFile(filePath, sourceLabel, io) {
  try {
    console.log(`[Log Watcher Sentinel] Tailing [${sourceLabel}]: ${filePath}`);
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
              const parsed = parseLogLine(line, sourceLabel);
              if (parsed) {
                pushInternalLog(parsed, io);
              }
            });

            filePosition = stats.size;
          }
        } catch {
          // Ignore transient read errors during log rotation
        }
      }
    });
    return true;
  } catch (err) {
    console.warn(`[Log Watcher Warning] Could not tail [${sourceLabel}] ${filePath}: ${err.message}`);
    return false;
  }
}

export function getRecentLogs() {
  return logBuffer;
}

export function getActiveLogSource() {
  return activeLogSource;
}
