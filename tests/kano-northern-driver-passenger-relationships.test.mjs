import test from 'node:test';
import assert from 'node:assert/strict';
import { KanoNorthernDriverPassengerRelationships } from '../js/KanoNorthernDriverPassengerRelationships.js';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
}
const build = (options = {}) => new KanoNorthernDriverPassengerRelationships({ storage: new MemoryStorage(), now: () => 1_800_000_000_000, ...options });
const passenger = (name = 'Hajiya Zainab') => ({ name, class: 'market woman', fare: 125, dest: 'Kurmi Market' });

test('new passenger boarding creates a stable trust record without a fare adjustment', () => {
  const sim = build();
  const result = sim.recordBoarding(passenger(), { day: 2, minute: 560 });
  assert.equal(result.ok, true);
  assert.equal(result.returning, false);
  assert.equal(result.trust, 50);
  assert.equal(result.fareMultiplier, 1);
  assert.equal(sim.getSnapshot().totals.boardings, 1);
});

test('safe correct delivery builds the passenger trust and service reputation', () => {
  const sim = build();
  sim.recordBoarding(passenger(), { day: 2, minute: 560 });
  const result = sim.recordTrip({ tripId: 'run-1:0', passenger: passenger(), matched: true, safeTrip: true, fareEarned: 180, day: 2, minute: 575, distance: 0.6, destination: 'Kurmi Market' });
  assert.equal(result.ok, true);
  assert.equal(result.report.trustDelta, 6);
  assert.equal(result.report.trust, 56);
  assert.equal(result.report.reputation, 52);
  assert.equal(result.snapshot.totals.safeTrips, 1);
  assert.equal(result.snapshot.totals.correctStops, 1);
});

test('rough journeys reduce passenger trust and the overall service reputation', () => {
  const sim = build();
  const result = sim.recordTrip({ tripId: 'run-1:0', passenger: passenger('Bello'), matched: false, safeTrip: false, fareEarned: 10, day: 1, minute: 500 });
  assert.equal(result.report.trust, 43);
  assert.equal(result.report.reputation, 47);
  assert.equal(result.snapshot.totals.roughTrips, 1);
  assert.equal(result.snapshot.totals.correctStops, 0);
});

test('returning trusted customers receive a bounded three-percent regular-customer fare adjustment', () => {
  const sim = build();
  sim.state.people['hajiya zainab'] = { name: 'Hajiya Zainab', trust: 80, boardings: 1, rides: 1, safeTrips: 1, correctStops: 1, roughTrips: 0, lastSeenDay: 1, lastSeenMinute: 500 };
  const result = sim.recordBoarding(passenger(), { day: 2, minute: 560 });
  assert.equal(result.returning, true);
  assert.equal(result.fareMultiplier, 1.03);
});

test('returning low-trust customers negotiate slightly lower fares; trust zero remains zero', () => {
  const sim = build();
  sim.state.people['bello'] = { name: 'Bello', trust: 0, boardings: 2, rides: 1, safeTrips: 0, correctStops: 0, roughTrips: 1, lastSeenDay: 1, lastSeenMinute: 500 };
  const result = sim.recordBoarding(passenger('Bello'), { day: 2, minute: 560 });
  assert.equal(result.returning, true);
  assert.equal(result.trust, 0);
  assert.equal(result.fareMultiplier, 0.97);
});

test('trip IDs prevent duplicate relationship settlement', () => {
  const sim = build();
  const args = { tripId: 'same-trip', passenger: passenger(), matched: true, safeTrip: true };
  assert.equal(sim.recordTrip(args).ok, true);
  assert.equal(sim.recordTrip(args).reason, 'trip_already_recorded');
  assert.equal(sim.getSnapshot().totals.trips, 1);
});

test('same passenger names build returning-customer history across world days', () => {
  const sim = build();
  sim.recordBoarding(passenger(), { day: 1 });
  sim.recordTrip({ tripId: 'r1:0', passenger: passenger(), matched: true, safeTrip: true, day: 1 });
  const result = sim.recordBoarding(passenger(), { day: 2 });
  assert.equal(result.returning, true);
  assert.equal(sim.getPassenger('HAJIYA ZAINAB').rides, 1);
  assert.equal(result.fareMultiplier, 1);
});

test('names are sanitized and report text is data, not HTML', () => {
  const sim = build();
  sim.recordBoarding(passenger('<b>Amina</b>'), { day: 1 });
  const snapshot = sim.getSnapshot();
  assert.equal(snapshot.ledger[0].details.name, 'bAmina/b');
});

test('passenger trust persists when storage is reloaded', () => {
  const storage = new MemoryStorage();
  const first = build({ storage });
  first.recordTrip({ tripId: 'r1:0', passenger: passenger('Ali'), matched: true, safeTrip: true, day: 4 });
  const second = new KanoNorthernDriverPassengerRelationships({ storage });
  assert.equal(second.getPassenger('Ali').trust, 56);
  assert.equal(second.getSnapshot().totals.trips, 1);
});

test('corrupt storage restores safe defaults', () => {
  const storage = new MemoryStorage();
  storage.setItem('kano-life-passenger-relationships-v1', '{broken');
  const sim = build({ storage });
  assert.equal(sim.getSnapshot().reputation, 50);
  assert.equal(sim.getSnapshot().totals.trips, 0);
});

test('ledger is capped and reputation remains within bounds', () => {
  const sim = build();
  for (let i = 0; i < 100; i++) sim.recordTrip({ tripId: `run-${i}`, passenger: passenger(`Customer ${i}`), matched: true, safeTrip: true, day: i + 1 });
  assert.ok(sim.state.ledger.length <= 80);
  assert.ok(sim.state.reputation <= 100);
  assert.ok(sim.state.reputation >= 0);
});

test('relationship records do not create a second wallet or direct cash payouts', () => {
  const sim = build();
  sim.recordTrip({ tripId: 'r1:0', passenger: passenger(), matched: true, safeTrip: true, fareEarned: 150 });
  assert.equal(Object.hasOwn(sim.state, 'wallet'), false);
  assert.equal(Object.hasOwn(sim.state, 'money'), false);
  assert.equal(sim.getSnapshot().lastTrip.fareEarned, 150);
});
