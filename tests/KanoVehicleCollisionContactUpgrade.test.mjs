import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  calculateContactDeflection,
  calculateContactHoldDepth,
  getVehicleCollisionDimensions,
  isFreshVehicleContact,
  advanceContactHold,
  detectSweptVehicleContact,
  sweptLongitudinalGap,
} from '../js/KanoVehicleCollisionContactRules.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('real traffic types have finite, positive collision dimensions', () => {
  for (const type of ['keke', 'motorcycle', 'car', 'taxi', 'suv', 'police', 'karota', 'ambulance', 'truck', 'bus']) {
    const dimensions = getVehicleCollisionDimensions(type);
    assert.ok(Number.isFinite(dimensions.halfLength) && dimensions.halfLength > 0, type);
    assert.ok(Number.isFinite(dimensions.halfWidth) && dimensions.halfWidth > 0, type);
  }
});

test('contact hold depth keeps traffic near but outside longitudinal overlap', () => {
  for (const type of ['motorcycle', 'keke', 'car', 'bus']) {
    const depth = calculateContactHoldDepth(type);
    assert.ok(depth >= 0.003 && depth <= 0.06, `${type}: ${depth}`);
    assert.ok(Number.isFinite(depth));
  }
});

test('same-lane contact creates a clearing displacement on the collision side', () => {
  const right = calculateContactDeflection({ type: 'car', playerWorldX: 0, lane: 1, preferredSide: 1 });
  const left = calculateContactDeflection({ type: 'keke', playerWorldX: 0, lane: 1, preferredSide: -1 });
  assert.ok(right.offsetX > 0);
  assert.ok(left.offsetX < 0);
  assert.ok(Math.abs(right.offsetX) >= 0.75);
  assert.ok(Math.abs(left.offsetX) >= 0.75);
});

test('lateral contact uses the rendered offset and returns finite output for bad inputs', () => {
  const shifted = calculateContactDeflection({ type: 'truck', playerWorldX: 1.2, lane: 1, currentOffsetX: 0.4, preferredSide: 1 });
  const invalid = calculateContactDeflection({ type: 'unknown', playerWorldX: NaN, lane: NaN, currentOffsetX: NaN, preferredSide: 0 });
  assert.equal(shifted.trafficWorldX, 0.4);
  for (const result of [shifted, invalid]) {
    for (const key of ['side', 'lateralGap', 'collisionGap', 'deflection', 'offsetX']) assert.ok(Number.isFinite(result[key]), key);
  }
});

test('fresh contact requires the core engine to transition into collision state', () => {
  assert.equal(isFreshVehicleContact({ passed: false, collisionKickTime: 0 }, { passed: true, collisionKickTime: 0.44 }), true);
  assert.equal(isFreshVehicleContact({ passed: true, collisionKickTime: 0.2 }, { passed: true, collisionKickTime: 0.44 }), false);
  assert.equal(isFreshVehicleContact({ passed: false, collisionKickTime: 0 }, { passed: true, collisionKickTime: 0 }), false);
  assert.equal(isFreshVehicleContact(null, { passed: true, collisionKickTime: 0.44 }), false);
});

test('contact hold expires monotonically and clamps unusually large frame deltas', () => {
  const first = advanceContactHold({ offsetX: 1.5, holdRemaining: 0.095 }, 0.016);
  assert.ok(first.holdRemaining < 0.095 && first.holdRemaining > 0);
  assert.equal(first.holding, true);
  const expired = advanceContactHold(first, 10);
  assert.equal(expired.holdRemaining, 0);
  assert.equal(expired.holding, false);
});

test('runtime adapter is wired through the existing traffic selector without touching protected boot files', () => {
  const selector = read('js/KanoTrafficMix.js');
  const adapter = read('js/KanoVehicleCollisionContactUpgrade.js');
  assert.match(selector, /import\s+['"]\.\/KanoVehicleCollisionContactUpgrade\.js['"]/);
  assert.match(adapter, /Game\.prototype\.moveTraffic/);
  assert.match(adapter, /originalMoveTraffic\.call\(this/);
  assert.match(adapter, /isFreshVehicleContact/);
  assert.match(adapter, /kanoVehicleCollisionContactAudit/);
});

test('swept contact catches a vehicle crossing the player plane between frames', () => {
  const contact = detectSweptVehicleContact({
    type: 'keke', previousDepth: 0.12, currentDepth: -0.14,
    playerWorldX: 0, lane: 1, previousOffsetX: 0,
  });
  assert.equal(sweptLongitudinalGap(0.12, -0.14), 0);
  assert.equal(contact.collides, true);
});

test('swept contact backstop does not register a vehicle in a separate lane', () => {
  const contact = detectSweptVehicleContact({
    type: 'car', previousDepth: 0.04, currentDepth: 0.01,
    playerWorldX: 0, lane: 0, previousOffsetX: 0,
  });
  assert.equal(contact.collides, false);
});
