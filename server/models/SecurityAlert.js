import mongoose from 'mongoose';

const securityAlertSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'CPU_HIGH_LOAD',
      'MEMORY_EXHAUSTION',
      'DISK_SPACE_CRITICAL',
      'TRAFFIC_DDoS_SPIKE',
      'SUSPICIOUS_AUTH_ATTEMPT',
      'SUSPICIOUS_IP_ACCESS',
      'SYSTEM_ERROR',
    ],
    required: true,
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  sourceIp: {
    type: String,
    default: 'Internal / System',
  },
  metadata: {
    type: Object,
    default: {},
  },
  status: {
    type: String,
    enum: ['active', 'resolved', 'ignored'],
    default: 'active',
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

// TTL Index: Expire alerts older than 30 days
securityAlertSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

export const SecurityAlert = mongoose.model('SecurityAlert', securityAlertSchema);
