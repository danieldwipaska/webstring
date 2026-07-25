import express from 'express';
import { SecurityAlert } from '../models/SecurityAlert.js';
import { getDBStatus } from '../config/db.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// GET /api/security/alerts - Fetch security threat alerts (Protected)
router.get('/alerts', protect, async (req, res) => {
  const { status, limit = 50 } = req.query;
  const query = {};

  if (status) {
    query.status = status;
  }

  if (getDBStatus().isConnected) {
    try {
      const alerts = await SecurityAlert.find(query)
        .sort({ timestamp: -1 })
        .limit(parseInt(limit, 10))
        .lean();

      return res.json({
        success: true,
        count: alerts.length,
        data: alerts,
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  } else {
    // In-memory demo alerts sample
    const sampleAlerts = [
      {
        _id: 'demo-alert-1',
        type: 'SUSPICIOUS_AUTH_ATTEMPT',
        severity: 'high',
        title: 'Multiple Failed Login Attempts',
        description: '5 failed authentication attempts detected from IP 192.168.1.105 within 30 seconds.',
        sourceIp: '192.168.1.105',
        status: 'active',
        timestamp: new Date(Date.now() - 1000 * 60 * 12),
      },
      {
        _id: 'demo-alert-2',
        type: 'CPU_HIGH_LOAD',
        severity: 'medium',
        title: 'CPU Usage Spike (>85%)',
        description: 'CPU load reached 88.4% due to intensive process execution.',
        sourceIp: 'System Hardware',
        status: 'resolved',
        timestamp: new Date(Date.now() - 1000 * 60 * 45),
      },
    ];

    return res.json({
      success: true,
      count: sampleAlerts.length,
      data: sampleAlerts,
    });
  }
});

// PATCH /api/security/alerts/:id/status - Update alert status (Protected)
router.patch('/alerts/:id/status', protect, async (req, res) => {
  const { status } = req.body;
  if (!['active', 'resolved', 'ignored'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status value.' });
  }

  if (getDBStatus().isConnected) {
    try {
      const alert = await SecurityAlert.findByIdAndUpdate(req.params.id, { status }, { new: true });
      return res.json({ success: true, data: alert });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  } else {
    return res.json({ success: true, message: 'Status updated (Demo Mode)' });
  }
});

// DELETE /api/security/alerts/clear - Clear alerts (Protected)
router.delete('/alerts/clear', protect, async (req, res) => {
  if (getDBStatus().isConnected) {
    try {
      const result = await SecurityAlert.deleteMany({});
      return res.json({ success: true, message: `Cleared ${result.deletedCount} security alerts.` });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  } else {
    return res.json({ success: true, message: 'Security alerts cleared (Demo Mode)' });
  }
});

export default router;
