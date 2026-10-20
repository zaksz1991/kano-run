import test from 'node:test';
import assert from 'node:assert/strict';
import { KanoDayCycle, periodAt, formatClock } from '../js/KanoDayCycle.js';

const memoryStorage = () => {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
};
const make = (opts = {}) => {
  const events = [];
  const cycle = new KanoDayCycle({ storage: memoryStorage(), onEvent: (e) => events.push(e), gameMinutesPerSecond: 1, ...opts });
  return { cycle, events };
};
const run = (cycle, seconds, input) => { for (let i = 0; i < seconds * 10; i += 1) cycle.update(0.1, input); };

test('periods follow approximate Kano prayer times and wrap at midnight', () => {
  assert.equal(periodAt(5 * 60).id, 'late');
  assert.equal(periodAt(5 * 60 + 15).id, 'fajr');
  assert.equal(periodAt(13 * 60 + 20).id, 'zuhr');
  assert.equal(periodAt(18 * 60 + 50).id, 'maghrib');
  assert.equal(periodAt(23 * 60 + 59).id, 'late');
  assert.equal(periodAt(1440 + 60).id, 'late');
  assert.equal(formatClock(7 * 60 + 5), '07:05');
});

test('clock advances, rolls to a new day and emits new_day once per rollover', () => {
  const { cycle, events } = make();
  cycle.state.minuteOfDay = 1435;
  run(cycle, 10);
  assert.equal(cycle.state.day, 2);
  assert.equal(events.filter((e) => e.type === 'new_day').length, 1);
  assert.ok(cycle.state.minuteOfDay < 10);
});

test('period_change fires when crossing a boundary', () => {
  const { cycle, events } = make();
  cycle.state.minuteOfDay = 6 * 60 + 58;
  cycle.lastPeriod = periodAt(cycle.state.minuteOfDay).id;
  run(cycle, 5);
  const change = events.find((e) => e.type === 'period_change');
  assert.equal(change?.detail.period, 'morning');
});

test('hunger grows over time; fatigue grows only while moving, faster with a passenger', () => {
  const a = make().cycle;
  run(a, 60, { speedKmh: 0 });
  assert.ok(a.state.hunger > 10);
  assert.equal(a.state.fatigue, 5);

  const solo = make().cycle;
  const loaded = make().cycle;
  run(solo, 60, { speedKmh: 30 });
  run(loaded, 60, { speedKmh: 30, passengerOnboard: true });
  assert.ok(solo.state.fatigue > 5);
  assert.ok(loaded.state.fatigue > solo.state.fatigue);
});

test('threshold warnings fire once, re-arm only after dropping below the low mark', () => {
  const { cycle, events } = make();
  cycle.state.hunger = 69.9;
  run(cycle, 30);
  assert.equal(events.filter((e) => e.type === 'hunger_high').length, 1);

  // hover around the warning level: no repeat spam
  cycle.state.hunger = 69;
  run(cycle, 5);
  assert.equal(events.filter((e) => e.type === 'hunger_high').length, 1);

  cycle.eat(40); // drops below low (55)
  run(cycle, 1); // a tick observes the low value and re-arms the warning
  cycle.state.hunger = 69.95;
  run(cycle, 10);
  assert.equal(events.filter((e) => e.type === 'hunger_high').length, 2);
});

test('critical level fires once even if the value jumps past high', () => {
  const { cycle, events } = make();
  cycle.state.fatigue = 95;
  run(cycle, 3, { speedKmh: 30 });
  assert.equal(events.filter((e) => e.type === 'fatigue_critical').length, 1);
  assert.equal(events.filter((e) => e.type === 'fatigue_high').length, 0);
});

test('eat and rest clamp to 0 and rest skips time without breaking the clock', () => {
  const { cycle } = make();
  cycle.state.hunger = 20; cycle.eat(100);
  assert.equal(cycle.state.hunger, 0);
  cycle.state.minuteOfDay = 1400; cycle.state.fatigue = 60;
  cycle.rest(120);
  assert.equal(cycle.state.fatigue, 0);
  assert.equal(cycle.state.day, 2);
  assert.ok(cycle.state.minuteOfDay >= 0 && cycle.state.minuteOfDay < 1440);
});

test('modifiers: rush hour pays more, tiredness reduces steering but never below 0.7', () => {
  const { cycle } = make();
  cycle.state.minuteOfDay = 7 * 60 + 30;
  assert.ok(cycle.modifiers().fareMultiplier > 1);
  cycle.state.minuteOfDay = 23 * 60;
  assert.ok(cycle.modifiers().fareMultiplier < 1);
  cycle.state.fatigue = 100;
  assert.equal(cycle.modifiers().steeringResponse, 0.7);
  cycle.state.fatigue = 10;
  assert.equal(cycle.modifiers().steeringResponse, 1);
});

test('persistence round-trips and corrupt saved data falls back safely', () => {
  const storage = memoryStorage();
  const a = new KanoDayCycle({ storage });
  a.state.day = 4; a.state.hunger = 42; a.save();
  const b = new KanoDayCycle({ storage });
  assert.equal(b.state.day, 4);
  assert.equal(b.state.hunger, 42);

  storage.setItem('kano-day-cycle-v1', '{not json');
  const c = new KanoDayCycle({ storage });
  assert.equal(c.state.day, 1);

  storage.setItem('kano-day-cycle-v1', JSON.stringify({ day: -5, hunger: 'x', fatigue: 9999, minuteOfDay: NaN }));
  const d = new KanoDayCycle({ storage });
  assert.equal(d.state.day, 1);
  assert.equal(d.state.hunger, 0);
  assert.equal(d.state.fatigue, 100);
  assert.ok(Number.isFinite(d.state.minuteOfDay));
});

test('ignores bad dt, survives a throwing event handler, and stops after dispose', () => {
  const cycle = new KanoDayCycle({ storage: memoryStorage(), onEvent: () => { throw new Error('ui'); } });
  cycle.update(NaN); cycle.update(-1); cycle.update(0);
  cycle.state.hunger = 99;
  assert.doesNotThrow(() => cycle.update(0.1));
  const before = cycle.state.minuteOfDay;
  cycle.dispose();
  cycle.update(1);
  assert.equal(cycle.state.minuteOfDay, before);
});

test('snapshot uses Hausa labels when asked', () => {
  const { cycle } = make();
  cycle.state.minuteOfDay = 13 * 60 + 30;
  assert.equal(cycle.snapshot('ha').periodLabel, 'Azahar');
  assert.equal(cycle.snapshot('en').period, 'zuhr');
});
