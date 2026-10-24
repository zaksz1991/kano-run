import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KANO_NORTHERN_GAIT,
  gaitInstanceCount,
  pedestrianGaitAngle,
  pedestrianLegLocalX,
  pedestrianTorsoBob,
  shouldAnimateFallbackWalker,
} from '../js/KanoNorthernPedestrianGaitRules.js';

test('uses one paired set of instanced legs per pedestrian', () => {
  assert.equal(gaitInstanceCount(0), 0);
  assert.equal(gaitInstanceCount(1), 2);
  assert.equal(gaitInstanceCount(16), 32);
});

test('left and right legs swing in opposite phases', () => {
  const left = pedestrianGaitAngle(0.2, 0.4, 0);
  const right = pedestrianGaitAngle(0.2, 0.4, 1);
  assert.ok(Math.abs(left + right) < 1e-12);
});

test('leg swing remains bounded', () => {
  for (let t = 0; t < 15; t += 0.13) {
    const angle = pedestrianGaitAngle(t, 0.8, t % 2 ? 1 : 0);
    assert.ok(Math.abs(angle) <= KANO_NORTHERN_GAIT.swingRadians + 1e-12);
  }
});

test('walker leg offsets keep a natural narrow stance', () => {
  assert.equal(pedestrianLegLocalX(0), -KANO_NORTHERN_GAIT.lateralOffset);
  assert.equal(pedestrianLegLocalX(1), KANO_NORTHERN_GAIT.lateralOffset);
});

test('instanced gait is suppressed for real GLB actors', () => {
  assert.equal(shouldAnimateFallbackWalker({ usingModel: true, fallback: true, visible: true }), false);
  assert.equal(shouldAnimateFallbackWalker({ usingModel: false, fallback: true, visible: true }), true);
  assert.equal(shouldAnimateFallbackWalker({ usingModel: false, fallback: true, visible: false }), false);
  assert.equal(shouldAnimateFallbackWalker({ usingModel: false, fallback: false, visible: true }), false);
});

test('torso bob remains subtle and grounded', () => {
  for (let t = 0; t < 10; t += 0.1) {
    const bob = pedestrianTorsoBob(t, 0.5);
    assert.ok(bob >= 0);
    assert.ok(bob <= KANO_NORTHERN_GAIT.torsoBob + 1e-12);
  }
});
