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
  const isHttp = logEntry.isHttp !== false;
  const rawText = typeof logEntry.path === 'string' ? logEntry.path : '/';
  const sanitizedPath = isHttp ? rawText.split('?')[0].substring(0, 300) : rawText.substring(0, 400);

  const formattedLog = {
    id: Date.now() + Math.random().toString(36).substring(2, 7),
    ip: logEntry.ip || (isHttp ? '127.0.0.1' : 'app'),
    method: logEntry.method || 'GET',
    path: sanitizedPath,
    statusCode: logEntry.statusCode || 200,
    responseTimeMs: logEntry.responseTimeMs || 0,
    userAgent: typeof logEntry.userAgent === 'string' ? logEntry.userAgent.substring(0, 200) : '',
    source: logEntry.source || 'sentinel',
    isHttp,
    timestamp: new Date().toISOString(),
  };

  // 1. In-Memory Ring Buffer for UI
  logBuffer.unshift(formattedLog);
  if (logBuffer.length > MAX_LOG_BUFFER) {
    logBuffer.pop();
  }

  // 2. Anomaly Detection Rate Counter & DB RequestLog persistence (HTTP traffic only)
  if (isHttp) {
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

  // 3. Emit to authenticated WebSocket clients only (protected by io.use auth middleware)
  if (io) {
    io.emit('logs:stream', formattedLog);
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

function mapLogLevelToStatusAndMethod(levelRaw) {
  const level = (levelRaw || 'info').toString().toUpperCase();
  if (level === 'ERROR' || level === 'FATAL' || level === 'CRIT') {
    return { method: 'ERROR', statusCode: 500 };
  }
  if (level === 'WARN' || level === 'WARNING') {
    return { method: 'WARN', statusCode: 400 };
  }
  if (level === 'DEBUG' || level === 'VERBOSE' || level === 'SILLY') {
    return { method: 'DEBUG', statusCode: 200 };
  }
  return { method: 'INFO', statusCode: 200 };
}

/**
 * Parses a single log line from:
 * 1) JSON-line HTTP logs (e.g. NestJS CustomLoggerService)
 * 2) Nginx/Apache Combined Log Format
 * 3) General / Winston JSON or plain-text application logs (e.g. combined-*.log / error-*.log)
 */
export function parseLogLine(line, sourceLabel, options = {}) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // 1. JSON-line logs (HTTP or Winston application logs)
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
          isHttp: true,
        };
      }

      if (obj && (typeof obj.message === 'string' || typeof obj.level === 'string')) {
        const { method, statusCode } = mapLogLevelToStatusAndMethod(obj.level);
        const contextPrefix = typeof obj.context === 'string' && obj.context ? `[${obj.context}] ` : '';
        const msg = typeof obj.message === 'string' ? obj.message : JSON.stringify(obj);
        return {
          ip: typeof obj.ipAddress === 'string' ? obj.ipAddress : typeof obj.ip === 'string' ? obj.ip : 'app',
          method,
          path: `${contextPrefix}${msg}`,
          statusCode,
          responseTimeMs: 0,
          userAgent: '',
          source: sourceLabel,
          isHttp: false,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  // 2. Nginx / Apache Combined Log Format
  const nginxMatch = trimmed.match(
    /^(\S+) \S+ \S+ \[.*?\] "(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS) (\S+).*?" (\d{3}) \S+(?: "[^"]*" "([^"]*)")?/
  );
  if (nginxMatch) {
    return {
      ip: nginxMatch[1],
      method: nginxMatch[2],
      path: nginxMatch[3],
      statusCode: parseInt(nginxMatch[4], 10),
      responseTimeMs: 0,
      userAgent: nginxMatch[5] || '',
      source: sourceLabel,
      isHttp: true,
    };
  }

  // 3. Plain-text application logs (only for non-Nginx/Apache files)
  if (options.isWebServerAccessLog) {
    return null;
  }

  const tsLevelMatch = trimmed.match(
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?(?:\s+\[?([a-zA-Z]+)\]?:?)?\s+(.*)$/
  );
  if (tsLevelMatch) {
    const levelGuess = tsLevelMatch[1] || (sourceLabel.toLowerCase().includes('error') ? 'error' : 'info');
    const { method, statusCode } = mapLogLevelToStatusAndMethod(levelGuess);
    return {
      ip: 'app',
      method,
      path: tsLevelMatch[2] || trimmed,
      statusCode,
      responseTimeMs: 0,
      userAgent: '',
      source: sourceLabel,
      isHttp: false,
    };
  }

  const prefixLevelMatch = trimmed.match(/^\[?(error|warn|warning|info|debug)\]?:?\s+(.*)$/i);
  if (prefixLevelMatch) {
    const { method, statusCode } = mapLogLevelToStatusAndMethod(prefixLevelMatch[1]);
    return {
      ip: 'app',
      method,
      path: prefixLevelMatch[2] || trimmed,
      statusCode,
      responseTimeMs: 0,
      userAgent: '',
      source: sourceLabel,
      isHttp: false,
    };
  }

  const fallbackLevel = sourceLabel.toLowerCase().includes('error') ? 'error' : 'info';
  const { method, statusCode } = mapLogLevelToStatusAndMethod(fallbackLevel);
  return {
    ip: 'app',
    method,
    path: trimmed,
    statusCode,
    responseTimeMs: 0,
    userAgent: '',
    source: sourceLabel,
    isHttp: false,
  };
}

function globBaseNameToRegex(basePattern) {
  const escaped = basePattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function findLatestMatchingFile(dirPath, nameRegex) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    let bestFile = null;
    let bestMtime = -1;

    for (const entry of entries) {
      if (!entry.isFile() || !nameRegex.test(entry.name)) continue;
      const fullPath = path.join(dirPath, entry.name);
      try {
        const stats = fs.statSync(fullPath);
        if (
          stats.mtimeMs > bestMtime ||
          (stats.mtimeMs === bestMtime && (!bestFile || fullPath > bestFile))
        ) {
          bestMtime = stats.mtimeMs;
          bestFile = fullPath;
        }
      } catch {
        // Ignore transient stat error during rotation
      }
    }
    return bestFile;
  } catch {
    return null;
  }
}

function isWebServerLogPath(filePath) {
  const lower = filePath.toLowerCase();
  return lower.includes('/nginx/') || lower.includes('/apache2/') || lower.includes('/httpd/');
}

function createSingleFileTailer(filePath, sourceLabel, io, startFromBeginning = false) {
  let filePosition = startFromBeginning ? 0 : fs.statSync(filePath).size;
  const isWebServerAccessLog = isWebServerLogPath(filePath);

  if (startFromBeginning && fs.statSync(filePath).size > 0) {
    readDelta(filePath);
  }

  function readDelta(targetPath) {
    try {
      if (!fs.existsSync(targetPath)) return;
      const stats = fs.statSync(targetPath);

      if (stats.size < filePosition) {
        filePosition = 0;
      }

      if (stats.size > filePosition) {
        const stream = fs.createReadStream(targetPath, {
          start: filePosition,
          end: stats.size - 1,
          encoding: 'utf8',
        });

        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
        rl.on('line', (line) => {
          const parsed = parseLogLine(line, sourceLabel, { isWebServerAccessLog });
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

  const watcher = fs.watch(filePath, (eventType) => {
    if (eventType === 'change' || eventType === 'rename') {
      readDelta(filePath);
    }
  });

  return () => {
    try {
      watcher.close();
    } catch {
      // Ignore close error
    }
  };
}

function startRotatingLogTailer(globPath, sourceLabel, io) {
  const dirPath = path.dirname(globPath);
  const basePattern = path.basename(globPath);

  if (!fs.existsSync(dirPath)) {
    console.warn(`[Log Watcher Warning] Log directory not found (${sourceLabel}): ${dirPath}`);
    return false;
  }

  const nameRegex = globBaseNameToRegex(basePattern);
  let activeFilePath = findLatestMatchingFile(dirPath, nameRegex);
  let stopCurrentTailer = null;

  if (activeFilePath) {
    console.log(`[Log Watcher Sentinel] Tailing rotating log [${sourceLabel}]: ${activeFilePath}`);
    stopCurrentTailer = createSingleFileTailer(activeFilePath, sourceLabel, io, false);
  } else {
    console.log(`[Log Watcher Sentinel] Watching [${sourceLabel}] directory for pattern ${basePattern}: ${dirPath}`);
  }

  function checkForNewerFile() {
    const latest = findLatestMatchingFile(dirPath, nameRegex);
    if (latest && latest !== activeFilePath) {
      const hadPreviousFile = Boolean(activeFilePath);
      if (stopCurrentTailer) {
        stopCurrentTailer();
        stopCurrentTailer = null;
      }
      activeFilePath = latest;
      console.log(`[Log Watcher Sentinel] Switched [${sourceLabel}] to rotated log file: ${activeFilePath}`);
      // Read from byte 0 when switching to a newly rotated daily file
      stopCurrentTailer = createSingleFileTailer(activeFilePath, sourceLabel, io, hadPreviousFile);
    }
  }

  try {
    fs.watch(dirPath, () => {
      checkForNewerFile();
    });
  } catch (err) {
    console.warn(`[Log Watcher Warning] Could not watch directory [${sourceLabel}] ${dirPath}: ${err.message}`);
  }

  // Periodic fallback check (handles midnight rotation even if fs.watch misses an event)
  setInterval(checkForNewerFile, 15000);
  return true;
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
    if (target.filePath.includes('*')) {
      if (startRotatingLogTailer(target.filePath, target.label, io)) {
        activeTargets.push(`${target.label} (${target.filePath})`);
      }
      continue;
    }

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
    createSingleFileTailer(filePath, sourceLabel, io, false);
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
