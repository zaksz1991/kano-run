import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KANO_FLYOVER_DECK_HEIGHT,
  KANO_FLYOVER_DECK_HALF_LENGTH,
  KANO_FLYOVER_RAMP_END,
  kanoFlyoverHeightAt,
  kanoSignedRoadScroll,
  kanoWrapFlyoverZ,
} from '../js/KanoFlyoverDriveabilityRules.mjs';

test('flyover surface is at road level before the entry ramp', () => {
  assert.equal(kanoFlyoverHeightAt(KANO_FLYOVER_RAMP_END + 0.01), 0);
  assert.equal(kanoFlyoverHeightAt(-KANO_FLYOVER_RAMP_END - 0.01), 0);
  assert.equal(kanoFlyoverHeightAt(100), 0);
});

test('flyover deck reaches its configured height across the flat centre', () => {
  assert.equal(kanoFlyoverHeightAt(0), KANO_FLYOVER_DECK_HEIGHT);
  assert.equal(kanoFlyoverHeightAt(KANO_FLYOVER_DECK_HALF_LENGTH), KANO_FLYOVER_DECK_HEIGHT);
  assert.equal(kanoFlyoverHeightAt(-KANO_FLYOVER_DECK_HALF_LENGTH), KANO_FLYOVER_DECK_HEIGHT);
});

test('entry ramp rises monotonically toward the deck', () => {
  const outer = kanoFlyoverHeightAt(KANO_FLYOVER_RAMP_END);
  const middle = kanoFlyoverHeightAt((KANO_FLYOVER_RAMP_END + KANO_FLYOVER_DECK_HALF_LENGTH) / 2);
  const inner = kanoFlyoverHeightAt(KANO_FLYOVER_DECK_HALF_LENGTH);
  assert.ok(outer < middle && middle < inner);
});

test('exit ramp descends symmetrically from the deck', () => {
  for (const z of [3, 8, 14, 23, 32]) {
    assert.ok(Math.abs(kanoFlyoverHeightAt(z) - kanoFlyoverHeightAt(-z)) < 1e-9);
  }
});

test('deck-height override scales the full surface without negative heights', () => {
  assert.equal(kanoFlyoverHeightAt(0, 3.8), 3.8);
  assert.ok(kanoFlyoverHeightAt(20, -2) >= 0);
  assert.equal(kanoFlyoverHeightAt(34, 3.8), 0);
});

test('flyover loop preserves forward and reverse world continuity', () => {
  assert.equal(kanoWrapFlyoverZ(23, 260), -237);
  assert.equal(kanoWrapFlyoverZ(-261, 260), -1);
  assert.equal(kanoWrapFlyoverZ(-40, 260), -40);
});

test('signed road scroll follows forward and reverse and clamps stalled frames', () => {
  assert.equal(kanoSignedRoadScroll({ signedSpeed: 20 }, 0.05), 0.28);
  assert.equal(kanoSignedRoadScroll({ signedSpeed: -20 }, 0.05), -0.28);
  assert.equal(kanoSignedRoadScroll({ reverse: true, speed: 10 }, 0.05), -0.14);
  assert.equal(kanoSignedRoadScroll({ signedSpeed: 20 }, 5), 0.28);
});

test('invalid frame state cannot create NaN movement', () => {
  assert.equal(kanoSignedRoadScroll({ signedSpeed: NaN }, NaN), 0);
  assert.equal(kanoFlyoverHeightAt(NaN), 0);
});
