import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'js/renderer3d.js'), 'utf8');
const detectorStart = source.indexOf('  hasPlausibleNativeDriver(object, vehicleBounds = {})');
const detectorEnd = source.indexOf('  attachFallbackDriverToKeke(object, old, visualCheck)', detectorStart);
const detector = source.slice(detectorStart, detectorEnd);
const applyStart = source.indexOf('  async applyModel(key, object)');
const applyEnd = source.indexOf('  applyPlayerPaint(', applyStart);
const applyModel = source.slice(applyStart, applyEnd);

test('native-driver detection runs before attaching a procedural duplicate', () => {
  assert.ok(detectorStart >= 0 && detectorEnd > detectorStart);
  assert.ok(applyModel.indexOf('this.hasPlausibleNativeDriver(') >= 0);
  assert.ok(applyModel.indexOf('this.hasPlausibleNativeDriver(') < applyModel.indexOf('this.attachFallbackDriverToKeke(object, old, visualCheck)'));
});

test('a native driver must have a role-bearing name, visible meshes and renderable materials', () => {
  assert.match(detector, /driver\|rider\|chauffeur\|human\|person/);
  assert.match(detector, /helperName\.test\(namedNode\.name\)/);
  assert.match(detector, /node\?\.isMesh/);
  assert.match(detector, /ancestor\.visible === false/);
  assert.match(detector, /material\.visible !== false/);
  assert.match(detector, /Number\(material\.opacity \?\? 1\) > 0\.025/);
});

test('seat helpers, invisible objects and collapsed meshes cannot suppress the fallback', () => {
  assert.match(detector, /seat\|saddle\|cockpit\|handle\|wheel\|rig\|skeleton/);
  assert.match(detector, /candidateBounds\.isEmpty\(\)/);
  assert.match(detector, /size\.y >= 0\.58/);
  assert.match(detector, /size\.x >= 0\.12/);
  assert.match(detector, /size\.z >= 0\.08/);
});

test('candidate bounds are checked in vehicle-root coordinates', () => {
  assert.match(detector, /inverseRoot,\s*node\.matrixWorld/);
  assert.match(detector, /vehicleBounds\.width/);
  assert.match(detector, /vehicleBounds\.height/);
  assert.match(detector, /vehicleBounds\.depth/);
});

test('detected native driver is tagged and kept instead of adding another person', () => {
  assert.match(detector, /kanoNativeDriverVisual = result/);
  assert.match(applyModel, /if \(nativeDriver\)/);
  assert.match(applyModel, /Existing GLB driver preserved/);
  const nativeBranch = applyModel.indexOf('if (nativeDriver)');
  const fallbackCall = applyModel.indexOf('this.attachFallbackDriverToKeke(object, old, visualCheck)', nativeBranch);
  assert.ok(nativeBranch >= 0 && fallbackCall > nativeBranch);
});

test('fallback remains active when no plausible native driver is present', () => {
  assert.match(applyModel, /else \{\s*this\.attachFallbackDriverToKeke\(object, old, visualCheck\);/);
  assert.match(source, /this\.validateKekeModelCandidate\(object\)/);
});
