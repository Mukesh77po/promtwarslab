/**
 * src/app.js
 * Express application factory (testable: does not listen).
 */

import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

import { attachUser, requestLogger, errorHandler } from './middleware/index.js';
import { IS_PRODUCTION, API_RATE_LIMIT_WINDOW_MS, API_RATE_LIMIT_MAX, GEMINI_RATE_LIMIT_MAX, DEMO_MODE } from './config.js';

import authRouter      from './routes/auth.js';
import itemsRouter     from './routes/items.js';
import projectsRouter  from './routes/projects.js';
import bookingsRouter  from './routes/bookings.js';
import schedulerRouter from './routes/scheduler.js';
import analyticsRouter from './routes/analytics.js';
import notifRouter     from './routes/notifications.js';
import adminRouter     from './routes/admin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Create and configure the Express application.
 * @returns {import('express').Application}
 */
export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  // ── Security headers ─────────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:    ["'self'"],
        scriptSrc:     ["'self'"],
        styleSrc:      ["'self'"],
        imgSrc:        ["'self'", 'data:'],
        fontSrc:       ["'self'"],
        objectSrc:     ["'none'"],
        frameAncestors:["'none'"],
        baseUri:       ["'self'"],
        formAction:    ["'self'"],
        connectSrc:    ["'self'"],
        workerSrc:     ["'none'"],
        manifestSrc:   ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false, // needed for three.js
  }));

  // ── Compression ──────────────────────────────────────────────────────────
  app.use(compression());

  // ── Body parsing (100 kb limit) ──────────────────────────────────────────
  app.use(express.json({ limit: '100kb' }));

  // ── Structured logging ───────────────────────────────────────────────────
  if (!process.env.DISABLE_REQUEST_LOG) {
    app.use(requestLogger);
  }

  // ── API rate limiting ────────────────────────────────────────────────────
  const apiLimiter = rateLimit({
    windowMs: API_RATE_LIMIT_WINDOW_MS,
    max: API_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });

  const geminiLimiter = rateLimit({
    windowMs: API_RATE_LIMIT_WINDOW_MS,
    max: GEMINI_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'AI request rate limit exceeded.' },
  });

  app.use('/api', apiLimiter);
  app.use('/api/bookings/:id/readiness', geminiLimiter);
  app.use('/api/scheduler/demo', geminiLimiter);

  // ── Auth middleware (attach user to all requests) ────────────────────────
  app.use(attachUser);

  // ── Health check ─────────────────────────────────────────────────────────
  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', demo: DEMO_MODE, ts: new Date().toISOString() });
  });

  // ── API routes ───────────────────────────────────────────────────────────
  app.use('/api/auth',         authRouter);
  app.use('/api/items',        itemsRouter);
  app.use('/api/projects',     projectsRouter);
  app.use('/api/bookings',     bookingsRouter);
  app.use('/api/scheduler',    schedulerRouter);
  app.use('/api/analytics',    analyticsRouter);
  app.use('/api/notifications', notifRouter);
  app.use('/api/admin',        adminRouter);

  // ── Static files (long cache for assets, no-cache for HTML) ─────────────
  const publicDir = join(__dirname, '../public');
  // Serve vendored three.js – committed copy works on Vercel (no node_modules access)
  // Falls back to node_modules for local dev if the copy doesn't exist.
  const threeVendorDir = join(__dirname, '../public/vendor/three');
  const threeNodeDir   = join(__dirname, '../node_modules/three/build');
  app.use('/vendor/three', express.static(
    existsSync(threeVendorDir) ? threeVendorDir : threeNodeDir,
    { maxAge: IS_PRODUCTION ? '30d' : 0 }
  ));
  app.use(express.static(publicDir, {
    etag: true,
    maxAge: IS_PRODUCTION ? '1h' : 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (filePath.includes('img') || filePath.match(/\.(webp|png|jpg|jpeg|svg)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
      } else if (filePath.match(/\.(js|css|ico|woff2)$/)) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));

  // ── SPA fallback ─────────────────────────────────────────────────────────
  // Express 5: use explicit path pattern
  app.get('/{*path}', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    const indexPath = join(publicDir, 'index.html');
    if (existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });

  // ── Error handler ────────────────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}
