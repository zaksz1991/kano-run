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
  assert.match(renderer, /lowerShell\.userData\.paintable = true/);
  assert.match(renderer, /frontNose\.userData\.paintable = true/);
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
  assert.match(renderer, /wheelSpots = \[\[0, -0\.91\], \[-0\.63, 0\.62\], \[0\.63, 0\.62\]\]/);
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


test('asset catalog points to real, case-sensitive Kano Run GLB filenames', () => {
  const manager = read('js/ModelManager.js');
  for (const path of [
    'vehicles/keke/keke-3.glb',
    'vehicles/keke/keke-8.glb',
    'vehicles/cars/quaternius_cc0-normal-car-1190.glb',
    'vehicles/cars/quaternius_cc0-suv-1402.glb',
    'vehicles/special/karota.glb',
    'characters/passengers/hijab_muslim_woman.glb',
    'characters/pedestrians/muslim_girl.glb',
    'world/buildings-suburban/building-type-d.glb',
    'world/buildings-industrial/building-a.glb',
    'world/roads/kano_urban_flyover.glb',
    'world/roads/light-square.glb',
    'environment/ground/photoscan_-_pothole_1.glb',
    'world/props/Traffic-Light.glb',
    'world/props/Stop-sign.glb',
  ]) assert.ok(manager.includes(path), `missing real asset mapping: ${path}`);
  assert.match(manager, /encodeURIComponent\(segment\)/);
  assert.match(manager, /busStop: \[\]/, 'do not stretch a road mesh into a fake bus-stop model');
});

test('mobile progressively preloads real traffic, pedestrian, building and flyover models', () => {
  const main = read('js/main.js');
  assert.match(main, /essentialLoad\.then\(async \(\) =>/);
  assert.match(main, /const mobileAssetBatches = \[\s*\['flyover', 'building'/);
  for (const key of ['karota', 'ambulance', 'truck', 'bus', 'passengerWoman', 'passengerMan', 'passengerVIP', 'security', 'pedestrian', 'pedestrianWoman', 'building', 'industrialBuilding', 'flyover', 'roadlight', 'trafficLight']) {
    assert.match(main, new RegExp(`'${key}'`), `mobile deferred model missing: ${key}`);
  }
  const renderer = read('js/renderer3d.js');
  assert.match(renderer, /if \(actor\.userData\.fallback\)[\s\S]*?getInstance\(key\)[\s\S]*?this\.trafficActors\.set\(vehicle\.id, model\)/);
});

test('morning routine contains wake-up, roadside akara and pap, guarded garage and real-keke pickup', () => {
  const html = read('index.html');
  const ui = read('js/ui.js');
  const renderer = read('js/renderer3d.js');
  for (const id of ['life-routine-screen', 'life-scene-art', 'life-actions', 'life-wallet']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  for (const content of ['06:05 AM', '06:22 AM', 'Akara and pap', 'AKARA + PAP · ₦450', 'GREET MALLAM SECURITY', 'UNLOCK KEKE · START SHIFT']) {
    assert.ok(ui.includes(content), `morning stage is missing: ${content}`);
  }
  assert.match(ui, /breakfastEaten = this\.morning\.fed/);
  assert.match(renderer, /this\.garageGroup\.add\(this\.player\)/);
  assert.match(renderer, /this\.scene\.add\(this\.player\)/);
  assert.match(read('css/styles.css'), /garage-focus \.life-scene-art/);
});

test('flyovers repeat along the drive and swap procedural spans for loaded GLBs', () => {
  const renderer = read('js/renderer3d.js');
  assert.match(renderer, /const positions = this\.mobile \? \[-72, -202\] : \[-72, -174, -276\]/);
  assert.match(renderer, /for \(const flyover of this\.flyovers\)/);
  assert.match(renderer, /getInstance\('flyover'\)/);
  assert.match(renderer, /model\.scale\.x \*= horizontalScale/);
  assert.match(renderer, /this\.flyoverLoopDistance/);
});

test('roadside zones pause when the keke stops and traffic scroll matches the calmer speed tuning', () => {
  const game = read('js/game.js');
  const renderer = read('js/renderer3d.js');
  assert.match(game, /const scroll = dt \* \(s\.speed \/ 310\)/);
  assert.match(game, /this\.mode === 'timeAttack' \? 140 : this\.mode === 'freeRoam' \? 62 : 68/);
  assert.match(game, /this\.mode === 'timeAttack' \? 42 : this\.mode === 'freeRoam' \? 30 : 27/);
  assert.match(renderer, /const scroll = state\.speed \* dt \* 0\.28/);
  assert.match(renderer, /this\.camera\.lookAt\(targetX, driverView \? 1\.2 : 0\.65/);
});
