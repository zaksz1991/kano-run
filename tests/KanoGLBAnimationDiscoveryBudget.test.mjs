import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../js/KanoAnimationTrafficUpgrade.js', import.meta.url), 'utf8');
const updateStart = source.indexOf('  update(deltaSeconds) {', source.indexOf('export class KanoGLBAnimationManager'));
const updateEnd = source.indexOf('\n  dispose() {', updateStart);
const update = source.slice(updateStart, updateEnd);

test('mobile GLB root discovery is throttled to a 120 ms inventory interval', () => {
  assert.match(source, /MOBILE_ANIMATION_ROOT_DISCOVERY_INTERVAL = 0\.12/);
  assert.match(update, /!this\.mobile\s*\|\|\s*!this\.cachedActiveRoots\s*\|\|\s*this\.elapsed - this\.lastRootDiscoveryElapsed >= MOBILE_ANIMATION_ROOT_DISCOVERY_INTERVAL/);
  assert.match(update, /activeRoots = this\.collectAnimatedRoots\(\)/);
  assert.match(update, /activeRoots = this\.cachedActiveRoots/);
});

test('desktop retains per-frame animation-root discovery', () => {
  assert.match(update, /const shouldDiscoverRoots = !this\.mobile/);
});

test('animation mixers still update on every manager update for visible active roots', () => {
  assert.match(update, /if \(visible\) entry\.mixer\.update\(dt\)/);
});

test('detached animation roots are still uncached and removed', () => {
  assert.match(update, /!this\.lastActiveRoots\.has\(root\) \|\| !root\.parent/);
  assert.match(update, /entry\.mixer\.uncacheRoot\(root\)/);
});

test('disposal releases the cached root inventory', () => {
  assert.match(source, /this\.cachedActiveRoots\?\.clear\?\.\(\)/);
  assert.match(source, /this\.cachedActiveRoots = null/);
});
