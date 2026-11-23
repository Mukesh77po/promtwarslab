/**
 * src/middleware/index.js
 * Auth cookie parsing, role guard, error handler, structured logger.
 */

import { createHmac, timingSafeEqual as cryptoTimingSafeEqual } from 'node:crypto';
import { sessionSecret, ROLES, IS_PRODUCTION } from '../config.js';

// ── Cookie signing ────────────────────────────────────────────────────────────

/**
 * @param {string} role
 * @param {string} userId
 * @returns {string} signed cookie value
 */
export function buildRoleCookie(role, userId) {
  const payload = `${role}:${userId}`;
  const sig = createHmac('sha256', sessionSecret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

/**
 * Parse and verify role cookie.
 * @param {string} raw
 * @returns {{ role: string, userId: string }|null}
 */
function parseRoleCookie(raw) {
  if (!raw || typeof raw !== 'string') { return null; }
  const lastDot = raw.lastIndexOf('.');
  if (lastDot < 0) { return null; }
  const payload = raw.slice(0, lastDot);
  const sig     = raw.slice(lastDot + 1);
  const expected = createHmac('sha256', sessionSecret).update(payload).digest('hex');
  const sigBuf  = Buffer.from(sig, 'hex');
  const expBuf  = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length || !cryptoTimingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  const [role, userId] = payload.split(':');
  if (!ROLES.includes(role)) { return null; }
  return { role, userId };
}

/**
 * Parse cookies from request header.
 * @param {string} cookieHeader
 * @returns {Record<string, string>}
 */
function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) { return out; }
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) { continue; }
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

/**
 * Middleware: attach req.user = { role, userId } or null.
 */
export function attachUser(req, _res, next) {
  const cookies = parseCookies(req.headers.cookie);
  req.user = parseRoleCookie(cookies.lablink_role) ?? null;
  next();
}

/**
 * Middleware factory: require one of the given roles.
 * @param {...string} allowedRoles
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  };
}

/**
 * Middleware: require authentication (any role).
 */
export const requireAuth = requireRole(...ROLES);

/**
 * Structured JSON logger middleware (no PII, no secrets).
 */
export function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    console.log(JSON.stringify({
      level: res.statusCode >= 500 ? 'error' : 'info',
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - start,
    }));
  });
  next();
}

/**
 * Global error handler – returns generic messages to client.
 */
export function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  // Log full error server-side, return generic message to client
  if (status >= 500) {
    console.error(JSON.stringify({
      level: 'error',
      method: req.method,
      path: req.path,
      error: err.message,
      stack: IS_PRODUCTION ? undefined : err.stack,
    }));
  }
  if (res.headersSent) { return; }
  const message = err.publicMessage || (status < 500 ? err.message : 'Internal server error');
  res.status(status).json({ error: message });
}
