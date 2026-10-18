import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES, DRIVERS } from '../js/config.js';
import { Game } from '../js/game.js';
import { save, submitTribe, tribeStanding } from '../js/storage.js';

// Some gameplay events use window.setTimeout in browsers. Node-based tests use
// the same timer API so the gameplay module can be exercised without a DOM.
globalThis.window = globalThis;

function createHarness() {
  const calls = { toasts: [], events: [], results: [] };
  const ui = {
    bind(game) { this.game = game; },
    startPlay() { calls.started = true; },
    show(id) { calls.shown = id; },
    hide(id) { calls.hidden = id; },
    toast(message) { calls.toasts.push(String(message)); },
    update() {},
    event(...args) { calls.events.push(args); },
    hideEvent() { calls.eventHidden = true; },
    gameOver(result) { calls.results.push(result); },
  };
  const audio = {
    start() {}, engine() {}, horn() {}, pickup() {}, crash() {},
  };
  const game = new Game(ui, audio, { mobile: true });
  return { game, ui, audio, calls };
}

test('Kano route and driver catalog meets minimum content size', () => {
  assert.ok(ROUTES.length >= 60, `expected 60+ routes, got ${ROUTES.length}`);
  assert.ok(DRIVERS.length >= 7, `expected 7 drivers, got ${DRIVERS.length}`);
  assert.ok(ROUTES.some((route) => route.name === 'Kumbotso'));
  assert.ok(ROUTES.some((route) => route.name === 'Kurmi Market'));
});

test('run starts and ticking updates distance without missing-method exceptions', () => {
  const { game } = createHarness();
  game.start('career');
  game.s.invuln = 60;
  game.gas(true);
  for (let frame = 0; frame < 240; frame += 1) game.tick(1 / 60);
  assert.equal(game.state, 'PLAY');
  assert.ok(game.s.distance > 0);
  assert.ok(Number.isFinite(game.s.speed));
  assert.ok(game.s.zones.length > 0);
  assert.ok(game.s.traffic.length > 0);
});

test('mode selection resets the run and applies the selected mode', () => {
  const { game } = createHarness();
  game.start('career');
  game.s.distance = 2.7;
  game.setMode('fuel');
  assert.equal(game.mode, 'fuel');
  assert.equal(game.s.mode, 'fuel');
  assert.equal(game.s.distance, 0);
  assert.equal(game.s.fuel, 42);
  assert.equal(game.state, 'PLAY');
});

test('collision applies damage once and enables invulnerability frames', () => {
  const { game } = createHarness();
  game.start('career');
  const before = game.s.condition;
  game.hit({ type: 'car' });
  assert.ok(game.s.condition < before);
  assert.ok(game.s.invuln > 0);
});

test('drop removes one passenger and records fare progress', () => {
  const { game } = createHarness();
  game.start('career');
  game.s.passengers = [{ name: 'Amina', dest: game.route.name, seats: 1, fare: 500, class: 'worker' }];
  game.s.speed = 0;
  const fareBefore = game.s.fares;
  assert.equal(game.drop({ dest: game.route.name }), true);
  assert.equal(game.s.passengers.length, 0);
  assert.equal(game.s.drops, 1);
  assert.ok(game.s.fares > fareBefore);
});

test('paid continue cannot leave the player stuck on the over screen', () => {
  const { game, calls } = createHarness();
  game.start('career');
  game.state = 'OVER';
  game.s.runEnded = true;
  game.s.lives = 0;
  game.s.paidContinueCost = 400;
  save.money = Math.max(save.money || 0, 1500);
  game.continueRun(true);
  assert.equal(game.state, 'PLAY');
  assert.equal(game.s.runEnded, false);
  assert.ok(game.s.invuln >= 4);
  assert.equal(calls.hidden, 'over-screen');
});

test('tribal leaderboards keep only the top three scores', () => {
  save.tribes.hausa = [];
  submitTribe({ score: 100, distance: 1, driver: 'A', mode: 'career' }, 'hausa');
  submitTribe({ score: 900, distance: 2, driver: 'B', mode: 'career' }, 'hausa');
  submitTribe({ score: 500, distance: 3, driver: 'C', mode: 'career' }, 'hausa');
  submitTribe({ score: 200, distance: 4, driver: 'D', mode: 'career' }, 'hausa');
  assert.deepEqual(save.tribes.hausa.map((row) => row.score), [900, 500, 200]);
  assert.ok(tribeStanding()[0].total >= 1600);
});

test('forced final completion submits the run without offering another continue', () => {
  const { game, calls } = createHarness();
  game.start('timeAttack');
  game.finishRun('Bronze medal');
  assert.equal(game.state, 'OVER');
  assert.equal(calls.results.length, 1);
  assert.equal(calls.results[0].soft, false);
  assert.equal(calls.results[0].reason, 'Bronze medal');
});
