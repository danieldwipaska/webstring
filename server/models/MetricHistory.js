import mongoose from 'mongoose';

const metricHistorySchema = new mongoose.Schema({
  cpuLoad: {
    type: Number, // Percentage 0 - 100
    required: true,
  },
  cpuCores: {
    type: Number,
    default: 1,
  },
  memoryUsed: {
    type: Number, // Bytes or MB
    required: true,
  },
  memoryTotal: {
    type: Number,
    required: true,
  },
  memoryPercentage: {
    type: Number,
    required: true,
  },
  diskUsed: {
    type: Number,
    required: true,
  },
  diskTotal: {
    type: Number,
    required: true,
  },
  diskPercentage: {
    type: Number,
    required: true,
  },
  networkTxSec: {
    type: Number, // Bytes / sec transmitted
    default: 0,
  },
  networkRxSec: {
    type: Number, // Bytes / sec received
    default: 0,
  },
  activeConnections: {
    type: Number,
    default: 0,
  },
  processCount: {
    type: Number,
    default: 0,
  },
  loadAverage: {
    type: [Number], // 1m, 5m, 15m load
    default: [0, 0, 0],
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

// TTL Index: Automatically expire documents older than 30 days (30 * 24 * 60 * 60 = 2592000 seconds)
metricHistorySchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

export const MetricHistory = mongoose.model('MetricHistory', metricHistorySchema);
