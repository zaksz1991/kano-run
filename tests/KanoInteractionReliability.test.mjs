import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getInteractionAdvice,
  installStoppedInteractionCompatibility,
} from '../js/KanoInteractionReliability.js';

function state(overrides = {}) {
  return {
    speed: 0,
    signedSpeed: 0,
    reverse: false,
    steer: 0,
    // Raw zone depth; the module adds ROADSIDE_INTERACTION_DEPTH_OFFSET (0.12), so 0.05 -> 0.17 (inside stop range).
    zones: [{ id: 'stop-1', type: 'pickup', depth: 0.05, lane: 1, hub: false }],
    ...overrides,
  };
}

test('pickup guidance changes from approach to ready as the zone reaches the stop range', () => {
  const approach = getInteractionAdvice(state({ zones: [{ type: 'pickup', depth: 0.12, lane: 1 }] }), 'PLAY');
  assert.equal(approach.type, 'approach');

  const ready = getInteractionAdvice(state(), 'PLAY');
  assert.equal(ready.type, 'ready');
  assert.match(ready.message, /PASSENGER PICKUP/);
});

test('misaligned lane prompts the driver to align before stopping', () => {
  const advice = getInteractionAdvice(state({ steer: -1 }), 'PLAY');
  assert.equal(advice.type, 'lane');
  assert.match(advice.message, /ALIGN/);
});

test('high speed prompts braking', () => {
  const advice = getInteractionAdvice(state({ speed: 18, signedSpeed: 18 }), 'PLAY');
  assert.equal(advice.type, 'brake');
  assert.match(advice.message, /BRAKE/);
});

test('reverse gear does not advertise a valid roadside interaction', () => {
  const advice = getInteractionAdvice(state({ reverse: true, signedSpeed: -2 }), 'PLAY');
  assert.equal(advice.type, 'gear');
  assert.match(advice.message, /FORWARD GEAR/);
});

test('potholes are reported as hazards, not stop zones', () => {
  const advice = getInteractionAdvice(state({ zones: [{ type: 'pothole', depth: 0.2, lane: 1 }] }), 'PLAY');
  assert.equal(advice.type, 'hazard');
});

test('events and non-playing states suppress interaction guidance', () => {
  assert.equal(getInteractionAdvice(state({ event: 'fare' }), 'PLAY'), null);
  assert.equal(getInteractionAdvice(state(), 'MENU'), null);
});

test('stationary road interaction receives a temporary speed epsilon and restores the original speed', () => {
  let speedSeenInside = null;
  const game = {
    state: 'PLAY',
    s: { speed: 0, signedSpeed: 0, reverse: false, event: null, zones: [] },
    moveZones() {
      speedSeenInside = this.s.signedSpeed;
      return 'called';
    },
  };
  const original = game.moveZones;
  const restore = installStoppedInteractionCompatibility(game);

  assert.equal(game.moveZones(0.016), 'called');
  assert.equal(speedSeenInside, 0.051);
  assert.equal(game.s.signedSpeed, 0);
  assert.notEqual(game.moveZones, original);

  restore();
  assert.equal(game.moveZones, original);
});

test('reverse and moving vehicles never receive the stopped-interaction epsilon', () => {
  for (const current of [
    { speed: 0, signedSpeed: 0, reverse: true },
    { speed: 8, signedSpeed: 8, reverse: false },
  ]) {
    let speedSeenInside = null;
    const game = {
      state: 'PLAY',
      s: { ...current, event: null },
      moveZones() { speedSeenInside = this.s.signedSpeed; },
    };
    const restore = installStoppedInteractionCompatibility(game);
    game.moveZones(0.016);
    assert.equal(speedSeenInside, current.signedSpeed);
    restore();
  }
});

test('a full keke is told it is full instead of being coached to line up for a pickup', () => {
  const full = state({ capacity: 5, passengers: [{ seats: 1 }, { seats: 1 }, { seats: 1 }, { seats: 1 }, { seats: 1 }] });
  const advice = getInteractionAdvice(full, 'PLAY');
  assert.equal(advice.type, 'full');
  assert.match(advice.message, /KEKE FULL/);
});

test('a checkpoint group needs two free seats; one free seat is not enough', () => {
  const hub = { id: 'hub-1', type: 'pickup', depth: 0.05, lane: 1, hub: true };
  const oneFree = state({ zones: [hub], capacity: 5, passengers: [{ seats: 1 }, { seats: 1 }, { seats: 1 }, { seats: 1 }] });
  assert.equal(getInteractionAdvice(oneFree, 'PLAY').type, 'full');
  const twoFree = state({ zones: [hub], capacity: 5, passengers: [{ seats: 1 }, { seats: 1 }, { seats: 1 }] });
  assert.notEqual(getInteractionAdvice(twoFree, 'PLAY').type, 'full');
});

test('pickup guidance is unchanged when seats are free or capacity is unknown, and drop-offs are never blocked', () => {
  assert.equal(getInteractionAdvice(state({ capacity: 5, passengers: [{ seats: 1 }] }), 'PLAY').type, 'ready');
  assert.equal(getInteractionAdvice(state(), 'PLAY').type, 'ready');
  const dropWhenFull = state({ zones: [{ type: 'drop', depth: 0.05, lane: 1 }], capacity: 5, passengers: new Array(5).fill({ seats: 1 }) });
  assert.notEqual(getInteractionAdvice(dropWhenFull, 'PLAY').type, 'full');
});
