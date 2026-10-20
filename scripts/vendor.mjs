// Copies MapLibre from node_modules into public/vendor/ so the site serves it
// itself (same origin: faster, and no CDN to depend on).
// Run after changing the maplibre-gl version in package.json: npm install && npm run vendor
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(root, 'node_modules', 'maplibre-gl');
const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const name = `maplibre-gl-${version}`;
const vendor = join(root, 'public', 'vendor');

// Drop older copies; the folder name carries the version, so browsers can cache it forever.
mkdirSync(vendor, { recursive: true });
for (const old of readdirSync(vendor)) {
  if (old.startsWith('maplibre-gl-') && old !== name) rmSync(join(vendor, old), { recursive: true });
}

const dest = join(vendor, name);
mkdirSync(dest, { recursive: true });
for (const file of ['maplibre-gl.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs', 'maplibre-gl.css']) {
  cpSync(join(pkgDir, 'dist', file), join(dest, file));
}
cpSync(join(pkgDir, 'LICENSE.txt'), join(dest, 'LICENSE.txt'));

// Point the page at the new folder.
for (const file of ['index.html', 'app.js']) {
  const path = join(root, 'public', file);
  const text = readFileSync(path, 'utf8');
  writeFileSync(path, text.replace(/\/vendor\/maplibre-gl-[\d.]+\//g, `/vendor/${name}/`));
}

console.log(`MapLibre ${version} copied to public/vendor/${name}/`);
