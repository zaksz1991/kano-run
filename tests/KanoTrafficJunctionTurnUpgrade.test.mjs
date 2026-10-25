import test from 'node:test';
import assert from 'node:assert/strict';
import { computeKanoTrafficTurnFrame, chooseKanoTrafficTurnSide, computeKanoTrafficRelativeDepth } from '../js/KanoTrafficJunctionTurnMath.js';

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
  // Positive Three.js yaw turns a -Z-facing vehicle toward world-left.
  assert.ok(left.yawDelta > 0);
  assert.ok(right.yawDelta < 0);
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
  assert.ok(frame.yawDelta < 0);
  assert.ok(Math.abs(frame.yawDelta) <= Math.PI / 2);
  assert.equal(computeKanoTrafficTurnFrame(-0.15, 1).yawDelta, 0);
});


test('a vehicle before the junction progresses into the turn, not out of it', () => {
  const beforeJunction = computeKanoTrafficTurnFrame(0.20, 1);
  const afterJunction = computeKanoTrafficTurnFrame(-0.08, 1);
  assert.ok(beforeJunction.progress > 0);
  assert.ok(afterJunction.progress > beforeJunction.progress);
});


test('oncoming traffic keeps the same world-lateral curve but reverses its yaw', () => {
  const sameFlow = computeKanoTrafficTurnFrame(0.065, 1, 1);
  const oncoming = computeKanoTrafficTurnFrame(0.065, 1, -1);
  assert.equal(oncoming.lateralOffset, sameFlow.lateralOffset);
  assert.equal(oncoming.yawDelta, -sameFlow.yawDelta);
});


test('traffic turn choice is stable for the same vehicle and junction', () => {
  const first = chooseKanoTrafficTurnSide('vehicle-17', 'junction-42', 1);
  for (let index = 0; index < 50; index += 1) {
    assert.equal(chooseKanoTrafficTurnSide('vehicle-17', 'junction-42', 1), first);
  }
});

test('edge lanes never choose a turn that leaves the three-lane road', () => {
  for (let index = 0; index < 100; index += 1) {
    const leftEdgeChoice = chooseKanoTrafficTurnSide(`left-${index}`, 'junction-1', 0);
    const rightEdgeChoice = chooseKanoTrafficTurnSide(`right-${index}`, 'junction-1', 2);
    assert.ok([-1, 0, 1].includes(leftEdgeChoice));
    assert.ok([-1, 0, 1].includes(rightEdgeChoice));
    if (leftEdgeChoice !== 0) assert.equal(0 + leftEdgeChoice, 1);
    if (rightEdgeChoice !== 0) assert.equal(2 + rightEdgeChoice, 1);
  }
});

test('traffic decision retains a straight-through share across many vehicles', () => {
  let straight = 0;
  for (let index = 0; index < 200; index += 1) {
    if (chooseKanoTrafficTurnSide(`vehicle-${index}`, 'junction-8', 1) === 0) straight += 1;
  }
  assert.ok(straight > 20 && straight < 90, `unexpected straight-through count: ${straight}`);
});

test('relative depth is positive before and negative after the junction', () => {
  assert.ok(Math.abs(computeKanoTrafficRelativeDepth(0.8, 0.5) - 0.3) < 1e-12);
  assert.ok(Math.abs(computeKanoTrafficRelativeDepth(0.2, 0.5) + 0.3) < 1e-12);
});

test('relative depth rejects non-finite traffic coordinates', () => {
  assert.ok(Number.isNaN(computeKanoTrafficRelativeDepth(Number.NaN, 0.5)));
  assert.ok(Number.isNaN(computeKanoTrafficRelativeDepth(0.5, Infinity)));
});
