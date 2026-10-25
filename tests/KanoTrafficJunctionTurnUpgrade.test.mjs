import test from 'node:test';
import assert from 'node:assert/strict';
import { computeKanoTrafficTurnFrame } from '../js/KanoTrafficJunctionTurnMath.js';

test('turn starts on the original path with no lateral or yaw jump', () => {
  const frame = computeKanoTrafficTurnFrame(0.28, 1);
  assert.equal(frame.progress, 0);
  assert.equal(frame.lateralOffset, 0);
  assert.equal(frame.yawDelta, 0);
  assert.equal(frame.complete, false);
});

test('left and right turns produce mirrored curves and yaw', () => {
  const left = computeKanoTrafficTurnFrame(0.065, -1);
  const right = computeKanoTrafficTurnFrame(0.065, 1);
  assert.ok(left.lateralOffset < 0);
  assert.ok(right.lateralOffset > 0);
  assert.ok(left.yawDelta < 0);
  assert.ok(right.yawDelta > 0);
  assert.equal(Math.abs(left.lateralOffset), Math.abs(right.lateralOffset));
});

test('turn exits in the target lane with zero residual yaw', () => {
  const frame = computeKanoTrafficTurnFrame(-0.15, 1);
  assert.equal(frame.progress, 1);
  assert.equal(frame.complete, true);
  assert.equal(frame.lateralOffset, 3);
  assert.equal(frame.yawDelta, 0);
});

test('turn progress is clamped for positions outside the turn envelope', () => {
  assert.equal(computeKanoTrafficTurnFrame(10, 1).progress, 0);
  assert.equal(computeKanoTrafficTurnFrame(-10, 1).progress, 1);
});

test('yaw peaks during the turn and returns to zero at the exit', () => {
  const frame = computeKanoTrafficTurnFrame(0.065, 1);
  assert.ok(frame.yawDelta > 0);
  assert.ok(frame.yawDelta <= Math.PI / 2);
  assert.equal(computeKanoTrafficTurnFrame(-0.15, 1).yawDelta, 0);
});
