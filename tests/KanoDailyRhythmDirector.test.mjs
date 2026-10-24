import test from 'node:test';
import assert from 'node:assert/strict';
import { KanoDailyRhythmDirector } from '../js/KanoDailyRhythmDirector.js';

test('market days increase daytime passenger and pedestrian activity', () => {
  const d = new KanoDailyRhythmDirector({ marketDays: [1] });
  const result = d.evaluate({ weekday: 1, time: '10:00', demand: 0.5 });
  assert.equal(result.marketDay, true);
  assert.equal(result.effects.passengerDemandMultiplier, 1.24);
  assert.equal(result.effects.pedestrianActivityMultiplier, 1.2);
  assert.ok(result.events.some(e => e.type === 'market_day'));
});

test('outside configured market hours there is no market surge', () => {
  const d = new KanoDailyRhythmDirector({ marketDays: [1] });
  assert.equal(d.evaluate({ weekday: 1, time: '19:00' }).effects.passengerDemandMultiplier, 1);
});

test('prayer window reduces traffic and offers an optional park break', () => {
  const d = new KanoDailyRhythmDirector();
  const result = d.evaluate({ weekday: 2, time: '12:45', location: 'park' });
  assert.equal(result.activePrayer, 'dhuhr');
  assert.equal(result.effects.trafficMultiplier, 0.72);
  assert.ok(result.events.some(e => e.type === 'park_pause_opportunity'));
});

test('Friday midday includes Jumu’ah and combined demand remains bounded', () => {
  const d = new KanoDailyRhythmDirector();
  const result = d.evaluate({ weekday: 5, time: '13:00', demand: 0.9 });
  assert.equal(result.fridayJummah, true);
  assert.ok(result.demandMultiplier >= 0.45 && result.demandMultiplier <= 1.35);
  assert.ok(result.events.some(e => e.type === 'jummah'));
});

test('bad time input is rejected without throwing', () => {
  const d = new KanoDailyRhythmDirector();
  assert.deepEqual(d.evaluate({ weekday: 2, time: '25:90' }), { ok: false, error: 'invalid_time' });
});

test('event access returns copies rather than mutable internal state', () => {
  const d = new KanoDailyRhythmDirector();
  d.evaluate({ weekday: 1, time: '10:00' });
  const events = d.getCurrentEvents();
  events[0]?.effects && (events[0].effects.trafficMultiplier = 99);
  assert.notEqual(d.getCurrentEvents()[0]?.effects.trafficMultiplier, 99);
});
