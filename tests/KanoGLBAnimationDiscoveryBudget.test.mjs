import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../js/KanoAnimationTrafficUpgrade.js', import.meta.url), 'utf8');
const managerStart = source.indexOf('export class KanoGLBAnimationManager');
const updateStart = source.indexOf('  update(deltaSeconds) {', managerStart);
const updateEnd = source.indexOf('\n  dispose() {', updateStart);
const update = source.slice(updateStart, updateEnd);

test('mobile GLB root discovery is throttled to a 120 ms inventory interval', () => {
  assert.match(source, /MOBILE_ANIMATION_ROOT_DISCOVERY_INTERVAL = 0\.12/);
  assert.match(update, /!this\.mobile\s*\|\|\s*!this\.cachedActiveRoots\s*\|\|\s*this\.elapsed - this\.lastRootDiscoveryElapsed >= MOBILE_ANIMATION_ROOT_DISCOVERY_INTERVAL/);
  assert.match(update, /activeRoots = this\.collectAnimatedRoots\(\)/);
  assert.match(update, /activeRoots = this\.cachedActiveRoots/);
});

test('desktop retains per-frame animation-root discovery and mixer updates', () => {
  assert.match(update, /const shouldDiscoverRoots = !this\.mobile/);
  assert.match(update, /if \(!this\.mobile\) \{\s*entry\.mixer\.update\(dt\)/);
});

test('mobile mixers accumulate elapsed time before reduced-rate updates', () => {
  assert.match(update, /entry\.pendingElapsed = Math\.min\(0\.25, entry\.pendingElapsed \+ dt\)/);
  assert.match(update, /entry\.mixer\.update\(entry\.pendingElapsed\)/);
  assert.match(update, /entry\.pendingElapsed = 0/);
});

test('detached animation roots are uncached and removed', () => {
  assert.match(update, /!this\.lastActiveRoots\.has\(root\) \|\| !root\.parent/);
  assert.match(update, /entry\.mixer\.uncacheRoot\(root\)/);
});

test('active root membership reuses its existing Set', () => {
  assert.match(update, /this\.lastActiveRoots\.clear\(\)/);
  assert.match(update, /for \(const root of activeRoots\.keys\(\)\) this\.lastActiveRoots\.add\(root\)/);
  assert.doesNotMatch(update, /this\.lastActiveRoots = new Set\(/);
});

test('disposal releases the cached root inventory', () => {
  assert.match(source, /this\.cachedActiveRoots\?\.clear\?\.\(\)/);
  assert.match(source, /this\.cachedActiveRoots = null/);
  assert.match(source, /this\.lastActiveRoots\.clear\(\)/);
});
