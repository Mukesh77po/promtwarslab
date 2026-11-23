/**
 * src/config.js
 * All application-level constants in one place.
 */

import { createHmac, randomBytes } from 'node:crypto';

// ── Clock abstraction (injectable for tests and DEMO_MODE) ──────────────────
let _clockOverride = null;

/** @returns {Date} current logical time */
export function now() {
  return _clockOverride ? new Date(_clockOverride) : new Date();
}

/** @param {Date|number|null} t  set override (null = real clock) */
export function setClock(t) {
  _clockOverride = t === null || t === undefined ? null : Number(t);
}

// ── Session ──────────────────────────────────────────────────────────────────
let sessionSecret = process.env.SESSION_SECRET || '';
if (!sessionSecret) {
  sessionSecret = randomBytes(32).toString('hex');
  console.warn('[lablink] SESSION_SECRET not set – generated ephemeral secret (not for production)');
}
export { sessionSecret };

// ── Roles ────────────────────────────────────────────────────────────────────
export const ROLES = /** @type {const} */ (['student', 'technician', 'faculty', 'admin']);

// ── Scheduler weights (must sum to 1) ────────────────────────────────────────
export const WEIGHT_DEADLINE    = 0.40;
export const WEIGHT_FAIRNESS    = 0.25;
export const WEIGHT_SPECIFICITY = 0.20;
export const WEIGHT_FEASIBILITY = 0.15;

// ── Scheduler algorithms & constants ─────────────────────────────────────────
export const SCORE_EXP_DECAY            = 0.05;
export const FAIRNESS_PENALTY           = 0.04;
export const SPECIFICITY_PENALTY        = 0.3;
export const SWAP_DAYS_THRESHOLD        = 2;
export const MAX_FREE_SLOT_SEARCH_DAYS  = 60;
export const SLOT_DURATION_MS           = 3_600_000;
export const DEFAULT_PROJECT_HOURS      = 10;
export const MAX_LAB_DISTANCE           = 10;
export const MS_PER_DAY                 = 86_400_000;

// ── HTTP Status Codes ────────────────────────────────────────────────────────
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
};

// ── Booking slot parameters ──────────────────────────────────────────────────
export const SLOT_HOURS            = 1;         // each slot is 1 hour
export const SLOT_DAY_START        = 8;         // 08:00
export const SLOT_DAY_END          = 20;        // 20:00 (exclusive)
export const CHECKIN_WINDOW_BEFORE = 5;         // minutes before start
export const CHECKIN_WINDOW_AFTER  = 15;        // minutes after start → no-show
export const NOSHOW_RELEASE_AFTER  = 15;        // minutes after start

// ── LRU Cache for Gemini ─────────────────────────────────────────────────────
export const GEMINI_CACHE_SIZE    = 200;
export const GEMINI_TIMEOUT_MS    = 5000;

// ── Fairness window ──────────────────────────────────────────────────────────
export const FAIRNESS_WINDOW_DAYS = 14;

// ── API rate limits ──────────────────────────────────────────────────────────
export const API_RATE_LIMIT_WINDOW_MS  = 60_000;
export const API_RATE_LIMIT_MAX        = 120;
export const GEMINI_RATE_LIMIT_MAX     = 20;

// ── Pagination ───────────────────────────────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE     = 100;

// ── Environment ──────────────────────────────────────────────────────────────
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
export const DEMO_MODE     = process.env.DEMO_MODE !== 'false';
export const PORT          = parseInt(process.env.PORT || '8080', 10);

export const GEMINI_MODEL       = process.env.GEMINI_MODEL       || 'gemini-2.5-flash';
export const GEMINI_EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';

// ── HMAC helpers ─────────────────────────────────────────────────────────────
/**
 * Create an HMAC-SHA256 signature for a payload.
 * @param {string} payload
 * @returns {string} hex digest
 */
export function sign(payload) {
  return createHmac('sha256', sessionSecret).update(payload).digest('hex');
}

/**
 * Timing-safe comparison of two hex strings.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') { return false; }
  if (a.length !== b.length) {
    // still compute to avoid timing leak on length
    createHmac('sha256', sessionSecret).update(a).digest();
    return false;
  }
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length !== bb.length) { return false; }
  let diff = 0;
  for (let i = 0; i < ba.length; i++) { diff |= ba[i] ^ bb[i]; }
  return diff === 0;
}
