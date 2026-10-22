import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../js/renderer3d.js'),
  'utf8',
);

function blockBetween(startText, endText) {
  const start = source.indexOf(startText);
  assert.notEqual(start, -1, `Missing source marker: ${startText}`);
  const end = source.indexOf(endText, start + startText.length);
  assert.notEqual(end, -1, `Missing source marker: ${endText}`);
  return source.slice(start, end);
}

test('mobile traffic model selection has a persistent deadline', () => {
  assert.match(source, /this\._nextMobileGlbTrafficSelectionAt\s*=\s*0/);
  assert.match(source, /selectionNow\s*>=\s*this\._nextMobileGlbTrafficSelectionAt/);
  assert.match(source, /this\._nextMobileGlbTrafficSelectionAt\s*=\s*selectionNow\s*\+\s*350/);
});

test('candidate scanning and sorting occur inside the cadence guard', () => {
  const trafficSync = blockBetween('  syncTraffic(state) {', '  // ==========================================================\n  // PLAYER DRIVER ANIMATION');
  const guard = trafficSync.indexOf('selectionNow >= this._nextMobileGlbTrafficSelectionAt');
  const scan = trafficSync.indexOf('const candidates = this._mobileTrafficCandidateScratch;');
  const sort = trafficSync.indexOf('candidates.sort(');
  assert.ok(guard >= 0 && scan > guard && sort > scan);
  assert.match(trafficSync.slice(guard, trafficSync.indexOf('mobileGlbIds = this._mobileGlbTrafficIds')), /selectionNow\s*\+\s*350/);
});

test('traffic motion and actor transforms remain in the per-frame traffic loop', () => {
  const trafficSync = blockBetween('  syncTraffic(state) {', '  // ==========================================================\n  // PLAYER DRIVER ANIMATION');
  assert.match(trafficSync, /actor\.position\.set\(/);
  assert.match(trafficSync, /actor\.rotation\.y\s*=\s*vehicle\.direction\s*===\s*-1\s*\?\s*Math\.PI\s*:\s*0/);
  assert.match(trafficSync, /const allowGLB\s*=\s*!this\.mobile\s*\|\|\s*mobileGlbIds\.has\(vehicle\.id\)/);
});

test('driver and pedestrian arm animation avoid per-frame entries iterator allocations', () => {
  const driverBlock = blockBetween('  animateFallbackDriver(state, dt) {', '  // ==========================================================\n  // MOBILE FOG-HORIZON CULLING');
  assert.match(driverBlock, /for\s*\(let index = 0; index < driverArms\.length; index \+= 1\)/);
  assert.doesNotMatch(driverBlock, /parts\.arms\s*\|\|\s*\[\]\)\.entries\(\)/);

  const drawBlock = blockBetween('  draw(state, deltaSeconds) {', '  // ==========================================================\n  // CLEANUP');
  assert.match(drawBlock, /for\s*\(let index = 0; index < arms\.length; index \+= 1\)/);
  assert.doesNotMatch(drawBlock, /pedestrian\.arms\.entries\(\)/);
});
