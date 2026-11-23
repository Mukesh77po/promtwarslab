/**
 * api/index.js
 * Vercel serverless entry point.
 * Re-exports the Express app as the default handler.
 */
import { createApp } from '../src/app.js';
import { buildIndex } from '../src/search/index.js';

buildIndex();

export default createApp();
