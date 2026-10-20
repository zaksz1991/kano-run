import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const readRaw = (relative) => readFileSync(resolve(root, relative), 'utf8');
// Source is compared in a formatting-insensitive form so line wrapping, indentation and
// trailing commas (e.g. from Prettier) do not break checks of what the code actually does.
const normalise = (text) => text
  .replace(/\s+/g, ' ')
  .replace(/([\[({]) /g, '$1')
  .replace(/ ([\])}])/g, '$1')
  .replace(/,([\])}])/g, '$1');
const read = (relative) => normalise(readRaw(relative));

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
  const optional = new Set(['reverse-label']);
  assert.deepEqual([...uiIds].filter((id) => !htmlIds.has(id) && !optional.has(id)), []);
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
  assert.match(read('js/renderer3d.js'), /loadOptionalTexture\('\/assets\/(models\/)?environment\/ground\/asphalt\.jpg'/);
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
  assert.match(renderer, /function disposeSceneTree\(root, \{disposeTextures = false\} = \{\}\)/);
  assert.match(renderer, /inheritedSharedGeometry \|\| object\.userData\?\.sharedGeometry === true/);
  assert.match(renderer, /if \(object\.geometry && !sharedGeometry/);
  assert.match(renderer, /if \(disposeTextures && !sharedGeometry\)/);
  assert.match(renderer, /disposeSceneTree\(actor\)/);
  assert.match(renderer, /disposeSceneTree\(this\.scene, \{disposeTextures: true\}\)/);
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
  for (const content of ['06:05 AM', '06:27 AM', 'Akara and pap', 'AKARA + PAP · ₦450', 'MASA + TEA · ₦400', 'BREAD + TEA · ₦300', 'GREET MALLAM SECURITY', 'INSPECT KEKE · UNLOCK · START SHIFT']) {
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
  assert.match(game, /const ROAD_DEPTH_SCALE = 316\.8/);
  assert.match(game, /this\.mode === 'timeAttack' \? 150 : this\.mode === 'freeRoam' \? 36 : 38/);
  assert.match(game, /const desiredSpeed = s\.gas && s\.fuel > 0 \? maxSpeed : 0/);
  assert.match(game, /const closingSpeed = s\.signedSpeed - trafficSignedSpeed/);
  assert.match(renderer, /const scroll = signedSpeed \* dt \* 0\.28/);
  assert.match(renderer, /this\.camera\.lookAt\(targetX, driverView \? 1\.2 : 0\.72/);
  assert.match(renderer, /zone\.side \|\| \(zone\.lane === 0 \? -1 : 1\)\) \* 6\.7/);
});


test('life routine now includes home chores, street, breakfast choices, school junction and guarded park scenes', () => {
  const ui = read('js/ui.js');
  const renderer3d = read('js/renderer3d.js');
  const renderer2d = read('js/renderer2d.js');
  for (const scene of ['bedroom', 'household', 'street', 'breakfast', 'walk', 'school', 'garage']) {
    assert.ok(ui.includes(`scene: '${scene}'`), `missing morning scene ${scene}`);
    assert.ok(renderer3d.includes(`'${scene}'`), `3D renderer missing ${scene}`);
    assert.ok(renderer2d.includes(`'${scene}'`), `2D renderer missing ${scene}`);
  }
  assert.match(ui, /detail: \{scene: data\.scene\}/);
  assert.match(renderer3d, /environment\/ground\/market-stall\.jpg/);
  assert.match(renderer3d, /scene model \$\{slot\.key\} installed in \$\{slot\.sceneName\}/);
});

test('vehicles face with the road flow and 2D perspective lane centers remain inside the road', () => {
  const renderer3d = read('js/renderer3d.js');
  const renderer2d = read('js/renderer2d.js');
  assert.match(renderer3d, /actor\.rotation\.y = vehicle\.direction === -1 \? Math\.PI : 0/);
  assert.match(renderer3d, /this\.driveFacingY = 0/);
  assert.match(renderer2d, /\(vehicle\.lane - 1\) \* \(2 \/ 3\) \* halfAt/);
  assert.match(renderer2d, /export function projectRoadDepth\(depth\)/);
  assert.match(renderer2d, /0\.59 - \(value - 0\.045\) \* 0\.45/);
});


test('collision plane is tight enough to match visible vehicle contact and ordinary stops are forgiving', () => {
  const game = read('js/game.js');
  const renderer2d = read('js/renderer2d.js');
  assert.match(game, /const impactDepth = 0\.022/);
  assert.match(game, /vehicle\.depth <= 0\.035 && vehicle\.depth >= 0\.012/);
  assert.match(game, /zone\.hub \? 6\.5 : 12/);
  assert.match(game, /const largePassenger = Boolean\(zone\.hub\)/);
  assert.match(game, /const requestedSeats = zone\.hub \? special \|\| largePassenger \? 2 : clamp\(zone\.seats \|\| 2, 2, 4\) : 1/);
  assert.match(renderer2d, /projectRoadDepth\(depth\)/);
});

test('heavy procedural traffic has distinct left and right side windows', () => {
  const renderer = read('js/renderer3d.js');
  assert.match(renderer, /rightSideWindow\.position\.set\(bodyWidth \* 0\.48/);
  assert.match(renderer, /leftSideWindow\.position\.set\(-bodyWidth \* 0\.48/);
});
