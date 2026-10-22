import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const LOADER_CALLS = [
  'js/KanoAnimationTrafficUpgrade.js',
  'js/KanoCulturalStreetEventsUpgrade.js',
  'js/KanoGameplayPresentationRepair.js',
  'js/KanoLifeRootCauseRepair.js',
  'js/ModelManager.js',
  'js/glb-model-review.js',
];

test('shared GLTF loader registers the Three.js Meshopt decoder', () => {
  const factory = read('js/createGLTFLoader.js');
  assert.match(factory, /three\/addons\/loaders\/GLTFLoader\.js/);
  assert.match(factory, /three\/addons\/libs\/meshopt_decoder\.module\.js/);
  assert.match(factory, /loader\.setMeshoptDecoder\(MeshoptDecoder\)/);
});

test('all source GLTF loaders use the Meshopt-enabled factory', () => {
  for (const file of LOADER_CALLS) {
    const source = read(file);
    assert.match(source, /createGLTFLoader/ , `${file} must import/use the shared loader`);
    assert.doesNotMatch(source, /new GLTFLoader\s*\(/, `${file} bypasses the shared factory`);
  }
});

test('Vite HTML links the installed web manifest and Apple touch icon', () => {
  const html = read('index.html');
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png"/);
});

test('application startup registers the existing service worker', () => {
  const main = read('js/main.js');
  const worker = read('js/registerServiceWorker.js');
  assert.match(main, /import \{ registerServiceWorker \} from '\.\/registerServiceWorker\.js'/);
  assert.match(main, /registerServiceWorker\(\)/);
  assert.match(worker, /navigator\.serviceWorker\.register\('\/sw\.js'\)/);
});

test('hashed JS/CSS bundles get immutable headers without making model URLs immutable', () => {
  const config = JSON.parse(read('vercel.json'));
  const hashed = config.headers.find((item) => item.source.includes('filename'));
  assert.ok(hashed, 'hashed asset route missing');
  assert.match(hashed.source, /\[A-Za-z0-9_-\]\{8,\}/);
  assert.equal(hashed.headers[0].value, 'public, max-age=31536000, immutable');
  const models = config.headers.find((item) => item.source === '/assets/models/(.*)');
  assert.ok(models, 'model cache rule must remain');
  assert.doesNotMatch(models.headers[0].value, /immutable/);
});

test('optional ground textures resolve to their actual public folder', () => {
  for (const file of ['js/KanoAtmosphere.js', 'js/renderer3d.js']) {
    const source = read(file);
    assert.match(source, /\/assets\/models\/environment\/ground\/asphalt\.jpg/);
    assert.match(source, /\/assets\/models\/environment\/ground\/market-stall\.jpg/);
    assert.doesNotMatch(source, /\/assets\/environment\/ground\/(?:asphalt\.jpg|market-stall\.jpg)/);
  }
});

test('service worker remains network-safe for APIs/audio and stale-revalidates models', () => {
  const sw = read('public/sw.js');
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(sw, /url\.pathname\.startsWith\('\/assets\/models\/audio\/'\)/);
  assert.match(sw, /staleWhileRevalidate\(request, MODELS/);
  assert.match(sw, /HASHED\.test\(url\.pathname\)/);
});
