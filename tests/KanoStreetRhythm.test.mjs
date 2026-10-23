import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import '../js/KanoStreetRhythmUpgrade.js';
import {
  isFriday,
  isJumuahWindow,
  streetDensity,
  targetTrafficCount,
} from '../js/KanoStreetRhythm.js';

globalThis.window = globalThis;

function harness(mobile = true) {
  const ui = {
    bind(game) { this.game = game; },
    startPlay() {}, show() {}, hide() {}, toast() {}, update() {},
    event() {}, hideEvent() {}, gameOver() {},
  };
  const audio = { start() {}, engine() {}, horn() {}, pickup() {}, crash() {} };
  return new Game(ui, audio, { mobile });
}

function attachClock(game, { day = 1, minuteOfDay = 7 * 60, trafficDensity = 1 } = {}) {
  game.dayCycle = {
    state: { day, minuteOfDay },
    modifiers() { return { trafficDensity }; },
  };
  return game;
}

function inertTraffic(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `rhythm-test-${index}`,
    type: 'car',
    lane: index % 3,
    direction: 1,
    depth: 1.2 + index * 0.01,
    speedKmh: 0,
    passed: false,
  }));
}

test('in-game Friday repeats on days 5, 12, 19 and continues weekly', () => {
  assert.equal(isFriday(5), true);
  assert.equal(isFriday(12), true);
  assert.equal(isFriday(19), true);
  assert.equal(isFriday(6), false);
  assert.equal(isFriday(0), false);
  assert.equal(isFriday(Number.NaN), false);
});

test('Jumu’ah window boundaries are inclusive at 13:00 and exclusive at 14:15', () => {
  assert.equal(isJumuahWindow(13 * 60), true);
  assert.equal(isJumuahWindow(13 * 60 + 30), true);
  assert.equal(isJumuahWindow(14 * 60 + 14), true);
  assert.equal(isJumuahWindow(14 * 60 + 15), false);
  assert.equal(isJumuahWindow(12 * 60 + 59), false);
  assert.equal(isJumuahWindow(1440 + 13 * 60), true);
});

test('Friday Jumu’ah quiet window overrides the period traffic multiplier', () => {
  assert.equal(streetDensity({ periodDensity: 0.8, minuteOfDay: 13 * 60 + 30, day: 5 }), 0.25);
  assert.equal(streetDensity({ periodDensity: 1.4, minuteOfDay: 14 * 60, day: 12 }), 0.25);
});

test('the hour before Friday Jumu’ah gets a busier travel multiplier', () => {
  assert.equal(streetDensity({ periodDensity: 1, minuteOfDay: 12 * 60 + 30, day: 5 }), 1.25);
  assert.ok(streetDensity({ periodDensity: 0.7, minuteOfDay: 12 * 60 + 30, day: 5 }) >= 1.2);
});

test('other days follow the day-cycle density without Friday adjustments', () => {
  assert.equal(streetDensity({ periodDensity: 0.8, minuteOfDay: 13 * 60 + 30, day: 6 }), 0.8);
  assert.equal(streetDensity({ periodDensity: 1.3, minuteOfDay: 8 * 60, day: 1 }), 1.3);
});

test('invalid density values use a safe default and output is bounded', () => {
  assert.equal(streetDensity({ periodDensity: Number.NaN, minuteOfDay: 500, day: 2 }), 1);
  assert.equal(streetDensity({ periodDensity: -50, minuteOfDay: 500, day: 2 }), 0.25);
  assert.equal(streetDensity({ periodDensity: 50, minuteOfDay: 500, day: 2 }), 1.6);
});

test('traffic target preserves baseline pool sizes at density one', () => {
  assert.equal(targetTrafficCount({ mobile: true, periodDensity: 1, day: 2, minuteOfDay: 8 * 60 }), 5);
  assert.equal(targetTrafficCount({ mobile: false, periodDensity: 1, day: 2, minuteOfDay: 8 * 60 }), 8);
});

test('rush-hour target rises within the mobile and desktop caps', () => {
  assert.equal(targetTrafficCount({ mobile: true, periodDensity: 1.4, day: 2, minuteOfDay: 17 * 60 }), 6);
  assert.equal(targetTrafficCount({ mobile: false, periodDensity: 1.4, day: 2, minuteOfDay: 17 * 60 }), 11);
});

test('Friday Jumu’ah keeps a small but nonzero traffic pool', () => {
  assert.equal(targetTrafficCount({ mobile: true, periodDensity: 0.8, day: 5, minuteOfDay: 13 * 60 + 30 }), 2);
  assert.equal(targetTrafficCount({ mobile: false, periodDensity: 0.8, day: 5, minuteOfDay: 13 * 60 + 30 }), 2);
});

test('initial traffic pool follows the live cycle without editing movement or collision code', () => {
  const game = attachClock(harness(true), { day: 5, minuteOfDay: 13 * 60 + 30, trafficDensity: 0.8 });
  game.s.traffic = [];
  game.spawnInitial();
  assert.equal(game.s.traffic.length, 2);
  assert.equal(game.getKanoStreetRhythmSnapshot().isJumuahWindow, true);
});

test('morning rush may add one actor above the mobile baseline', () => {
  const game = attachClock(harness(true), { day: 3, minuteOfDay: 8 * 60, trafficDensity: 1.3 });
  game.s.traffic = [];
  game.spawnInitial();
  assert.equal(game.s.traffic.length, 6);
  assert.equal(game.getKanoStreetRhythmSnapshot().target, 6);
});

test('runtime density reductions remove no more than one distant vehicle per interval', () => {
  const game = attachClock(harness(true), { day: 5, minuteOfDay: 13 * 60 + 30, trafficDensity: 0.8 });
  game.s.traffic = inertTraffic(5);
  game.s.signedSpeed = 0;
  game.s.speed = 0;
  game._kanoStreetRhythmElapsed = 0;
  for (let index = 0; index < 19; index += 1) game.moveTraffic(0.1);
  assert.equal(game.s.traffic.length, 4);
  assert.equal(game.getKanoStreetRhythmSnapshot().target, 2);
});

test('runtime density increases are paced rather than filling the pool in one frame', () => {
  const game = attachClock(harness(true), { day: 5, minuteOfDay: 13 * 60 + 30, trafficDensity: 0.8 });
  game.s.traffic = inertTraffic(2);
  game.s.signedSpeed = 0;
  game.s.speed = 0;
  game._kanoStreetRhythmElapsed = 0;
  game.dayCycle.state.minuteOfDay = 12 * 60 + 30;
  game.dayCycle.modifiers = () => ({ trafficDensity: 1 });
  for (let index = 0; index < 31; index += 1) game.moveTraffic(0.1);
  assert.equal(game.s.traffic.length, 3);
  assert.equal(game.getKanoStreetRhythmSnapshot().target, 6);
});
