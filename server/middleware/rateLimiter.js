import { getDBStatus } from '../config/db.js';
import { SecurityAlert } from '../models/SecurityAlert.js';

// In-Memory storage for rate limits
const rateLimitStore = new Map();

// Periodic cleanup of expired rate limit records (runs every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(key);
    }
  }
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
    message = 'Terlalu banyak permintaan dari IP ini, silakan coba lagi nanti.',
    keyPrefix = 'rl',
    isAuth = false,
  } = options;

  return async (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    let record = rateLimitStore.get(key);

    if (!record || now > record.resetTime) {
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
  message: 'Terlalu banyak percobaan login dari IP ini. Akses diblokir sementara selama 15 menit untuk keamanan.',
  keyPrefix: 'login_rl',
  isAuth: true,
});

// 2. Global API Rate Limiter (Max 100 requests per 1 min per IP)
export const apiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  message: 'Terlalu banyak permintaan API. Silakan perlambat permintaan Anda.',
  keyPrefix: 'api_rl',
  isAuth: false,
});
