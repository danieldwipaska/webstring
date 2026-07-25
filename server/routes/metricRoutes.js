import express from 'express';
import { MetricHistory } from '../models/MetricHistory.js';
import { getLatestMetrics, getInMemoryHistory } from '../services/systemMonitor.js';
import { getDBStatus } from '../config/db.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// GET /api/metrics/current - Get instant current metrics (Protected)
router.get('/current', protect, (req, res) => {
  res.json({
    success: true,
    data: getLatestMetrics(),
  });
});

// GET /api/metrics/history?timeframe=1h|24h|7d|30d (Protected)
router.get('/history', protect, async (req, res) => {
  const { timeframe = '1h' } = req.query;
  const now = new Date();
  let startDate = new Date();

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
      return res.status(500).json({ success: false, message: error.message });
    }
  } else {
    // In-memory fallback
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

// DELETE /api/metrics/purge - Manual Purge of Historical Metrics (Protected)
router.post('/purge', protect, async (req, res) => {
  const { confirmationToken, purgeRange = 'all' } = req.body;

  if (confirmationToken !== 'PURGE_CONFIRMED') {
    return res.status(400).json({
      success: false,
      message: 'Invalid confirmation token. Confirmation token "PURGE_CONFIRMED" is required.',
    });
  }

  if (getDBStatus().isConnected) {
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
      return res.status(500).json({ success: false, message: error.message });
    }
  } else {
    return res.json({
      success: true,
      message: 'In-memory metrics history cleared.',
      deletedCount: getInMemoryHistory().length,
    });
  }
});

export default router;
