import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/renderer3d.js', import.meta.url), 'utf8');
const start = source.indexOf('  updateMobileDistanceCulling() {');
const end = source.indexOf('\n  // ==========================================================\n  // MAIN RENDER', start);
assert.ok(start >= 0 && end > start, 'mobile fog-horizon culling method should exist');
const method = source.slice(start, end);

test('distance culling is mobile-only and uses the live fog horizon', () => {
  assert.match(method, /if \(!this\.mobile \|\| !this\.camera \|\| !this\.scene\?\.fog\) return/);
  assert.match(method, /const horizon = Math\.min\(100, fogFar \* 0\.90\)/);
});

test('culling applies to visual scenery, not gameplay simulation collections', () => {
  assert.match(method, /this\.buildingSlots/);
  assert.match(method, /this\.pedestrians/);
  assert.match(method, /this\.streetLights/);
  assert.match(method, /this\.roadProps/);
  assert.match(method, /this\.flyovers/);
  assert.doesNotMatch(method, /this\.syncTraffic|state\.traffic|this\.zoneActors/);
});

test('flyover landmarks remain visible to the fog horizon', () => {
  assert.match(method, /Math\.min\(110, fogFar\)/);
});

test('mobile pedestrian arm sway is skipped beyond the near detail distance only', () => {
  assert.match(source, /const animateArms =\s*!this\.mobile \|\|\s*Math\.abs\(pedestrian\.actor\.position\.z - this\.camera\.position\.z\) <= 48/);
});

test('distance culling runs after camera tracking and before the road render', () => {
  const call = source.lastIndexOf('    this.updateMobileDistanceCulling();');
  const render = source.indexOf('    this.renderer.render(this.scene, this.camera);', call);
  assert.ok(call > source.indexOf('    this.camera.lookAt(\n      targetX'));
  assert.ok(render > call);
});

test('garage and life-scene render paths are not redirected through road culling', () => {
  assert.equal((source.match(/this\.updateMobileDistanceCulling\(\);/g) || []).length, 1);
  assert.match(source, /if \(this\.lifeScene === 'garage'\)[\s\S]*?this\.renderer\.render\(this\.scene, this\.camera\);[\s\S]*?return;/);
});
