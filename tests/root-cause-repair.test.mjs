import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = fs.readFileSync(path.join(root, 'js/KanoLifeRootCauseRepair.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('startup loads root-cause patch before the existing GLB pipeline', () => {
  const repairAt = html.indexOf('/js/KanoLifeRootCauseRepair.js');
  const visualAt = html.indexOf('/js/KanoModelAssetVisualUpgrade.js');
  assert.ok(repairAt >= 0 && visualAt > repairAt);
});

test('keke fitting records whole-model bounds and preserves the calibrated asset orientation', () => {
  assert.match(source, /function fitKekeTemplate\(template\)/);
  assert.match(source, /const before = getModelBounds\(template\)/);
  assert.match(source, /const after = getModelBounds\(template\)/);
  assert.match(source, /boundsBefore/);
  assert.match(source, /boundsAfter/);
  assert.match(source, /automaticAxisRotation: false/);
  assert.match(source, /internalChildTransformChanged: false/);
  assert.match(source, /orientationPolicy: 'preserve-ModelManager-normalization; apply only exact-path calibration'/);
  assert.match(source, /template\.rotation\.y = THREE\.MathUtils\.degToRad\(calibration\.yawDeg\)/);
});

test('mobile shadow optimization excludes the player keke', () => {
  assert.match(source, /isMobile\(\) && instance\?\.isObject3D && key !== 'keke'/);
  assert.match(source, /node\.castShadow = false/);
  assert.match(source, /node\.receiveShadow = false/);
});

test('animated-root discovery cache keeps the original update path', () => {
  assert.match(source, /collectAnimatedRoots/);
  assert.match(source, /now - this\.__kanoAnimatedRootCacheAt < 180/);
  assert.match(source, /const result = original\.apply\(this, args\)/);
});

test('passenger and life actor models use existing ModelManager categories', () => {
  assert.match(source, /requestCharacterAttach/);
  assert.match(source, /passengerWoman/);
  assert.match(source, /pedestrian/);
  assert.match(source, /startPassengerWalk/);
  assert.match(source, /lifeRigs/);
});

test('water seller keeps the existing class logic and upgrades only its visible actor', () => {
  assert.match(source, /PureWaterHawker\.prototype, 'update'/);
  assert.match(source, /installHawkerModel/);
  assert.match(source, /hawker\.root/);
  assert.match(source, /__kanoImportedVendorActor/);
});

test('onboard game passengers are represented by real seated GLB instances when available', () => {
  assert.match(source, /syncSeatedPassengerModels/);
  assert.match(source, /kanoRootCauseSeatedPassengerGroup/);
  assert.match(source, /activeBoardings/);
  assert.match(source, /activeAlightings/);
  assert.match(source, /kanoRootCauseSeatedPassengerGroup/);
});

test('goat replacement requires a discovered real asset and reports failure', () => {
  assert.match(source, /model-catalog-audit\.generated\.json/);
  assert.match(source, /No goat-named existing GLB was identified/);
  assert.match(source, /loaded-existing-goat-glb/);
});

test('vehicle wear excludes visible passenger and seller materials', () => {
  assert.match(source, /KanoLifeSeatedPassenger\|KanoImportedPassenger/);
  assert.match(source, /kanoRootCauseSeatedPassengerGroup/);
});

test('collision wrappers call original methods and queue visual-only impacts', () => {
  assert.match(source, /\['hit', 'traffic'\]/);
  assert.match(source, /\['hitPothole', 'pothole'\]/);
  assert.match(source, /const result = original\.apply\(this, args\)/);
  assert.match(source, /__KANO_LIFE_IMPACT_QUEUE__/);
  assert.doesNotMatch(source, /this\.s\.condition\s*=/);
});

test('conditional audit panel and JSON download are available', () => {
  assert.match(source, /rootCauseAudit/);
  assert.match(source, /downloadKanoLifeRootCauseAudit/);
  assert.match(source, /DOWNLOAD JSON/);
});
