import { getDBStatus } from '../config/db.js';
import { SecurityAlert } from '../models/SecurityAlert.js';

// In-Memory storage for rate limits
const rateLimitStore = new Map();
const MAX_RATE_LIMIT_ENTRIES = 10000;

function cleanupExpiredEntries(now) {
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// Periodic cleanup of expired rate limit records (runs every 5 minutes)
setInterval(() => {
  cleanupExpiredEntries(Date.now());
}, 5 * 60 * 1000);

/**
 * Creates a rate limiter middleware instance.
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Max attempts/requests per window
 * @param {string} options.message - Error message when rate limit exceeded
 * @param {string} options.keyPrefix - Prefix for tracking store keys
 * @param {boolean} options.isAuth - Whether this limiter triggers brute-force security alerts
 */
export function createRateLimiter(options = {}) {
  const {
    windowMs = 15 * 60 * 1000,
    max = 5,
    message = 'Too many requests from this IP, please try again later.',
    keyPrefix = 'rl',
    isAuth = false,
  } = options;

  return async (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    let record = rateLimitStore.get(key);

    if (!record || now > record.resetTime) {
      if (rateLimitStore.size >= MAX_RATE_LIMIT_ENTRIES) {
        cleanupExpiredEntries(now);
        if (rateLimitStore.size >= MAX_RATE_LIMIT_ENTRIES) {
          const oldestKey = rateLimitStore.keys().next().value;
          if (oldestKey !== undefined) {
            rateLimitStore.delete(oldestKey);
          }
        }
      }
      record = {
        count: 1,
        resetTime: now + windowMs,
        alertSent: false,
      };
      rateLimitStore.set(key, record);
    } else {
      record.count++;
    }

    const remainingMs = Math.max(0, record.resetTime - now);
    const retryAfterSec = Math.ceil(remainingMs / 1000);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

    if (record.count > max) {
      res.setHeader('Retry-After', retryAfterSec);

      // Send Security Alert on Auth Brute-Force attempt
      if (isAuth && !record.alertSent) {
        record.alertSent = true;
        const alertData = {
          type: 'SUSPICIOUS_AUTH_ATTEMPT',
          severity: 'high',
          title: `Brute Force Login Blocked from ${ip}`,
          description: `IP ${ip} hit rate limit ceiling (${record.count} attempts in 15 mins). Automated brute-force protection engaged.`,
          sourceIp: ip,
          metadata: { ip, attemptCount: record.count, windowMs },
          status: 'active',
          timestamp: new Date(),
        };

        if (getDBStatus().isConnected) {
          try {
            await SecurityAlert.create(alertData);
          } catch (e) {
            console.warn('[SecurityAlert RateLimiter Warning]', e.message);
          }
        }
        if (req.app && req.app.get('io')) {
          req.app.get('io').emit('security:alert', alertData);
        }
      }

      return res.status(429).json({
        success: false,
        message,
        retryAfterSeconds: retryAfterSec,
      });
    }

    next();
  };
}

// 1. Strict Login Limiter (Max 5 attempts per 15 mins per IP)
export const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts from this IP. Access temporarily blocked for 15 minutes for security.',
  keyPrefix: 'login_rl',
  isAuth: true,
});

// 2. Global API Rate Limiter (Max 100 requests per 1 min per IP)
export const apiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  message: 'Too many API requests. Please slow down your requests.',
  keyPrefix: 'api_rl',
  isAuth: false,
});
