// @ts-check
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const seed = JSON.parse(readFileSync(join(root, 'data/seed.json'), 'utf8'));
const imgDir = join(root, 'public/img/equipment');
const placeholderPath = join(root, 'public/img/placeholder.svg');
const creditsPath = join(root, 'public/img/CREDITS.md');

describe('Equipment Photos & Assets', () => {
  let server;
  let baseUrl;

  before(async () => {
    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve(null);
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('placeholder.svg exists and is valid svg', () => {
    assert.strictEqual(existsSync(placeholderPath), true);
    const content = readFileSync(placeholderPath, 'utf8');
    assert.ok(content.includes('<svg') && content.includes('</svg>'));
  });

  it('every seed item has valid image metadata', () => {
    for (const item of seed) {
      assert.ok(item.image, `Item ${item.id} is missing image field`);
      assert.ok(item.image.src, `Item ${item.id} missing image.src`);
      assert.ok(item.image.alt, `Item ${item.id} missing image.alt`);
      assert.notStrictEqual(item.image.alt.trim(), item.name.trim(), `Item ${item.id} alt text must not just be the name`);
      assert.ok(item.image.credit, `Item ${item.id} missing image.credit`);
      assert.ok(item.image.licence, `Item ${item.id} missing image.licence`);
    }
  });

  it('every image file exists on disk and is under 60 KB', () => {
    for (const item of seed) {
      const filename = `${item.id}.svg`;
      const filePath = join(imgDir, filename);
      assert.ok(existsSync(filePath), `Image file missing: ${filePath}`);
      const stats = statSync(filePath);
      const sizeKb = stats.size / 1024;
      assert.ok(sizeKb <= 60, `Image ${filename} exceeds 60 KB (${sizeKb.toFixed(1)} KB)`);
    }
  });

  it('total equipment image directory size is under 2.5 MB', () => {
    const files = readdirSync(imgDir);
    let totalBytes = 0;
    for (const file of files) {
      totalBytes += statSync(join(imgDir, file)).size;
    }
    const totalMb = totalBytes / (1024 * 1024);
    assert.ok(totalMb <= 2.5, `Total images size exceeds 2.5 MB (${totalMb.toFixed(2)} MB)`);
  });

  it('CREDITS.md lists all items with licence and credit', () => {
    assert.ok(existsSync(creditsPath));
    const credits = readFileSync(creditsPath, 'utf8');
    for (const item of seed) {
      assert.ok(credits.includes(item.id), `CREDITS.md missing entry for ${item.id}`);
      assert.ok(credits.includes('CC0'), `CREDITS.md missing CC0 licence note for ${item.id}`);
    }
  });

  it('/img/equipment files respond 200 with correct content-type and immutable cache header', async () => {
    const firstItem = seed[0];
    const res = await fetch(`${baseUrl}/img/equipment/${firstItem.id}.svg`);
    assert.strictEqual(res.status, 200);
    const contentType = res.headers.get('content-type') || '';
    assert.ok(contentType.includes('image/svg+xml') || contentType.includes('svg'));
    const cacheControl = res.headers.get('cache-control') || '';
    assert.ok(cacheControl.includes('immutable'), `Cache-Control header missing immutable: ${cacheControl}`);
  });

  it('working tree size excluding node_modules, .git, and public/vendor is under 8 MB', () => {
    function getDirSize(dir) {
      let size = 0;
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'vendor') {
          continue;
        }
        if (entry.isDirectory()) {
          size += getDirSize(full);
        } else {
          size += statSync(full).size;
        }
      }
      return size;
    }
    const totalBytes = getDirSize(root);
    const totalMb = totalBytes / (1024 * 1024);
    assert.ok(totalMb < 8, `Working tree size (${totalMb.toFixed(2)} MB) exceeds 8 MB`);
  });
});
