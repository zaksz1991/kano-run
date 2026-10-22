import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';

// Exercise the real gameplay code with the same tiny UI/audio adapters used by
// tests/game.test.js, without needing the browser or loading rendered GLBs.
globalThis.window = globalThis;

function createHarness() {
  const ui = {
    bind(game) { this.game = game; },
    startPlay() {}, show() {}, hide() {}, toast() {}, update() {}, event() {}, hideEvent() {}, gameOver() {},
  };
  const audio = { start() {}, engine() {}, horn() {}, pickup() {}, crash() {} };
  return { game: new Game(ui, audio, { mobile: true }) };
}

test('traffic in the pulled-over keke position produces a real collision and visible deflection', () => {
  const { game } = createHarness();
  game.start('career');
  game.s.invuln = 0;
  game.s.speed = 35;
  game.s.signedSpeed = 35;
  game.s.steer = 0;
  game.s.pullOverSide = 1;
  game.s.traffic = [{
    id: 'side-contact',
    type: 'car',
    lane: 2,
    direction: -1,
    depth: 0.011,
    speedKmh: 25,
    passed: false,
  }];

  game.moveTraffic(1 / 60);
  assert.equal(game.s.collisions, 1);
  assert.equal(game.s.traffic[0].passed, true);
  assert.ok(game.s.traffic[0].collisionKickTime > 0);
  assert.notEqual(game.s.traffic[0].visualOffsetX, 0);
});

test('safe-speed time advances at a normal city-driving speed', () => {
  const { game } = createHarness();
  game.start('career');
  game.s.traffic = [];
  game.s.zones = [];
  game.s.speed = 31;
  game.s.signedSpeed = 31;
  game.s.invuln = 60;
  game.gas(true);
  game.tick(1 / 60);
  assert.ok(game.s.safeSpeedSeconds > 0);
});

test('left lane is treated as lane zero rather than incorrectly colliding as centre lane', () => {
  const { game } = createHarness();
  game.start('career');
  game.s.invuln = 0;
  game.s.speed = 35;
  game.s.signedSpeed = 35;
  game.s.steer = -1;
  game.s.pullOverSide = 0;
  game.s.traffic = [{
    id: 'left-lane-contact', type: 'car', lane: 0, direction: -1,
    depth: 0.011, speedKmh: 25, passed: false,
  }];

  game.moveTraffic(1 / 60);
  assert.equal(game.s.collisions, 1);
  assert.equal(game.s.traffic[0].passed, true);
});

test('steering sideways into a same-speed vehicle already beside the keke still collides', () => {
  const { game } = createHarness();
  game.start('career');
  game.s.invuln = 0;
  game.s.speed = 25;
  game.s.signedSpeed = 25;
  game.s.steer = 1;
  game.s.pullOverSide = 0;
  game.s.traffic = [{
    id: 'same-speed-side-contact', type: 'car', lane: 1, direction: 1,
    depth: 0.005, speedKmh: 25, passed: false,
  }];

  game.moveTraffic(1 / 60);
  assert.equal(game.s.collisions, 0, 'the vehicle should remain eligible while laterally clear');
  assert.equal(game.s.traffic[0].passed, false, 'overlap checks should not be retired early');

  game.s.steer = 0;
  game.moveTraffic(1 / 60);
  assert.equal(game.s.collisions, 1, 'the second frame moves the keke into the vehicle');
  assert.equal(game.s.traffic[0].passed, true);
});
