import test from 'node:test';
import assert from 'node:assert/strict';
import { KanoNorthernDriverRealLife, ROUTINE_STYLES, EVENT_DECK } from '../js/KanoNorthernDriverRealLife.js';

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
}
const build = (options = {}) => new KanoNorthernDriverRealLife({ storage: new MemoryStorage(), now: () => 1_800_000_000_000, ...options });

test('social simulation exposes six bounded relationship and readiness meters', () => {
  const sim = build();
  const { meters } = sim.getSnapshot();
  assert.deepEqual(Object.keys(meters), ['familyTrust', 'parkStanding', 'passengerRespect', 'communityTrust', 'vehicleCare', 'wellbeing']);
  for (const value of Object.values(meters)) assert.ok(value >= 0 && value <= 100);
});

test('one stable daily situation is generated for a given in-game day', () => {
  const sim = build();
  const first = sim.getDailyEvent(4, 500, { householdRole: 'provider' });
  const second = sim.getDailyEvent(4, 1000, { householdRole: 'provider' });
  assert.equal(first.id, second.id);
  assert.equal(first.type, 'mechanic_warning');
  assert.equal(first.choices.length, 3);
});

test('daily event deck spans family, park, passenger, mechanic and community life', () => {
  assert.ok(EVENT_DECK.some(e => e.id === 'family_request'));
  assert.ok(EVENT_DECK.some(e => e.id === 'park_contribution'));
  assert.ok(EVENT_DECK.some(e => e.id === 'passenger_fare'));
  assert.ok(EVENT_DECK.some(e => e.id === 'mechanic_warning'));
  assert.ok(EVENT_DECK.some(e => e.id === 'community_request'));
});

test('family support choice debits only existing wallet and raises family trust', () => {
  const sim = build();
  sim.getDailyEvent(1, 408, { householdRole: 'contribute' });
  const before = sim.state.meters.familyTrust;
  const result = sim.resolveDailyEvent({ day: 1, choiceId: 'family_120', wallet: 500 });
  assert.equal(result.ok, true);
  assert.equal(result.wallet, 380);
  assert.equal(result.walletDelta, -120);
  assert.equal(sim.state.totals.familySupport, 120);
  assert.equal(sim.state.meters.familyTrust, before + 8);
});

test('choices that cost more than the wallet fail without changing state', () => {
  const sim = build();
  sim.getDailyEvent(1);
  const before = sim.getSnapshot();
  const result = sim.resolveDailyEvent({ day: 1, choiceId: 'family_120', wallet: 10 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'insufficient_wallet');
  assert.equal(result.wallet, 10);
  assert.deepEqual(sim.getSnapshot().meters, before.meters);
  assert.equal(sim.state.resolvedEventDays.length, 0);
});

test('daily choice cannot be replayed to farm money or reputation', () => {
  const sim = build();
  sim.getDailyEvent(3);
  const first = sim.resolveDailyEvent({ day: 3, choiceId: 'fare_fair', wallet: 200 });
  assert.equal(first.ok, true);
  assert.equal(first.wallet, 315);
  const secondEvent = sim.getDailyEvent(3);
  assert.equal(secondEvent, null);
  const replay = sim.resolveDailyEvent({ day: 3, choiceId: 'fare_fair', wallet: 315 });
  assert.equal(replay.ok, false);
  assert.equal(replay.reason, 'no_event_for_day');
  assert.equal(sim.state.totals.fareNegotiations, 1);
});

test('meter effects clamp at both bounds', () => {
  const sim = build();
  sim.state.meters.passengerRespect = 99;
  sim.getDailyEvent(3);
  sim.resolveDailyEvent({ day: 3, choiceId: 'fare_fair', wallet: 0 });
  assert.equal(sim.state.meters.passengerRespect, 100);
  sim.getDailyEvent(10);
  sim.state.meters.familyTrust = 1;
  sim.resolveDailyEvent({ day: 10, choiceId: 'evening_home', wallet: 0 });
  assert.ok(sim.state.meters.familyTrust >= 0);
});

test('routine preference accepts only the three supported styles', () => {
  const sim = build();
  for (const style of ROUTINE_STYLES) assert.equal(sim.setRoutineStyle(style).ok, true);
  assert.equal(sim.setRoutineStyle('mandatory').ok, false);
});

test('Islamic prayer routine is available only inside its configured window', () => {
  const sim = build();
  sim.setRoutineStyle('islamic_prayer');
  assert.equal(sim.getRoutineStatus(1, 320).current.id, 'fajr');
  assert.equal(sim.recordRoutine({ day: 1, minutes: 320 }).ok, true);
  assert.equal(sim.recordRoutine({ day: 1, minutes: 321 }).reason, 'already_recorded');
  assert.equal(sim.state.totals.prayerBreaks, 1);
});

test('personal quiet breaks use their own windows rather than prayer labels', () => {
  const sim = build();
  sim.setRoutineStyle('personal_breaks');
  const status = sim.getRoutineStatus(2, 720);
  assert.equal(status.current.id, 'midday');
  const result = sim.recordRoutine({ day: 2, minutes: 720 });
  assert.equal(result.ok, true);
  assert.equal(result.slot.label, 'Midday pause');
  assert.equal(sim.state.totals.personalBreaks, 1);
});

test('routine prompts can be disabled completely', () => {
  const sim = build();
  sim.setRoutineStyle('none');
  assert.equal(sim.getRoutineStatus(1, 320).available, false);
  assert.equal(sim.recordRoutine({ day: 1, minutes: 320 }).reason, 'routine_prompts_disabled');
});

test('social state survives storage reload', () => {
  const storage = new MemoryStorage();
  const first = build({ storage });
  first.getDailyEvent(1);
  first.resolveDailyEvent({ day: 1, choiceId: 'family_40', wallet: 100 });
  first.setRoutineStyle('personal_breaks');
  const second = new KanoNorthernDriverRealLife({ storage, now: () => 1_800_000_000_000 });
  assert.equal(second.state.routineStyle, 'personal_breaks');
  assert.equal(second.state.totals.familySupport, 40);
  assert.equal(second.state.resolvedEventDays.includes(1), true);
});

test('corrupt storage resets safely', () => {
  const storage = new MemoryStorage();
  storage.setItem('kano-life-northern-social-life-v1', '{broken');
  const sim = build({ storage });
  assert.equal(sim.getSnapshot().totals.eventsResolved, 0);
  assert.equal(sim.getSnapshot().meters.familyTrust, 58);
});
