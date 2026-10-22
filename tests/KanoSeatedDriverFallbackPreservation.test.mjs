import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'js/renderer3d.js'), 'utf8');
const methodStart = source.indexOf('  attachFallbackDriverToKeke(object, old, visualCheck)');
const methodEnd = source.indexOf('  validateKekeModelCandidate(object)', methodStart);
const method = source.slice(methodStart, methodEnd);
const applyStart = source.indexOf('  async applyModel(key, object)');
const applyEnd = source.indexOf('  applyPlayerPaint(', applyStart);
const applyModel = source.slice(applyStart, applyEnd);

test('fallback driver is cloned before the outgoing player is disposed', () => {
  assert.ok(methodStart >= 0 && methodEnd > methodStart);
  assert.ok(applyStart >= 0 && applyEnd > applyStart);
  assert.ok(applyModel.indexOf('this.attachFallbackDriverToKeke(object, old, visualCheck)') < applyModel.indexOf('disposeSceneTree(old)'));
  assert.ok(applyModel.indexOf('this.attachFallbackDriverToKeke(object, old, visualCheck)') < applyModel.indexOf('old.parent.remove(old)'));
});

test('fallback driver clone owns its geometry and materials', () => {
  assert.match(method, /sourcePivot\.clone\(true\)/);
  assert.match(method, /node\.geometry\.clone\(\)/);
  assert.match(method, /material\.clone\(\)/);
  assert.match(method, /object\.add\(driverPivot\)/);
});

test('driver rig and animation-arm references remain available on imported player', () => {
  assert.match(method, /KANO_KEKE_DRIVER_PIVOT/);
  assert.match(method, /driverAnimationParts\s*=\s*\{/);
  assert.match(method, /driverPivot,\s*arms,[\s\S]*?wheels:\s*\[\]/);
  assert.match(method, /kanoFallbackDriverAttached\s*=\s*true/);
});

test('driver seat position is bounded using the accepted keke dimensions', () => {
  assert.match(method, /safeHeight \* 0\.64/);
  assert.match(method, /THREE\.MathUtils\.clamp\(safeHeight \* 0\.64, 0\.96, 1\.22\)/);
  assert.match(method, /Math\.min\(0\.12, safeDepth \* 0\.04\)/);
});

test('existing named driver rigs are detected before trying the procedural fallback', () => {
  const findRig = applyModel.indexOf("object.getObjectByName?.(");
  const attachFallback = applyModel.indexOf('this.attachFallbackDriverToKeke(object, old, visualCheck)');
  assert.ok(findRig >= 0 && attachFallback > findRig);
});
