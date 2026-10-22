import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/renderer3d.js', import.meta.url), 'utf8');
const start = source.indexOf('  syncTraffic(state) {');
const end = source.indexOf('\n  // ==========================================================\n  // PLAYER DRIVER ANIMATION', start);
assert.ok(start >= 0 && end > start, 'syncTraffic method exists');
const method = source.slice(start, end);

test('traffic ID set is reused instead of allocated on every frame', () => {
  assert.match(source, /this\._activeTrafficIds = new Set\(\)/);
  assert.match(method, /const activeIds = this\._activeTrafficIds;\s*activeIds\.clear\(\)/);
  assert.doesNotMatch(method, /new Set\(traffic\.map\(/);
});

test('mobile GLB candidates reuse one scratch array rather than filter chains', () => {
  assert.match(source, /this\._mobileTrafficCandidateScratch = \[\]/);
  assert.match(method, /const candidates = this\._mobileTrafficCandidateScratch;\s*candidates\.length = 0/);
  assert.doesNotMatch(method, /traffic\s*\.filter\(/);
  assert.match(method, /candidates\.sort\(/);
});

test('traffic type-key collection is reused without changing instanced batching', () => {
  assert.match(source, /this\._mobileTrafficTypeScratch = new Set\(\)/);
  assert.match(method, /const typeKeys = this\._mobileTrafficTypeScratch;\s*typeKeys\.clear\(\)/);
  assert.match(method, /this\.getMobileTrafficBatch\(type, vehicles\.length\)/);
  assert.match(method, /batch\.mesh\.setMatrixAt\(index, transform\.matrix\)/);
});

test('traffic simulation IDs and vehicle positions remain the source of rendered transforms', () => {
  assert.match(method, /const traffic = Array\.isArray\(state\.traffic\) \? state\.traffic : \[\]/);
  assert.match(method, /activeIds\.has\(id\)/);
  assert.match(method, /\(vehicle\.lane - 1\) \* 3 \+ \(Number\(vehicle\.visualOffsetX\) \|\| 0\)/);
  assert.match(method, /-Math\.max\(-0\.05, Number\(vehicle\.depth\) \|\| 0\) \* 88/);
});
