/**
 * Express middleware to set essential security headers.
 * Protects against Clickjacking, MIME Sniffing, XSS, and unauthorized iframe embedding.
 */
export function applySecurityHeaders(req, res, next) {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent Clickjacking framing attacks
  res.setHeader('X-Frame-Options', 'DENY');

  // Legacy XSS protection header (modern browsers rely on CSP)
  res.setHeader('X-XSS-Protection', '0');

  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Strict Transport Security (HSTS) - 1 year (only when actually served over HTTPS)
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Strict Content Security Policy (CSP) without unsafe-inline or unsafe-eval for scripts
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';"
  );

  next();
}
