import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, '../node_modules/three/build');
const dest = path.join(__dirname, '../public/vendor/three');

try {
  if (fs.existsSync(src)) {
    fs.mkdirSync(dest, { recursive: true });
    fs.cpSync(src, dest, { recursive: true });
    console.log('three.js vendored to public/vendor/three');
  } else {
    console.log('node_modules/three/build not found (vendored copy in public/vendor/three will be used)');
  }
} catch (err) {
  console.warn('Warning during vendor build:', err.message);
}
