import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KanoNorthernDriverParkOperations,
  KANO_PARK_DAILY_TOKEN,
  KANO_PARK_STANDS,
  KANO_PARK_WORK_STYLES,
} from '../js/KanoNorthernDriverParkOperations.js';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
}
const build = (options = {}) => new KanoNorthernDriverParkOperations({ storage: new MemoryStorage(), now: () => 1_800_000_000_000, ...options });

test('new park operations profile starts with a safe plan and a bounded neutral standing', () => {
  const sim = build();
  const snapshot = sim.getSnapshot(1);
  assert.deepEqual(snapshot.plan, { standId: 'sabon-gari', workStyle: 'official_queue' });
  assert.equal(snapshot.standing, 50);
  assert.equal(snapshot.today.onDuty, false);
  assert.equal(snapshot.totals.completedTrips, 0);
});

test('park stand and work-style catalog entries are unique and valid', () => {
  assert.ok(KANO_PARK_STANDS.length >= 6);
  assert.equal(new Set(KANO_PARK_STANDS.map(x => x.id)).size, KANO_PARK_STANDS.length);
  assert.equal(new Set(KANO_PARK_WORK_STYLES.map(x => x.id)).size, KANO_PARK_WORK_STYLES.length);
});

test('work plan accepts a configured Kano stand and style, but rejects unknown values', () => {
  const sim = build();
  assert.equal(sim.setWorkPlan({ standId: 'farm-centre', workStyle: 'roadside_loading' }).ok, true);
  const stable = structuredClone(sim.state.plan);
  assert.equal(sim.setWorkPlan({ standId: 'made-up-stand', workStyle: 'roadside_loading' }).reason, 'invalid_stand');
  assert.equal(sim.setWorkPlan({ standId: 'hotoro', workStyle: 'illegal-style' }).reason, 'invalid_work_style');
  assert.deepEqual(sim.state.plan, stable);
});

test('official queue gives a deterministic bounded opening position', () => {
  const sim = build();
  const result = sim.startWorkday({ day: 3, minute: 420 });
  assert.equal(result.ok, true);
  assert.ok(result.day.queuePosition >= 1 && result.day.queuePosition <= 6);
  const again = build();
  assert.equal(again.startWorkday({ day: 3, minute: 420 }).day.queuePosition, result.day.queuePosition);
});

test('a workday can be started only once per world day', () => {
  const sim = build();
  assert.equal(sim.startWorkday({ day: 2, minute: 480 }).ok, true);
  assert.equal(sim.startWorkday({ day: 2, minute: 540 }).reason, 'already_on_duty');
  assert.equal(sim.getSnapshot(2).totals.workdaysStarted, 1);
});

test('paying a daily token requires an active official queue duty', () => {
  const sim = build();
  assert.equal(sim.payDailyToken({ day: 1, wallet: 100 }).reason, 'not_on_duty');
  sim.setWorkPlan({ standId: 'sabon-gari', workStyle: 'roadside_loading' });
  sim.startWorkday({ day: 1, minute: 410 });
  assert.equal(sim.payDailyToken({ day: 1, wallet: 100 }).reason, 'token_not_required');
});

test('insufficient wallet does not pay or raise standing', () => {
  const sim = build();
  sim.startWorkday({ day: 1, minute: 410 });
  const standing = sim.state.standing;
  const result = sim.payDailyToken({ day: 1, wallet: KANO_PARK_DAILY_TOKEN - 1 });
  assert.equal(result.reason, 'insufficient_wallet');
  assert.equal(result.wallet, KANO_PARK_DAILY_TOKEN - 1);
  assert.equal(sim.state.standing, standing);
  assert.equal(sim.getSnapshot(1).today.tokenPaid, false);
  assert.equal(sim.state.totals.parkTokensPaid, 0);
});

