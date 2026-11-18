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
let configuredTargetsCache = [];

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
  const sanitizedPath = isHttp ? rawText.split('?')[0].substring(0, 300) : rawText.substring(0, 500);

  const formattedLog = {
    id: Date.now() + Math.random().toString(36).substring(2, 7),
    ip: logEntry.ip || (isHttp ? '127.0.0.1' : 'app'),
    method: logEntry.method || 'GET',
    path: sanitizedPath,
    detail: typeof logEntry.detail === 'string' ? logEntry.detail.substring(0, 500) : '',
    statusCode: logEntry.statusCode || 200,
    responseTimeMs: logEntry.responseTimeMs || 0,
    userAgent: typeof logEntry.userAgent === 'string' ? logEntry.userAgent.substring(0, 200) : '',
    source: logEntry.source || 'sentinel',
    isHttp,
    timestamp: logEntry.timestamp || new Date().toISOString(),
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

function normalizeTimestamp(rawTs) {
  if (!rawTs) return null;
  if (typeof rawTs === 'number') {
    const d = new Date(rawTs);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof rawTs !== 'string') return null;
  const trimmed = rawTs.trim();
  if (!trimmed) return null;

  // Handle Nginx date format: 18/Nov/2026:23:28:00 +0700
  const nginxDate = trimmed.match(/^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}:\d{2}:\d{2})(?:\s+([+-]\d{4}))?$/);
  if (nginxDate) {
    const formatted = `${nginxDate[1]} ${nginxDate[2]} ${nginxDate[3]} ${nginxDate[4]}${nginxDate[5] ? ' ' + nginxDate[5] : ''}`;
    const d = new Date(formatted);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  // Handle "YYYY-MM-DD HH:mm:ss"
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(trimmed) ? trimmed.replace(' ', 'T') : trimmed;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function extractWinstonDetail(obj) {
  if (typeof obj.stack_trace === 'string' && obj.stack_trace) return obj.stack_trace;
  if (typeof obj.stack === 'string' && obj.stack) return obj.stack;
  if (typeof obj.error === 'string' && obj.error) return obj.error;
  return '';
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
      const parsedTs = normalizeTimestamp(obj.timestamp || obj.time || obj.date) || options.fallbackTimestamp || null;

      if (obj && typeof obj.method === 'string' && (obj.url || obj.path) && obj.statusCode !== undefined) {
        return {
          ip: typeof obj.ipAddress === 'string' ? obj.ipAddress : typeof obj.ip === 'string' ? obj.ip : '127.0.0.1',
          method: obj.method.toUpperCase(),
          path: obj.url || obj.path,
          detail: '',
          statusCode: parseInt(obj.statusCode, 10) || 200,
          responseTimeMs: Math.round(Number(obj.responseTime ?? obj.responseTimeMs ?? 0) || 0),
          userAgent: typeof obj.userAgent === 'string' ? obj.userAgent : '',
          source: sourceLabel,
          isHttp: true,
          timestamp: parsedTs || new Date().toISOString(),
        };
      }

      if (obj && (typeof obj.message === 'string' || typeof obj.level === 'string')) {
        const { method, statusCode } = mapLogLevelToStatusAndMethod(obj.level);
        const contextPrefix = typeof obj.context === 'string' && obj.context ? `[${obj.context}] ` : '';
        const servicePrefix =
          !contextPrefix && typeof obj.service === 'string' && obj.service ? `[${obj.service}] ` : '';
        const msg = typeof obj.message === 'string' ? obj.message : JSON.stringify(obj);
        return {
          ip: typeof obj.ipAddress === 'string' ? obj.ipAddress : typeof obj.ip === 'string' ? obj.ip : 'app',
          method,
          path: `${contextPrefix}${servicePrefix}${msg}`,
          detail: extractWinstonDetail(obj),
          statusCode,
          responseTimeMs: 0,
          userAgent: '',
          source: sourceLabel,
          isHttp: false,
          timestamp: parsedTs || new Date().toISOString(),
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  // 2. Nginx / Apache Combined Log Format
  const nginxMatch = trimmed.match(
    /^(\S+) \S+ \S+ \[(.*?)\] "(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS) (\S+).*?" (\d{3}) \S+(?: "[^"]*" "([^"]*)")?/
  );
  if (nginxMatch) {
    const parsedTs = normalizeTimestamp(nginxMatch[2]) || options.fallbackTimestamp || new Date().toISOString();
    return {
      ip: nginxMatch[1],
      method: nginxMatch[3],
      path: nginxMatch[4],
      detail: '',
      statusCode: parseInt(nginxMatch[5], 10),
      responseTimeMs: 0,
      userAgent: nginxMatch[6] || '',
      source: sourceLabel,
      isHttp: true,
      timestamp: parsedTs,
    };
  }

  // 3. Plain-text application logs (only for non-Nginx/Apache files)
  if (options.isWebServerAccessLog) {
    return null;
  }

  const tsLevelMatch = trimmed.match(
    /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)(?:\s+\[?([a-zA-Z]+)\]?:?)?\s+(.*)$/
  );
  if (tsLevelMatch) {
    const levelGuess = tsLevelMatch[2] || (sourceLabel.toLowerCase().includes('error') ? 'error' : 'info');
    const { method, statusCode } = mapLogLevelToStatusAndMethod(levelGuess);
    return {
      ip: 'app',
      method,
      path: tsLevelMatch[3] || trimmed,
      detail: '',
      statusCode,
      responseTimeMs: 0,
      userAgent: '',
      source: sourceLabel,
      isHttp: false,
      timestamp: normalizeTimestamp(tsLevelMatch[1]) || options.fallbackTimestamp || new Date().toISOString(),
    };
  }

  const prefixLevelMatch = trimmed.match(/^\[?(error|warn|warning|info|debug)\]?:?\s+(.*)$/i);
  if (prefixLevelMatch) {
    const { method, statusCode } = mapLogLevelToStatusAndMethod(prefixLevelMatch[1]);
    return {
      ip: 'app',
      method,
      path: prefixLevelMatch[2] || trimmed,
      detail: '',
      statusCode,
      responseTimeMs: 0,
      userAgent: '',
      source: sourceLabel,
      isHttp: false,
      timestamp: options.fallbackTimestamp || new Date().toISOString(),
    };
  }

  const fallbackLevel = sourceLabel.toLowerCase().includes('error') ? 'error' : 'info';
  const { method, statusCode } = mapLogLevelToStatusAndMethod(fallbackLevel);
  return {
    ip: 'app',
    method,
    path: trimmed,
    detail: '',
    statusCode,
    responseTimeMs: 0,
    userAgent: '',
    source: sourceLabel,
    isHttp: false,
    timestamp: options.fallbackTimestamp || new Date().toISOString(),
  };
}

function globBaseNameToRegex(basePattern, includeRotatedSuffix = false) {
  const escaped = basePattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const suffix = includeRotatedSuffix ? '(?:\\.\\d+)?' : '';
  return new RegExp(`^${escaped}${suffix}$`);
}

function buildHistoricalNameRegex(targetFilePath) {
  const base = path.basename(targetFilePath);
  if (base.includes('*')) {
    return globBaseNameToRegex(base, true);
  }
  // Handle both nginx style (file.log.1) and NestJS CustomLoggerService style (http.1.log)
  const ext = path.extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  const escapedBase = base.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const escapedStem = stem.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const escapedExt = ext.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  if (ext) {
    return new RegExp(`^(?:${escapedBase}(?:\\.\\d+)?|${escapedStem}\\.\\d+${escapedExt})$`);
  }
  return new RegExp(`^${escapedBase}(?:\\.\\d+)?$`);
}

function findMatchingFilesInDir(dirPath, nameRegex) {
  try {
    if (!fs.existsSync(dirPath)) return [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      if (!entry.isFile() || !nameRegex.test(entry.name)) continue;
      const fullPath = path.join(dirPath, entry.name);
      try {
        const stats = fs.statSync(fullPath);
        files.push({
          name: entry.name,
          fullPath,
          sizeBytes: stats.size,
          mtimeMs: stats.mtimeMs,
          modifiedAt: new Date(stats.mtimeMs).toISOString(),
        });
      } catch {
        // Ignore transient stat error during rotation
      }
    }

    // Sort newest first by mtime, then filename descending
    files.sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name));
    return files;
  } catch {
    return [];
  }
}

function findLatestMatchingFile(dirPath, nameRegex) {
  const files = findMatchingFilesInDir(dirPath, nameRegex);
  return files.length > 0 ? files[0].fullPath : null;
}

function isWebServerLogPath(filePath) {
  const lower = filePath.toLowerCase();
  return lower.includes('/nginx/') || lower.includes('/apache2/') || lower.includes('/httpd/');
}

function resolveConfiguredTargets(customPath) {
  const isEnabled = (process.env.ENABLE_SYSTEM_LOG_TAILER || 'false').toLowerCase() === 'true';
  if (!isEnabled) return [];

  const configuredMulti = (process.env.LOG_FILE_PATHS || '')
    .split(',')
    .map(parseLogTargetEntry)
    .filter(Boolean);

  if (configuredMulti.length > 0) return configuredMulti;

  const singleRaw = customPath || process.env.LOG_FILE_PATH;
  if (singleRaw) {
    const parsed = parseLogTargetEntry(singleRaw);
    if (parsed) return [parsed];
  }

  const fallbackPaths = [
    '/var/log/nginx/access.log',
    '/var/log/nginx/other_vhosts_access.log',
    '/var/log/apache2/access.log',
    '/var/log/httpd/access_log',
  ];
  for (const p of fallbackPaths) {
    if (fs.existsSync(p)) {
      return [{ label: 'nginx', filePath: p }];
    }
  }
  return [];
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

  const nameRegex = globBaseNameToRegex(basePattern, false);
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

  setInterval(checkForNewerFile, 15000);
  return true;
}

export function autoDetectAndStartLogTailer(customPath, io) {
  const isEnabled = (process.env.ENABLE_SYSTEM_LOG_TAILER || 'false').toLowerCase() === 'true';
  if (!isEnabled) {
    configuredTargetsCache = [];
    activeLogSource = 'Application Stream (System access log tailing disabled for multi-app isolation)';
    console.log(
      '[Log Watcher] System access log tailing disabled (ENABLE_SYSTEM_LOG_TAILER != true). Monitoring application traffic only.'
    );
    return;
  }

  const targets = resolveConfiguredTargets(customPath);
  configuredTargetsCache = targets;

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

/**
 * Lists allowlisted historical log files across configured targets (safe against path traversal).
 */
export function listHistoricalLogFiles() {
  const targets = configuredTargetsCache.length > 0 ? configuredTargetsCache : resolveConfiguredTargets();
  return targets.map((target) => {
    const dirPath = path.dirname(target.filePath);
    const regex = buildHistoricalNameRegex(target.filePath);
    const files = findMatchingFilesInDir(dirPath, regex).map((f) => ({
      name: f.name,
      sizeBytes: f.sizeBytes,
      modifiedAt: f.modifiedAt,
    }));
    return {
      source: target.label,
      pattern: target.filePath,
      files,
    };
  });
}

function matchesFilter(entry, { qLower, levelFilter, fromMs, toMs }) {
  if (fromMs !== null || toMs !== null) {
    const tsMs = new Date(entry.timestamp).getTime();
    if (!Number.isNaN(tsMs)) {
      if (fromMs !== null && tsMs < fromMs) return false;
      if (toMs !== null && tsMs > toMs) return false;
    }
  }

  if (levelFilter && levelFilter !== 'ALL') {
    const sc = Number(entry.statusCode) || 0;
    const methodUpper = (entry.method || '').toUpperCase();
    if (levelFilter === '2xx' && (sc < 200 || sc >= 300)) return false;
    if (levelFilter === '4xx' && (sc < 400 || sc >= 500)) return false;
    if (levelFilter === '5xx' && sc < 500) return false;
    if (['INFO', 'WARN', 'ERROR', 'DEBUG', 'GET', 'POST', 'PUT', 'DELETE'].includes(levelFilter) && methodUpper !== levelFilter) {
      return false;
    }
  }

  if (qLower) {
    const haystack = `${entry.path || ''} ${entry.detail || ''} ${entry.ip || ''} ${entry.method || ''} ${entry.statusCode || ''} ${entry.source || ''}`.toLowerCase();
    if (!haystack.includes(qLower)) return false;
  }

  return true;
}

async function scanFileLines(fileInfo, sourceLabel, filterOpts, maxLinesRemaining, maxBytesRemaining) {
  const isWebServerAccessLog = isWebServerLogPath(fileInfo.fullPath);
  const matches = [];
  let scannedLines = 0;
  let scannedBytes = 0;
  let truncated = false;

  const stream = fs.createReadStream(fileInfo.fullPath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      scannedLines++;
      scannedBytes += Buffer.byteLength(line, 'utf8') + 1;

      if (scannedLines > maxLinesRemaining || scannedBytes > maxBytesRemaining) {
        truncated = true;
        break;
      }

      const parsed = parseLogLine(line, sourceLabel, {
        isWebServerAccessLog,
        fallbackTimestamp: fileInfo.modifiedAt,
      });
      if (!parsed) continue;

      if (matchesFilter(parsed, filterOpts)) {
        matches.push({
          ...parsed,
          file: fileInfo.name,
        });
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  return { matches, scannedLines, scannedBytes, truncated };
}

/**
 * Queries historical disk log files and/or MongoDB RequestLog safely with bounded memory and scan limits.
 */
export async function queryHistoricalLogs({
  source = 'ALL',
  file = 'latest',
  q = '',
  level = 'ALL',
  from = '',
  to = '',
  limit = 200,
  order = 'desc',
} = {}) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500);
  const safeOrder = order === 'asc' ? 'asc' : 'desc';
  const qLower = typeof q === 'string' ? q.trim().toLowerCase() : '';
  const levelFilter = typeof level === 'string' ? level.trim() : 'ALL';

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  const fromMs = fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate.getTime() : null;
  const toMs = toDate && !Number.isNaN(toDate.getTime()) ? toDate.getTime() : null;

  // Special source: MongoDB persisted HTTP RequestLogs
  if (source === 'sentinel-http-db') {
    if (!getDBStatus().isConnected) {
      return {
        items: [],
        filesScanned: [],
        scannedLines: 0,
        truncated: false,
        note: 'MongoDB is disconnected.',
      };
    }

    const dbQuery = {};
    if (fromMs !== null || toMs !== null) {
      dbQuery.timestamp = {};
      if (fromMs !== null) dbQuery.timestamp.$gte = new Date(fromMs);
      if (toMs !== null) dbQuery.timestamp.$lte = new Date(toMs);
    }

    if (levelFilter === '2xx') dbQuery.statusCode = { $gte: 200, $lt: 300 };
    else if (levelFilter === '4xx') dbQuery.statusCode = { $gte: 400, $lt: 500 };
    else if (levelFilter === '5xx' || levelFilter === 'ERROR') dbQuery.statusCode = { $gte: 500 };
    else if (levelFilter === 'WARN') dbQuery.statusCode = { $gte: 400, $lt: 500 };
    else if (['GET', 'POST', 'PUT', 'DELETE'].includes(levelFilter)) dbQuery.method = levelFilter;

    if (qLower) {
      const escaped = qLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      dbQuery.$or = [{ path: regex }, { ip: regex }, { method: regex }];
    }

    const docs = await RequestLog.find(dbQuery)
      .sort({ timestamp: safeOrder === 'asc' ? 1 : -1 })
      .limit(safeLimit)
      .lean();

    const items = docs.map((d) => ({
      id: d._id.toString(),
      ip: d.ip,
      method: d.method,
      path: d.path,
      detail: '',
      statusCode: d.statusCode,
      responseTimeMs: d.responseTimeMs || 0,
      source: 'sentinel-http-db',
      file: 'mongodb:requestlogs',
      isHttp: true,
      timestamp: d.timestamp ? new Date(d.timestamp).toISOString() : new Date().toISOString(),
    }));

    return {
      items,
      filesScanned: ['mongodb:requestlogs'],
      scannedLines: items.length,
      truncated: false,
    };
  }

  const targets = configuredTargetsCache.length > 0 ? configuredTargetsCache : resolveConfiguredTargets();
  const selectedTargets = source === 'ALL' ? targets : targets.filter((t) => t.label === source);

  const fileCandidates = [];
  for (const target of selectedTargets) {
    const dirPath = path.dirname(target.filePath);
    const regex = buildHistoricalNameRegex(target.filePath);
    let matchedFiles = findMatchingFilesInDir(dirPath, regex);

    if (fromMs !== null) {
      matchedFiles = matchedFiles.filter((f) => f.mtimeMs >= fromMs);
    }

    if (file && file !== 'all' && file !== 'latest') {
      const safeFileName = path.basename(file);
      matchedFiles = matchedFiles.filter((f) => f.name === safeFileName);
    } else if (file === 'latest' && matchedFiles.length > 0) {
      matchedFiles = [matchedFiles[0]];
    }

    for (const mf of matchedFiles) {
      fileCandidates.push({ ...mf, sourceLabel: target.label });
    }
  }

  if (safeOrder === 'desc') {
    fileCandidates.sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name));
  } else {
    fileCandidates.sort((a, b) => a.mtimeMs - b.mtimeMs || a.name.localeCompare(b.name));
  }

  const MAX_FILES_PER_QUERY = 25;
  const MAX_SCAN_LINES = 60000;
  const MAX_SCAN_BYTES = 25 * 1024 * 1024;

  let remainingLines = MAX_SCAN_LINES;
  let remainingBytes = MAX_SCAN_BYTES;
  let totalScannedLines = 0;
  let truncated = false;
  const filesScanned = [];
  const collected = [];

  for (const fileInfo of fileCandidates.slice(0, MAX_FILES_PER_QUERY)) {
    if (remainingLines <= 0 || remainingBytes <= 0 || collected.length >= safeLimit) {
      if (collected.length < safeLimit) truncated = true;
      break;
    }

    const res = await scanFileLines(
      fileInfo,
      fileInfo.sourceLabel,
      { qLower, levelFilter, fromMs, toMs },
      remainingLines,
      remainingBytes
    );

    filesScanned.push(`${fileInfo.sourceLabel}:${fileInfo.name}`);
    totalScannedLines += res.scannedLines;
    remainingLines -= res.scannedLines;
    remainingBytes -= res.scannedBytes;
    if (res.truncated) truncated = true;

    const orderedMatches = safeOrder === 'desc' ? res.matches.reverse() : res.matches;
    for (const item of orderedMatches) {
      collected.push(item);
      if (collected.length >= safeLimit) break;
    }
  }

  if (fileCandidates.length > MAX_FILES_PER_QUERY && collected.length < safeLimit) {
    truncated = true;
  }

  return {
    items: collected,
    filesScanned,
    scannedLines: totalScannedLines,
    truncated,
  };
}

export function getRecentLogs() {
  return logBuffer;
}

export function getActiveLogSource() {
  return activeLogSource;
}
