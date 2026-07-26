# Security Policy

## Supported Versions

We recommend using the latest release of **Ubuntu Realtime Server Sentinel (`webstring`)** to ensure you have the latest security updates and performance improvements.

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0.0 | :x:                |

## Security Architecture & Hardening Features

This application implements multi-layered security controls to protect server telemetry and administration credentials:

1. **Anti Brute-Force Rate Limiter (`loginLimiter`)**:
   - Limits login attempts to **5 attempts per 15 minutes** per IP address.
   - Responds with HTTP `429 Too Many Requests` and a `Retry-After` header when exceeded.
   - Automatically logs a `SUSPICIOUS_AUTH_ATTEMPT` security alert for live threat tracking.

2. **Global API Rate Limiter (`apiLimiter`)**:
   - Limits general API requests to **100 requests per minute** per IP to protect against Denial of Service (DDoS) and API scraping.

3. **NoSQL Injection Prevention**:
   - Strictly sanitizes and coerces authentication parameters (`username`, `email`, `emailOrUsername`, `password`) to string primitives, preventing object query operator injection attacks.

4. **HTTP Security Headers**:
   - `X-Frame-Options: DENY` (Anti Clickjacking)
   - `X-Content-Type-Options: nosniff` (Anti MIME Sniffing)
   - `X-XSS-Protection: 1; mode=block`
   - `Content-Security-Policy` (CSP)
   - Suppressed `X-Powered-By` Express signature header.

5. **Single-User Access Guard**:
   - Hardened registration route (`POST /api/auth/register`) preventing more than **1 administrator account** from being created.

---

## Reporting a Vulnerability

We take the security of this project seriously. If you discover a security vulnerability, please follow responsible disclosure guidelines:

1. **Do NOT open a public GitHub issue** for security vulnerabilities.
2. Email your findings directly to **danielkamasi@outlook.com**.
3. Include detailed information:
   - Type of issue (e.g. XSS, authentication bypass, command injection)
   - Step-by-step instructions to reproduce the issue
   - Potential impact of the vulnerability

### Response Timeline
- **Acknowledgement**: Within 48 hours.
- **Assessment & Fix**: We will work to verify and release a fix as quickly as possible.
- **Disclosure**: Once a fix is deployed, an advisory will be published.

Thank you for helping keep this project and its users secure!
