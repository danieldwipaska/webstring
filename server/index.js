import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

import { connectDB } from './config/db.js';
import { validateSecurityConfig, isOriginAllowed, parseCookies } from './config/security.js';
import { collectMetrics, getLatestMetrics } from './services/systemMonitor.js';
import { checkAnomalies } from './services/anomalyDetector.js';
import { autoDetectAndStartLogTailer, pushInternalLog } from './services/logWatcher.js';

import { applySecurityHeaders } from './middleware/securityHeaders.js';
import { apiLimiter, loginLimiter } from './middleware/rateLimiter.js';
import { verifyUserToken } from './middleware/auth.js';

import authRoutes from './routes/authRoutes.js';
import metricRoutes from './routes/metricRoutes.js';
import securityRoutes from './routes/securityRoutes.js';
import systemRoutes from './routes/systemRoutes.js';

dotenv.config();

// Fail-fast in production if JWT_SECRET is missing or insecure
validateSecurityConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const PORT = parseInt(process.env.PORT || '5000', 10);
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0');

// Trust reverse proxy (e.g. Nginx) so req.ip and req.secure work reliably without header spoofing
const trustProxyRaw = process.env.TRUST_PROXY ?? '1';
if (trustProxyRaw === 'false' || trustProxyRaw === '0') {
  app.set('trust proxy', false);
} else if (/^\d+$/.test(trustProxyRaw)) {
  app.set('trust proxy', parseInt(trustProxyRaw, 10));
} else {
  app.set('trust proxy', trustProxyRaw);
}

// Security Hardening: Disable Express signature header
app.disable('x-powered-by');

// Socket.io initialization with origin validation and strict authentication
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Request-level host check is handled in allowRequest below
      callback(null, Boolean(origin));
    },
    credentials: true,
    methods: ['GET', 'POST'],
  },
  allowRequest: (req, callback) => {
    const origin = req.headers.origin;
    const host = req.headers.host;
    if (!isOriginAllowed(origin, host)) {
      return callback('Origin not allowed by CORS', false);
    }
    return callback(null, true);
  },
});

// Authenticate every WebSocket handshake using HttpOnly JWT cookie or auth token
io.use(async (socket, next) => {
  try {
    const cookies = parseCookies(socket.handshake.headers?.cookie);
    const token = cookies.token || socket.handshake.auth?.token;
    const user = await verifyUserToken(token);
    socket.user = { id: user._id.toString(), username: user.username, role: user.role };
    return next();
  } catch (err) {
    return next(new Error(err.message || 'Authentication required'));
  }
});

app.set('io', io);

// Security Headers Middleware
app.use(applySecurityHeaders);

// Dynamic per-request CORS validation (blocks arbitrary cross-origin credentialed requests)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const host = req.headers.host;

  return cors({
    origin: (reqOrigin, callback) => {
      if (isOriginAllowed(reqOrigin, host)) {
        return callback(null, Boolean(reqOrigin));
      }
      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
  })(req, res, (err) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Cross-origin request blocked by CORS policy.' });
    }
    return next();
  });
});

app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());

// Request logging middleware for live request stream & low overhead telemetry
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (!req.path.startsWith('/socket.io') && !req.path.endsWith('.js') && !req.path.endsWith('.css')) {
      pushInternalLog(
        {
          ip: req.ip || req.socket?.remoteAddress || '127.0.0.1',
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          responseTimeMs: duration,
          userAgent: req.headers['user-agent'] || '',
        },
        io
      );
    }
  });
  next();
});

// Minimal public health endpoint (no sensitive runtime details)
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok' });
});

// Strict Rate Limiter for Auth Routes
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', loginLimiter);

// Global Rate Limiter for API Routes
app.use('/api', apiLimiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/metrics', metricRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/system', systemRoutes);

// Production Static File Serving
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
}

// Socket.io Handlers (Authenticated clients only)
io.on('connection', (socket) => {
  console.log(`[WebSocket] Authenticated client connected: ${socket.id} (${socket.user?.username || 'admin'})`);

  // Immediately send initial metrics
  socket.emit('metrics:update', getLatestMetrics());

  socket.on('disconnect', () => {
    // Client disconnected
  });
});

// Start Server & Background Sampling Engine
async function startApp() {
  await connectDB();

  // Opt-in system web server access log tailer (disabled by default to isolate co-hosted apps)
  autoDetectAndStartLogTailer(process.env.LOG_FILE_PATH, io);

  // Interval sampling (Default 2000ms for fast UI update without high CPU load)
  const samplingInterval = parseInt(process.env.SAMPLING_INTERVAL_MS || '2000', 10);

  setInterval(async () => {
    const metrics = await collectMetrics();
    io.emit('metrics:update', metrics);
    await checkAnomalies(metrics, io);
  }, samplingInterval);

  server.listen(PORT, HOST, () => {
    console.log(`====================================================`);
    console.log(` Ubuntu Realtime Server Monitor running on ${HOST}:${PORT}`);
    console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(` Realtime Sampling: ${samplingInterval}ms`);
    console.log(` DB Persist Interval: ${process.env.DB_PERSIST_INTERVAL_MS || 15000}ms`);
    console.log(`====================================================`);
  });
}

startApp();
