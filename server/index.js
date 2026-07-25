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
import { collectMetrics, getLatestMetrics } from './services/systemMonitor.js';
import { checkAnomalies } from './services/anomalyDetector.js';
import { autoDetectAndStartLogTailer, pushInternalLog } from './services/logWatcher.js';

import authRoutes from './routes/authRoutes.js';
import metricRoutes from './routes/metricRoutes.js';
import securityRoutes from './routes/securityRoutes.js';
import systemRoutes from './routes/systemRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Socket.io initialization with CORS & Credentials
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST'],
  },
});

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Request logging middleware for live request stream & low overhead telemetry
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (!req.path.startsWith('/socket.io') && !req.path.endsWith('.js') && !req.path.endsWith('.css')) {
      pushInternalLog(
        {
          ip: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1',
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

// Socket.io Handlers
io.on('connection', (socket) => {
  console.log(`[WebSocket] Client connected: ${socket.id}`);

  // Immediately send initial metrics
  socket.emit('metrics:update', getLatestMetrics());

  socket.on('disconnect', () => {
    // Client disconnected
  });
});

// Start Server & Background Sampling Engine
async function startApp() {
  await connectDB();

  // Automatically detect & tail system web server access log (/var/log/nginx/access.log) or fallback to app stream
  autoDetectAndStartLogTailer(process.env.LOG_FILE_PATH, io);

  // Interval sampling (Default 2000ms for fast UI update without high CPU load)
  const samplingInterval = parseInt(process.env.SAMPLING_INTERVAL_MS || '2000', 10);

  setInterval(async () => {
    const metrics = await collectMetrics();
    io.emit('metrics:update', metrics);
    await checkAnomalies(metrics, io);
  }, samplingInterval);

  server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(` Ubuntu Realtime Server Monitor running on port ${PORT}`);
    console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(` Realtime Sampling: ${samplingInterval}ms`);
    console.log(` DB Persist Interval: ${process.env.DB_PERSIST_INTERVAL_MS || 15000}ms`);
    console.log(`====================================================`);
  });
}

startApp();