test('an explicit daily park-token payment debits the supplied wallet once', () => {
  const sim = build();
  sim.startWorkday({ day: 1, minute: 410 });
  const result = sim.payDailyToken({ day: 1, wallet: 500 });
  assert.equal(result.ok, true);
  assert.equal(result.amount, KANO_PARK_DAILY_TOKEN);
  assert.equal(result.wallet, 500 - KANO_PARK_DAILY_TOKEN);
  assert.equal(sim.getSnapshot(1).today.tokenPaid, true);
  assert.equal(sim.state.standing, 53);
  assert.equal(sim.payDailyToken({ day: 1, wallet: result.wallet }).reason, 'already_paid');
  assert.equal(sim.state.totals.parkContributions, KANO_PARK_DAILY_TOKEN);
});

test('a token may be paid on a later workday but not charged automatically', () => {
  const sim = build();
  sim.startWorkday({ day: 1, minute: 410 });
  assert.equal(sim.getSnapshot(1).today.tokenPaid, false);
  assert.equal(sim.payDailyToken({ day: 1, wallet: 500 }).ok, true);
  sim.startWorkday({ day: 2, minute: 410 });
  assert.equal(sim.payDailyToken({ day: 2, wallet: 500 }).ok, true);
  assert.equal(sim.state.totals.parkTokensPaid, 2);
});

test('roadside and independent work styles start without a queue position', () => {
  const sim = build();
  sim.setWorkPlan({ standId: 'hotoro', workStyle: 'roadside_loading' });
  const roadside = sim.startWorkday({ day: 1, minute: 500 });
  assert.equal(roadside.day.onDuty, true);
  assert.equal(roadside.day.queuePosition, null);
  sim.setWorkPlan({ standId: 'farm-centre', workStyle: 'independent_roaming' });
  const roaming = sim.startWorkday({ day: 2, minute: 500 });
  assert.equal(roaming.day.workStyle, 'independent_roaming');
  assert.equal(roaming.day.queuePosition, null);
});

test('career/free-roam shifts start once per run and reject unsupported challenge modes', () => {
  const sim = build();
  assert.equal(sim.startShift({ day: 1, minute: 400, runId: 'career-001', routeName: 'Sabon Gari', mode: 'career' }).ok, true);
  assert.equal(sim.startShift({ day: 1, minute: 400, runId: 'career-001', routeName: 'Sabon Gari', mode: 'career' }).reason, 'shift_already_recorded');
  assert.equal(sim.startShift({ day: 1, minute: 400, runId: 'time-001', mode: 'timeAttack' }).reason, 'mode_not_simulated');
  assert.equal(sim.getSnapshot(1).totals.shiftsStarted, 1);
});

test('successful boarding is tracked and first official-queue dispatch is recorded', () => {
  const sim = build();
  sim.startWorkday({ day: 2, minute: 460 });
  assert.ok(sim.getSnapshot(2).today.queuePosition !== null);
  const result = sim.recordBoarding({ day: 2, name: 'Hajiya Zainab', returning: true });
  assert.equal(result.ok, true);
  assert.equal(result.dispatchedNow, true);
  assert.equal(result.day.dispatched, true);
  assert.equal(result.day.queuePosition, null);
  assert.equal(sim.getSnapshot(2).totals.boardings, 1);
  assert.equal(sim.getSnapshot(2).totals.repeatCustomerTrips, 0);
  assert.equal(Object.hasOwn(sim.state, 'wallet'), false);
});

test('safe and correct completed trips improve park standing without paying extra money', () => {
  const sim = build();
  const result = sim.recordTrip({ tripId: 'career-1:0:Amina', day: 1, matched: true, safeTrip: true, fareEarned: 250, distance: 0.73, destination: 'Kurmi Market', name: 'Amina', returning: true });
  assert.equal(result.ok, true);
  assert.equal(result.standingDelta, 2);
  assert.equal(sim.state.standing, 52);
  assert.equal(sim.state.totals.grossFares, 250);
  assert.equal(sim.state.totals.completedTrips, 1);
  assert.equal(sim.state.totals.repeatCustomerTrips, 1);
  assert.equal(sim.getSnapshot(1).today.distanceKm, 0.73);
  assert.equal(Object.hasOwn(sim.state, 'wallet'), false);
  assert.equal(Object.hasOwn(sim.state, 'money'), false);
});

