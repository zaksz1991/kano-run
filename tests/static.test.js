import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (relative) => readFileSync(resolve(root, relative), 'utf8');

test('mobile viewport is valid and declared once', () => {
  const html = read('index.html');
  const viewportTags = html.match(/<meta\s+name=["']viewport["'][^>]*>/gi) || [];
  assert.equal(viewportTags.length, 1);
  assert.match(viewportTags[0], /width=device-width/);
  assert.match(viewportTags[0], /viewport-fit=cover/);
  assert.doesNotMatch(viewportTags[0], /cover\.0|maximum-scale=.*maximum-scale|user-scalable=.*user-scalable/);
});

test('all UI element lookups have matching HTML IDs', () => {
  const html = read('index.html');
  const ui = read('js/ui.js');
  const htmlIds = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]));
  const uiIds = new Set([...ui.matchAll(/this\.el\(["']([^"']+)["']\)/g)].map((match) => match[1]));
  assert.deepEqual([...uiIds].filter((id) => !htmlIds.has(id)), []);
});

test('2D fallback always replaces the active canvas before creating its context', () => {
  const main = read('js/main.js');
  assert.match(main, /function freshCanvas\(/);
  assert.match(main, /function start2D[\s\S]*?const newCanvas = freshCanvas\(\)[\s\S]*?new Renderer2D\(newCanvas\)/);
  assert.match(main, /function start3D[\s\S]*?const activeCanvas = freshCanvas\(\)[\s\S]*?new Renderer3D\(activeCanvas/);
});

test('saved 2D preference is resolved before WebGL startup and force3d overrides it', () => {
  const main = read('js/main.js');
  const boot = main.slice(main.indexOf('function boot()'), main.indexOf('function frame('));
  assert.match(boot, /const saved2D = save\?\.settings\?\.quality === '2d'/);
  const initialSelection = boot.slice(boot.indexOf("if (force2d || (saved2D && !force3d))"));
  assert.ok(initialSelection.indexOf("if (force2d || (saved2D && !force3d))") < initialSelection.indexOf('start3D().catch'));
  assert.match(boot, /kano:quality-change/);
  assert.match(boot, /keep3D = quality === '3d'/);
});

test('GLB loader uses public assets path, guards absurd bounds, grounds models', () => {
  const manager = read('js/ModelManager.js');
  assert.match(manager, /basePath = '\/assets\/models\/'/);
  assert.match(manager, /horizontalSpan > originalSize\.y \* horizontalRatioLimit/);
  assert.match(manager, /const horizontalRatioLimit = key === 'flyover' \? 100/);
  assert.match(manager, /source\.position\.y -= scaledBox\.min\.y/);
  assert.match(manager, /\[ModelManager\] OK \$\{key\}/);
});

test('touch gas and brake buttons capture pointers so controls release outside their bounds', () => {
  const controls = read('js/controls.js');
  assert.match(controls, /button\.setPointerCapture\(event\.pointerId\)/);
  assert.match(controls, /'pointerup', up/);
  assert.match(controls, /'lostpointercapture', up/);
});

test('3D player applies saved paint and has procedural fallbacks for missing GLBs', () => {
  const renderer = read('js/renderer3d.js');
  assert.match(renderer, /applyPlayerPaint\(state\.paint\)/);
  assert.match(renderer, /body\.userData\.paintable = true/);
  assert.match(renderer, /this\.makeKeke\(\)/);
});

test('CI validates syntax, regression tests and production build without requiring a lockfile cache', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /npm run check/);
  assert.match(ci, /npm test/);
  assert.match(ci, /npm run build/);
  assert.doesNotMatch(ci, /cache:\s*npm/);
});


test('procedural player keke uses three wheel positions rather than a four-wheel car layout', () => {
  const renderer = read('js/renderer3d.js');
  assert.match(renderer, /wheelSpots = \[\[0, -0\.73\], \[-0\.56, 0\.62\], \[0\.56, 0\.62\]\]/);
  assert.match(renderer, /Adaidaita Sahu geometry/);
});

test('HUD includes passenger manifest, level, combo, heat and driving status', () => {
  const html = read('index.html');
  for (const id of ['passenger-list', 'level-label', 'combo-label', 'heat-label', 'status-label']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing HUD field ${id}`);
  }
});


test('desktop model catalog includes buildings, flyover, roadlights and bad-road props', () => {
  const manager = read('js/ModelManager.js');
  const main = read('js/main.js');
  for (const key of ['building:', 'industrialBuilding:', 'flyover:', 'roadlight:', 'cone:', 'dirtmound:', 'bench:', 'busStop:', 'trafficLight:', 'stopSign:', 'marketStall:']) {
    assert.ok(manager.includes(key), `missing model catalog ${key}`);
  }
  assert.match(main, /'building', 'industrialBuilding', 'flyover', 'roadlight', 'cone', 'dirtmound',[\s\S]*?'bench', 'busStop', 'trafficLight', 'stopSign', 'marketStall'/);
  assert.match(read('js/renderer3d.js'), /loadOptionalTexture\('\/assets\/environment\/ground\/asphalt\.jpg'/);
  assert.match(read('js/renderer3d.js'), /upgradeWorldAssets\(\)/);
});


test('save repair validates persisted selections and never trusts arbitrary localStorage values', () => {
  const storage = read('js/storage.js');
  assert.match(storage, /export function normaliseSave\(/);
  assert.match(storage, /validRouteIds/);
  assert.match(storage, /validDriverIds/);
  assert.match(storage, /\['auto', '2d', '3d'\]/);
  assert.match(storage, /\['hausa', 'yoruba', 'igbo'\]/);
});

test('3D actor cleanup releases transient resources without destroying cached GLB geometry or textures', () => {
  const manager = read('js/ModelManager.js');
  const renderer = read('js/renderer3d.js');
  assert.match(manager, /clone\.userData\.sharedGeometry = true/);
  assert.match(renderer, /function disposeSceneTree\(root, \{ disposeTextures = false \} = \{\}\)/);
  assert.match(renderer, /inheritedSharedGeometry \|\| object\.userData\?\.sharedGeometry === true/);
  assert.match(renderer, /if \(object\.geometry && !sharedGeometry/);
  assert.match(renderer, /if \(disposeTextures && !sharedGeometry\)/);
  assert.match(renderer, /disposeSceneTree\(actor\)/);
  assert.match(renderer, /disposeSceneTree\(this\.scene, \{ disposeTextures: true \}\)/);
  assert.match(renderer, /this\.models\?\.dispose\?\.\(\)/);
  assert.match(manager, /function disposeModelResources\(roots\)/);
  assert.match(manager, /if \(this\.disposed\) \{[\s\S]*?disposeModelResources\(\[gltf\.scene\]\)/);
  assert.match(manager, /dispose\(\) \{[\s\S]*?disposeModelResources\(\[\.\.\.this\.cache\.values\(\)\]\)/);
});
