import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/renderer3d.js', import.meta.url), 'utf8');
const start = source.indexOf('  updateMobileDistanceCulling() {');
const end = source.indexOf('\n  // ==========================================================\n  // MAIN RENDER', start);
assert.ok(start >= 0 && end > start, 'mobile distance culling method should exist');
const method = source.slice(start, end);

test('mobile distance culling is throttled to ten passes per second', () => {
  assert.match(source, /this\._nextMobileDistanceCullAt = 0/);
  assert.match(method, /const now = globalThis\.performance\?\.now\?\.\(\) \?\? Date\.now\(\)/);
  assert.match(method, /if \(now < this\._nextMobileDistanceCullAt\) return/);
  assert.match(method, /this\._nextMobileDistanceCullAt = now \+ 100/);
});

test('distance visibility avoids allocating a closure for each culling pass', () => {
  assert.match(source, /function updateMobileActorDistanceVisibility\(actor, limit, cameraZ\)/);
  assert.doesNotMatch(method, /const updateVisibility\s*=/);
});

test('visibility is written only when the desired state changes', () => {
  const start = source.indexOf('function updateMobileActorDistanceVisibility');
  const end = source.indexOf('\n}\n', start) + 2;
  const helper = source.slice(start, end);
  assert.match(helper, /if \(actor\.visible !== shouldBeVisible\) actor\.visible = shouldBeVisible/);
});

test('throttled culling affects only scenery collections, not traffic or game zones', () => {
  assert.match(method, /this\.buildingSlots/);
  assert.match(method, /this\.pedestrians/);
  assert.match(method, /this\.streetLights/);
  assert.match(method, /this\.roadProps/);
  assert.match(method, /this\.flyovers/);
  assert.doesNotMatch(method, /syncTraffic|syncZones|zoneActors|state\.traffic/);
});
