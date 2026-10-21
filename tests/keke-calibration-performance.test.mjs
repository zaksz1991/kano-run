import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(here, '../js/KanoLifeRootCauseRepair.js'), 'utf8');
const fitStart = source.indexOf('function fitKekeTemplate(template)');
const fitEnd = source.indexOf('if (ModelManager?.prototype)', fitStart);
const fitBlock = source.slice(fitStart, fitEnd);

test('keke fitting no longer guesses yaw from width/depth', () => {
  assert.ok(fitStart >= 0 && fitEnd > fitStart);
  assert.doesNotMatch(fitBlock, /before\.width\s*>\s*before\.depth/);
  assert.doesNotMatch(fitBlock, /source\.rotation\.y\s*\+=/);
  assert.doesNotMatch(fitBlock, /source\.position\.[xyz]\s*[-+]=/);
  assert.match(fitBlock, /internalChildTransformChanged:\s*false/);
  assert.match(fitBlock, /orientationPolicy:/);
});

test('manual calibration is keyed by exact model path and bounded', () => {
  assert.match(source, /kano-life-keke-model-calibration-v1/);
  assert.match(source, /function cleanKekeCalibration/);
  assert.match(source, /yawDeg: number\(input\.yawDeg, 0, -180, 180\)/);
  assert.match(source, /offsetX: number\(input\.offsetX, 0, -2, 2\)/);
  assert.match(source, /scale: number\(input\.scale, 1, 0\.5, 1\.5\)/);
  assert.match(source, /store\.models\[path\]/);
});

test('calibration applies to the imported root, not just a body child', () => {
  assert.match(fitBlock, /template\.rotation\.y = THREE\.MathUtils\.degToRad\(calibration\.yawDeg\)/);
  assert.match(fitBlock, /template\.position\.set\(calibration\.offsetX, calibration\.offsetY, calibration\.offsetZ\)/);
  assert.match(fitBlock, /template\.scale\.setScalar\(calibration\.scale\)/);
  assert.doesNotMatch(fitBlock, /const source = template\.children/);
});

test('audit exposes exact-path calibration only in opt-in audit mode', () => {
  assert.match(source, /params\.get\('rootCauseAudit'\) !== '1' && params\.get\('assetAudit'\) !== '1'/);
  assert.match(source, /KEKE FIT · EXACT MODEL PATH/);
  assert.match(source, /SAVE CALIBRATION & RELOAD/);
  assert.match(source, /RESET THIS MODEL/);
  assert.match(source, /window\.kanoSaveKekeModelCalibration/);
});

test('goat scene scan is cached while animation mixers still update', () => {
  assert.match(source, /const goatActorScanCache = new WeakMap\(\)/);
  assert.match(source, /const scanInterval = isMobile\(\) \? 300 : 180/);
  assert.match(source, /goatSceneScanCacheHits/);
  assert.match(source, /goatSceneScans/);
  assert.match(source, /mixer\.update\(clamp\(dt, 0, 0\.05\)\)/);
});

test('existing passenger, hawker, goat and collision hooks remain in the module', () => {
  assert.match(source, /syncSeatedPassengerModels/);
  assert.match(source, /installHawkerModel/);
  assert.match(source, /loadGoatTemplate/);
  assert.match(source, /\['hit', 'traffic'\]/);
  assert.match(source, /\['hitPothole', 'pothole'\]/);
});
