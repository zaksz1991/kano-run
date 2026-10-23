import test from 'node:test';
import assert from 'node:assert/strict';
import { KanoNorthernDriverRealLife } from '../js/KanoNorthernDriverRealLife.js';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
}
const build = (options = {}) => new KanoNorthernDriverRealLife({ storage: new MemoryStorage(), now: () => 1_800_000_000_000, ...options });

test('safe and correct real gameplay trips improve the existing passenger-respect meter', () => {
  const sim = build();
  const before = sim.getSnapshot().meters.passengerRespect;
  const result = sim.recordPassengerService({ name: 'Amina', matched: true, safeTrip: true, day: 2, fareEarned: 170 });
  assert.equal(result.ok, true);
  assert.equal(result.trustDelta, 3);
  assert.equal(result.passengerRespect, before + 3);
  assert.equal(sim.getSnapshot().ledger[0].type, 'passenger_service');
  assert.equal(sim.getSnapshot().ledger[0].amount, 0);
});

test('rough or incorrect trips reduce respect and never directly credit wallet funds', () => {
  const sim = build();
  const before = sim.getSnapshot().meters.passengerRespect;
  const result = sim.recordPassengerService({ name: 'Bello', matched: false, safeTrip: false, day: 2, fareEarned: 0 });
  assert.equal(result.trustDelta, -5);
  assert.equal(result.passengerRespect, before - 5);
  assert.equal(Object.hasOwn(result, 'wallet'), false);
  assert.equal(sim.getSnapshot().meters.passengerRespect, before - 5);
});

test('service respect clamps at zero and one hundred', () => {
  const sim = build();
  sim.state.meters.passengerRespect = 99;
  assert.equal(sim.recordPassengerService({ matched: true, safeTrip: true }).passengerRespect, 100);
  sim.state.meters.passengerRespect = 1;
  assert.equal(sim.recordPassengerService({ matched: false, safeTrip: false }).passengerRespect, 0);
});
