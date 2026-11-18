import crypto from 'crypto';

const INSECURE_DEFAULT_SECRETS = new Set([
  'super_secret_ubuntu_monitor_key_2026',
  'secret',
  'changeme',
  'jwt_secret',
]);

let cachedJwtSecret = null;

/**
 * Returns the active JWT signing secret.
 * In production, requires a strong JWT_SECRET (>= 32 chars) and rejects known insecure defaults.
 * In development, generates a per-process ephemeral secret if JWT_SECRET is not configured.
 */
export function getJwtSecret() {
  if (cachedJwtSecret) return cachedJwtSecret;

  const envSecret = typeof process.env.JWT_SECRET === 'string' ? process.env.JWT_SECRET.trim() : '';
  const isProd = process.env.NODE_ENV === 'production';

  if (envSecret && !INSECURE_DEFAULT_SECRETS.has(envSecret)) {
    if (isProd && envSecret.length < 32) {
      throw new Error('Security Error: JWT_SECRET must be at least 32 characters in production.');
    }
    cachedJwtSecret = envSecret;
    return cachedJwtSecret;
  }

  if (isProd) {
    throw new Error(
      'Security Error: JWT_SECRET is missing or uses an insecure default. Set a strong random JWT_SECRET (>= 32 chars) in .env before running in production.'
    );
  }

  console.warn(
    '[Security Warning] JWT_SECRET is missing or insecure. Generating an ephemeral secret for this development session only.'
  );
  cachedJwtSecret = crypto.randomBytes(32).toString('hex');
  return cachedJwtSecret;
}

/**
 * Validates critical security configuration at server startup.
 */
export function validateSecurityConfig() {
  getJwtSecret();
}

/**
 * Determines whether cookies should carry the Secure flag based on COOKIE_SECURE env and request TLS state.
 */
export function isCookieSecure(req) {
  const setting = (process.env.COOKIE_SECURE || 'auto').toLowerCase();
  if (setting === 'true') return true;
  if (setting === 'false') return false;
  if (!req) return false;
  return Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https');
}

/**
 * Returns configured explicit CORS origins from CORS_ORIGIN env (comma-separated).
 */
export function getConfiguredOrigins() {
  const raw = process.env.CORS_ORIGIN || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Checks whether a request Origin is allowed.
 * - Requests without Origin (curl, same-origin navigation) are allowed.
 * - If CORS_ORIGIN is configured, only those origins are allowed.
 * - Otherwise allows same-host requests (and localhost dev ports in non-production).
 */
export function isOriginAllowed(origin, requestHost) {
  if (!origin) return true;

  const configured = getConfiguredOrigins();
  if (configured.length > 0) {
    return configured.includes(origin);
  }

  try {
    const parsed = new URL(origin);
    if (requestHost && parsed.host === requestHost) {
      return true;
    }
    if (process.env.NODE_ENV !== 'production') {
      const devHosts = new Set(['localhost:3000', '127.0.0.1:3000', 'localhost:5000', '127.0.0.1:5000']);
      if (devHosts.has(parsed.host)) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}

/**
 * Safely parses a Cookie header string into a key-value map.
 */
export function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return cookies;

  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(val);
    } catch {
      cookies[key] = val;
    }
  }
  return cookies;
}

