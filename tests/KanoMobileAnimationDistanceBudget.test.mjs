import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../js/KanoAnimationTrafficUpgrade.js', import.meta.url), 'utf8');
const helperStart = source.indexOf('  mobileAnimationInterval(root, entry) {');
const helperEnd = source.indexOf('\n  update(deltaSeconds) {', helperStart);
const helper = source.slice(helperStart, helperEnd);
const updateStart = helperEnd + 1;
const updateEnd = source.indexOf('\n  dispose() {', updateStart);
const update = source.slice(updateStart, updateEnd);

test('nearby mobile characters keep full-rate animation', () => {
  assert.match(helper, /distanceSquared < 256\s*\?\s*0/);
});

test('distant mobile characters use lower animation cadence without slowing animation time', () => {
  assert.match(helper, /distanceSquared < 1024\s*\?\s*1 \/ 30/);
  assert.match(helper, /distanceSquared < 2704\s*\?\s*1 \/ 20\s*:\s*1 \/ 12/);
  assert.match(update, /entry\.mixer\.update\(entry\.pendingElapsed\)/);
});

test('camera-distance decisions are cached for 120 ms and reuse one Vector3', () => {
  assert.match(source, /MOBILE_ANIMATION_DISTANCE_CHECK_INTERVAL = 0\.12/);
  assert.match(source, /this\._mobileAnimationWorldPosition = new THREE\.Vector3\(\)/);
  assert.match(helper, /root\.getWorldPosition\(this\._mobileAnimationWorldPosition\)/);
  assert.match(helper, /entry\.nextDistanceCheckAt = this\.elapsed \+ MOBILE_ANIMATION_DISTANCE_CHECK_INTERVAL/);
});

test('desktop behavior bypasses mobile distance throttling', () => {
  assert.match(helper, /if \(!this\.mobile\) return 0/);
  assert.match(update, /if \(!this\.mobile\) \{\s*entry\.mixer\.update\(dt\)/);
});

test('procedural idle fallback characters also use distance-aware mobile cadence', () => {
  assert.match(update, /const animationInterval = this\.mobileAnimationInterval\(root, fallback\)/);
  assert.match(update, /fallback\.lastUpdateElapsed = this\.elapsed/);
});
