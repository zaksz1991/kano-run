import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { KanoDayCycle, periodAt } from '../js/KanoDayCycle.js';

const mainSource = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');
const gameSource = await readFile(new URL('../js/game.js', import.meta.url), 'utf8');
const productionSource = await readFile(new URL('../js/productionSystems.js', import.meta.url), 'utf8');

const memoryStorage = () => {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
};

test('main registers the clock and HUD before running and disposes both', () => {
  assert.match(mainSource, /import \{ KanoDayCycle \} from '\.\/KanoDayCycle\.js'/);
  assert.match(mainSource, /import \{ KanoDayHud \} from '\.\/KanoDayHud\.js'/);
  assert.match(mainSource, /dayCycle = new KanoDayCycle\(/);
  assert.match(mainSource, /onTimeSkip: \(minutes\) =>/);
  assert.match(mainSource, /dayHud = new KanoDayHud\(/);
  assert.match(mainSource, /dayHud\?\.dispose\?\.\(\)/);
  assert.match(mainSource, /dayCycle\?\.dispose\?\.\(\)/);
});

test('main uses the existing world clock and day rather than advancing a parallel clock', () => {
  assert.match(mainSource, /gameMinutesPerSecond: 1\.1/);
  assert.match(mainSource, /minuteOfDay: game\.s\?\.gameClockMinutes/);
  assert.match(mainSource, /day: game\.s\?\.__kanoScheduleCurrentDay \?\? save\?\.lifestyle\?\.worldDayNumber/);
  assert.match(mainSource, /dayCycle\.update\(dt, \{/);
});

test('external world time synchronizes the clock display while hunger and fatigue still advance', () => {
  const cycle = new KanoDayCycle({ storage: memoryStorage(), gameMinutesPerSecond: 1.1 });
  const beforeHunger = cycle.state.hunger;
  cycle.update(0.25, { minuteOfDay: 18 * 60 + 50, day: 3, speedKmh: 30, passengerOnboard: true });
  assert.equal(cycle.state.minuteOfDay, 1130);
  assert.equal(cycle.state.day, 3);
  assert.equal(periodAt(cycle.state.minuteOfDay).id, 'maghrib');
  assert.ok(cycle.state.hunger > beforeHunger);
  assert.ok(cycle.state.fatigue > 5);
});

test('external clock midnight rollover follows the world day without double-counting', () => {
  const events = [];
  const cycle = new KanoDayCycle({ storage: memoryStorage(), onEvent: (event) => events.push(event) });
  cycle.state.day = 4;
  cycle.state.minuteOfDay = 1439;
  cycle.update(0.1, { minuteOfDay: 0.1, day: 5 });
  cycle.update(0.1, { minuteOfDay: 0.2, day: 5 });
  assert.equal(cycle.state.day, 5);
  assert.equal(events.filter((event) => event.type === 'new_day').length, 1);
});

test('beginShift accepts world-clock values while preserving neutral missing-breakfast handling', () => {
  const cycle = new KanoDayCycle({ storage: memoryStorage() });
  cycle.beginShift({ breakfast: null, minuteOfDay: 408, day: 7 });
  assert.equal(cycle.state.day, 7);
  assert.equal(cycle.state.minuteOfDay, 408);
  assert.equal(cycle.state.hunger, 20);
  assert.equal(cycle.state.fatigue, 5);
});

test('rest advances the connected world clock through the time-skip callback', () => {
  let skipped = 0;
  const cycle = new KanoDayCycle({ storage: memoryStorage(), onTimeSkip: (minutes) => { skipped += minutes; } });
  cycle.state.minuteOfDay = 400;
  cycle.rest(50);
  assert.equal(skipped, 50);
  assert.equal(cycle.state.minuteOfDay, 450);
  assert.equal(cycle.state.fatigue, 0);
});

test('game starts with unknown breakfast, applies day modifiers and offers meal/rest events', () => {
  assert.match(gameSource, /breakfastEaten: null/);
  assert.match(gameSource, /this\.dayCycle\?\.modifiers\?\.\(\)\.steeringResponse/);
  assert.match(gameSource, /this\.dayCycle\?\.modifiers\?\.\(\)\.fareMultiplier/);
  assert.match(gameSource, /offerBreak\(type\)/);
  assert.match(gameSource, /mealBreak:/);
  assert.match(gameSource, /restBreak:/);
  assert.match(gameSource, /this\.dayCycle\?\.eat\?\.\(/);
  assert.match(gameSource, /this\.dayCycle\?\.rest\?\.\(/);
});

test('buying roadside water reduces hunger only when the existing purchase succeeds', () => {
  assert.match(productionSource, /this\.game\.dayCycle\?\.eat\?\.\(6\)/);
});