test('a wrong and rough trip lowers standing, clamped between zero and one hundred', () => {
  const sim = build();
  sim.state.standing = 1;
  const result = sim.recordTrip({ tripId: 'rough-trip', day: 1, matched: false, safeTrip: false, fareEarned: 30 });
  assert.equal(result.standingDelta, -2);
  assert.equal(sim.state.standing, 0);
  sim.state.standing = 99;
  sim.recordTrip({ tripId: 'safe-trip', day: 2, matched: true, safeTrip: true });
  assert.equal(sim.state.standing, 100);
});

test('trip IDs prevent duplicate work history and fare totals', () => {
  const sim = build();
  const input = { tripId: 'one-trip', day: 1, matched: true, safeTrip: true, fareEarned: 200, distance: 1.2 };
  assert.equal(sim.recordTrip(input).ok, true);
  assert.equal(sim.recordTrip(input).reason, 'trip_already_recorded');
  assert.equal(sim.getSnapshot(1).today.completedTrips, 1);
  assert.equal(sim.state.totals.grossFares, 200);
  assert.equal(sim.state.totals.distanceKm, 1.2);
});

test('trip records reject missing ids to guard against duplicate accounting', () => {
  const sim = build();
  assert.equal(sim.recordTrip({ day: 1, matched: true, safeTrip: true }).reason, 'missing_trip_id');
  assert.equal(sim.state.totals.completedTrips, 0);
});

test('work plan changes do not rewrite an already-started day record', () => {
  const sim = build();
  sim.startWorkday({ day: 3, minute: 430 });
  const original = sim.getSnapshot(3).today;
  sim.setWorkPlan({ standId: 'buk-gate', workStyle: 'independent_roaming' });
  assert.equal(sim.getSnapshot(3).today.standId, original.standId);
  assert.equal(sim.getSnapshot(3).today.workStyle, original.workStyle);
  assert.equal(sim.getSnapshot(4).plan.standId, 'buk-gate');
});

test('state persists between service instances', () => {
  const storage = new MemoryStorage();
  const first = build({ storage });
  first.setWorkPlan({ standId: 'farm-centre', workStyle: 'roadside_loading' });
  first.startShift({ day: 5, minute: 510, runId: 'free-5', routeName: 'Farm Centre', mode: 'freeRoam' });
  first.recordTrip({ tripId: 'free-5:0:Ali', day: 5, matched: true, safeTrip: true, fareEarned: 120 });
  const second = new KanoNorthernDriverParkOperations({ storage });
  assert.equal(second.getSnapshot(5).plan.standId, 'farm-centre');
  assert.equal(second.getSnapshot(5).today.completedTrips, 1);
  assert.equal(second.getSnapshot(5).totals.shiftsStarted, 1);
  assert.equal(second.getSnapshot(5).totals.grossFares, 120);
  assert.equal(second.getSnapshot(5).plan.workStyle, 'roadside_loading');
});

test('corrupt storage returns safe defaults', () => {
  const storage = new MemoryStorage();
  storage.setItem('kano-life-park-operations-v1', '{broken');
  const sim = new KanoNorthernDriverParkOperations({ storage });
  assert.equal(sim.getSnapshot(1).standing, 50);
  assert.equal(sim.getSnapshot(1).totals.completedTrips, 0);
});

test('ledger and day history stay bounded over extended play', () => {
  const sim = build();
  for (let day = 1; day <= 90; day++) {
    sim.startShift({ day, minute: 410, runId: `r-${day}`, routeName: 'Sabon Gari', mode: 'career' });
    sim.recordTrip({ tripId: `r-${day}:0`, day, matched: true, safeTrip: true, fareEarned: day });
  }
  assert.ok(Object.keys(sim.state.days).length <= 60);
  assert.ok(sim.state.ledger.length <= 100);
  assert.ok(sim.state.processedTripIds.length <= 200);
  assert.equal(sim.getSnapshot(90).totals.completedTrips, 90);
});
