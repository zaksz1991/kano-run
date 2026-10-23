import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(path.join(root, 'index.html'), 'utf8');
const shim = await readFile(path.join(root, 'js', 'KanoNativeCssImportShim.js'), 'utf8');

function getImportMap(source) {
  const match = source.match(/<script type="importmap">\s*(\{[\s\S]*?\})\s*<\/script>/i);
  assert.ok(match, 'index.html must contain a valid import map script');
  return JSON.parse(match[1]);
}

test('keeps Three.js browser import map', () => {
  const map = getImportMap(html);
  assert.equal(map.imports.three, 'https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js');
  assert.equal(map.imports['three/addons/'], 'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/');
});

test('remaps the native-browser CSS side-effect import to JavaScript', () => {
  const map = getImportMap(html);
  assert.equal(map.imports['/css/kano-responsive-upgrade.css'], '/js/KanoNativeCssImportShim.js');
  const resolvedSourcePath = new URL('../css/kano-responsive-upgrade.css', 'https://kano-run.vercel.app/js/main.js').pathname;
  assert.equal(resolvedSourcePath, '/css/kano-responsive-upgrade.css');
  assert.match(shim, /kano-responsive-upgrade\.css/);
  assert.match(shim, /document\.createElement\('link'\)/);
});

test('loads the responsive stylesheet normally and preserves core UI entrypoints', () => {
  assert.match(html, /<link rel="stylesheet" href="\/css\/kano-responsive-upgrade\.css"\s*\/>/);
  for (const id of ['start-btn', 'route-select', 'driver-select', 'mode-select', 'kano-life-career-screen']) {
    assert.ok(html.includes(`id="${id}"`), `missing existing UI id: ${id}`);
  }
  assert.match(html, /<script type="module" src="\/js\/main\.js"><\/script>/);
  assert.match(html, /<script type="module" src="\/js\/KanoModelAssetVisualUpgrade\.js"><\/script>/);
});
