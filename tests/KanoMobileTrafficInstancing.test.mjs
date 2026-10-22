import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/renderer3d.js', import.meta.url), 'utf8');

test('mobile fallback traffic uses type-specific InstancedMesh batches', () => {
  assert.match(source, /new THREE\.InstancedMesh\(geometry, material, capacity\)/);
  assert.match(source, /KANO_MOBILE_TRAFFIC_BATCH_/);
  assert.match(source, /batch\.mesh\.setMatrixAt\(index, transform\.matrix\)/);
});

test('mobile fallback actors do not create one Scene object per vehicle', () => {
  const start = source.indexOf('  syncTraffic(state) {');
  const end = source.indexOf('  // ==========================================================\n  // PLAYER DRIVER ANIMATION', start);
  assert.ok(start >= 0 && end > start, 'syncTraffic method exists');
  const method = source.slice(start, end);
  assert.match(method, /if \(this\.mobile && !allowGLB\) \{/);
  assert.match(method, /fallbackByType\.get\(type\)/);
  assert.match(method, /this\.getMobileTrafficBatch\(type, vehicles\.length\)/);
});

test('instancing does not remove gameplay traffic from state or alter collision code', () => {
  assert.match(source, /const traffic = Array\.isArray\(state\.traffic\) \? state\.traffic : \[\]/);
  assert.match(source, /this\.models\?\.getInstance\(key\)/);
  assert.match(source, /actor\.position\.set\(/);
  assert.match(source, /actor\.rotation\.y = vehicle\.direction === -1 \? Math\.PI : 0/);
});
