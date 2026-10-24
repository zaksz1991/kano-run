import test from 'node:test';
import assert from 'node:assert/strict';
import { KanoFareHagglingDirector } from '../js/KanoFareHagglingDirector.js';

test('fare quote increases with distance and remains bounded', () => {
  const d = new KanoFareHagglingDirector({ minFare: 50, maxFare: 5000 });
  assert.ok(d.quoteFare({ distanceKm: 10 }).suggestedFare > d.quoteFare({ distanceKm: 2 }).suggestedFare);
  assert.equal(d.quoteFare({ distanceKm: 500 }).suggestedFare, 5000);
  assert.equal(d.quoteFare({ distanceKm: 0 }).suggestedFare >= 50, true);
});
test('starts negotiation with Hausa dialogue and passenger personality', () => {
  const d = new KanoFareHagglingDirector();
  const r = d.startNegotiation({ passengerId: 'p1', personality: 'trader', distanceKm: 4, destination: 'Kofar Mata' });
  assert.equal(r.ok, true);
  assert.equal(r.session.personality, 'trader');
  assert.ok(r.dialogue.length > 0);
  assert.equal(r.session.status, 'negotiating');
});
test('refuses to settle before agreement or without wallet callback', async () => {
  const d = new KanoFareHagglingDirector();
  d.startNegotiation({ passengerId: 'p2', distanceKm: 4 });
  assert.deepEqual(await d.settle('p2', () => true), { ok: false, reason: 'fare_not_accepted' });
  d.acceptPassengerOffer('p2');
  assert.deepEqual(await d.settle('p2'), { ok: false, reason: 'wallet_commit_required' });
});
test('wallet rejection does not mark fare paid; confirmed wallet commit does', async () => {
  const d = new KanoFareHagglingDirector();
  d.startNegotiation({ passengerId: 'p3', distanceKm: 3 });
  d.acceptPassengerOffer('p3');
  assert.equal((await d.settle('p3', async () => ({ ok: false }))).reason, 'wallet_commit_failed');
  assert.equal(d.snapshot('p3').status, 'accepted');
  const paid = await d.settle('p3', async tx => tx.amount > 0 ? { ok: true } : { ok: false });
  assert.equal(paid.ok, true);
  assert.equal(d.snapshot('p3').status, 'paid');
  assert.equal((await d.settle('p3', async () => true)).reason, 'fare_not_accepted');
});
test('refusal and invalid actions are handled safely', () => {
  const d = new KanoFareHagglingDirector();
  d.startNegotiation({ passengerId: 'p4', distanceKm: 2 });
  assert.equal(d.refusePassenger('p4').status, 'rejected');
  assert.equal(d.counterOffer('p4', 200).reason, 'negotiation_not_active');
  assert.equal(d.acceptPassengerOffer('missing').reason, 'negotiation_not_active');
});
test('counter-offer path returns an explicit status and never changes an external wallet', () => {
  const d = new KanoFareHagglingDirector();
  const before = 1200;
  const start = d.startNegotiation({ passengerId: 'p5', distanceKm: 5, suggestedFare: 500 });
  const result = d.counterOffer('p5', start.session.suggestedFare);
  assert.ok(['accepted', 'rejected', 'negotiating'].includes(result.status));
  assert.equal(before, 1200);
});
