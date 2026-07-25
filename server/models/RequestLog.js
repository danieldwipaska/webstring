import mongoose from 'mongoose';

const requestLogSchema = new mongoose.Schema({
  ip: {
    type: String,
    required: true,
  },
  method: {
    type: String,
    required: true,
  },
  path: {
    type: String,
    required: true,
  },
  statusCode: {
    type: Number,
    required: true,
  },
  responseTimeMs: {
    type: Number,
    default: 0,
  },
  userAgent: {
    type: String,
    default: '',
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

// TTL Index: Expire request logs older than 30 days
requestLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

export const RequestLog = mongoose.model('RequestLog', requestLogSchema);
