import express from 'express';
import { MetricHistory } from '../models/MetricHistory.js';
import { getLatestMetrics, getInMemoryHistory } from '../services/systemMonitor.js';
import { getDBStatus } from '../config/db.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

const ALLOWED_TIMEFRAMES = new Set(['1h', '24h', '7d', '30d']);
const ALLOWED_PURGE_RANGES = new Set(['all', 'older_than_7d', 'older_than_24h']);

// GET /api/metrics/current - Get instant current metrics (Protected)
router.get('/current', protect, (req, res) => {
  res.json({
    success: true,
    data: getLatestMetrics(),
  });
});

// GET /api/metrics/history?timeframe=1h|24h|7d|30d (Protected)
router.get('/history', protect, async (req, res) => {
  const rawTimeframe = req.query.timeframe;
  const timeframe = typeof rawTimeframe === 'string' && ALLOWED_TIMEFRAMES.has(rawTimeframe) ? rawTimeframe : '1h';

  const now = new Date();
  const startDate = new Date();

  switch (timeframe) {
    case '1h':
      startDate.setHours(now.getHours() - 1);
      break;
    case '24h':
      startDate.setHours(now.getHours() - 24);
      break;
    case '7d':
      startDate.setDate(now.getDate() - 7);
      break;
    case '30d':
    default:
      startDate.setDate(now.getDate() - 30);
      break;
  }

  if (getDBStatus().isConnected) {
    try {
      const metrics = await MetricHistory.find({ timestamp: { $gte: startDate } })
        .sort({ timestamp: 1 })
        .lean();

      let downsampled = metrics;
      if (metrics.length > 300) {
        const step = Math.ceil(metrics.length / 300);
        downsampled = metrics.filter((_, idx) => idx % step === 0);
      }

      return res.json({
        success: true,
        timeframe,
        count: downsampled.length,
        totalInDb: metrics.length,
        data: downsampled,
      });
    } catch (error) {
      console.error('[Metrics History Error]', error.message);
      return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
  } else {
    // In-memory fallback (still protected behind JWT auth)
    const memData = getInMemoryHistory();
    return res.json({
      success: true,
      timeframe,
      count: memData.length,
      data: memData,
      note: 'Operating on in-memory metrics cache (MongoDB not connected).',
    });
  }
});

// POST /api/metrics/purge - Manual Purge of Historical Metrics (Protected)
router.post('/purge', protect, async (req, res) => {
  if (!getDBStatus().isConnected) {
    return res.status(503).json({
      success: false,
      message: 'Database unavailable. Cannot purge historical metrics.',
    });
  }

  const { confirmationToken, purgeRange = 'all' } = req.body;

  if (confirmationToken !== 'PURGE_CONFIRMED') {
    return res.status(400).json({
      success: false,
      message: 'Invalid confirmation token. Confirmation token "PURGE_CONFIRMED" is required.',
    });
  }

  if (typeof purgeRange !== 'string' || !ALLOWED_PURGE_RANGES.has(purgeRange)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid purge range.',
    });
  }

  try {
    let filter = {};
    if (purgeRange === 'older_than_7d') {
      const date = new Date();
      date.setDate(date.getDate() - 7);
      filter = { timestamp: { $lt: date } };
    } else if (purgeRange === 'older_than_24h') {
      const date = new Date();
      date.setHours(date.getHours() - 24);
      filter = { timestamp: { $lt: date } };
    }

    const result = await MetricHistory.deleteMany(filter);
    console.log(`[DB Purge] Deleted ${result.deletedCount} metric history documents.`);

    return res.json({
      success: true,
      message: `Successfully purged ${result.deletedCount} metrics records from MongoDB Atlas.`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error('[Metrics Purge Error]', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

export default router;
