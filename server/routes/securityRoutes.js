import express from 'express';
import mongoose from 'mongoose';
import { SecurityAlert } from '../models/SecurityAlert.js';
import { getDBStatus } from '../config/db.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

const ALLOWED_STATUSES = new Set(['active', 'resolved', 'ignored']);

// GET /api/security/alerts - Fetch security threat alerts (Protected)
router.get('/alerts', protect, async (req, res) => {
  if (!getDBStatus().isConnected) {
    return res.status(503).json({
      success: false,
      message: 'Database unavailable. Cannot fetch security alerts.',
    });
  }

  const { status, limit } = req.query;
  const query = {};

  if (status !== undefined) {
    if (typeof status !== 'string' || !ALLOWED_STATUSES.has(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status filter.' });
    }
    query.status = status;
  }

  const parsedLimit = parseInt(typeof limit === 'string' ? limit : '50', 10);
  const safeLimit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 50;

  try {
    const alerts = await SecurityAlert.find(query)
      .sort({ timestamp: -1 })
      .limit(safeLimit)
      .lean();

    return res.json({
      success: true,
      count: alerts.length,
      data: alerts,
    });
  } catch (error) {
    console.error('[Security Alerts Fetch Error]', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// PATCH /api/security/alerts/:id/status - Update alert status (Protected)
router.patch('/alerts/:id/status', protect, async (req, res) => {
  if (!getDBStatus().isConnected) {
    return res.status(503).json({
      success: false,
      message: 'Database unavailable. Cannot update alert status.',
    });
  }

  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Invalid alert ID.' });
  }

  const { status } = req.body;
  if (typeof status !== 'string' || !ALLOWED_STATUSES.has(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status value.' });
  }

  try {
    const alert = await SecurityAlert.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Security alert not found.' });
    }
    return res.json({ success: true, data: alert });
  } catch (error) {
    console.error('[Security Alert Update Error]', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// DELETE /api/security/alerts/clear - Clear alerts (Protected)
router.delete('/alerts/clear', protect, async (req, res) => {
  if (!getDBStatus().isConnected) {
    return res.status(503).json({
      success: false,
      message: 'Database unavailable. Cannot clear security alerts.',
    });
  }

  try {
    const result = await SecurityAlert.deleteMany({});
    return res.json({ success: true, message: `Cleared ${result.deletedCount} security alerts.` });
  } catch (error) {
    console.error('[Security Alerts Clear Error]', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

export default router;
