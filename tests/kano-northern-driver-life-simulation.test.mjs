import test from 'node:test';
import assert from 'node:assert/strict';
import { KanoNorthernDriverLifeSimulation } from '../js/KanoNorthernDriverLifeSimulation.js';

function createStorage() {
  const data = new Map();
  return { getItem: (key) => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, String(value)), data };
}

function state(overrides = {}) {
  return { runStartedAt: 1000, fuel: 90, condition: 96, engine: 99, tyres: 98, distance: 3.5, drops: 4, collisions: 0, ...overrides };
}

test('starts with a northern-driver profile and a bounded life ledger', () => {
  const sim = new KanoNorthernDriverLifeSimulation({ storage: createStorage(), now: () => 1000 });
  const snapshot = sim.getSnapshot(1200);
  assert.equal(snapshot.profile.name, 'Musa');
  assert.equal(snapshot.profile.gender, 'male');
  assert.equal(snapshot.profile.age, 22);
  assert.equal(snapshot.profile.ownership, 'daily_hire');
  assert.equal(snapshot.wallet, 1200);
  assert.equal(snapshot.totalArrears, 0);
});

test('sanitizes profile text and validates life choices', () => {
  const sim = new KanoNorthernDriverLifeSimulation({ storage: createStorage(), now: () => 1000 });
  sim.updateProfile({ name: '  <Amina>  ', gender: 'female', age: 42, residence: 'unknown', householdRole: 'provider', ownership: 'hire_purchase', goal: 'education' });
  const p = sim.getSnapshot().profile;
  assert.equal(p.name, 'Amina');
  assert.equal(p.gender, 'female');
  assert.equal(p.age, 35);
  assert.equal(p.residence, 'family_compound');
  assert.equal(p.householdRole, 'provider');
  assert.equal(p.ownership, 'hire_purchase');
  assert.equal(sim.state.vehicleOutstanding, 450000);
});

test('refuses to attach real-life shift accounting to challenge modes', () => {
  const sim = new KanoNorthernDriverLifeSimulation({ storage: createStorage(), now: () => 1000 });
  assert.deepEqual(sim.beginShift(state(), 1, 'timeAttack'), { ok: false, reason: 'mode_not_simulated' });
  assert.equal(sim.state.activeShift, null);
});

test('records career shift income and applies scaled fuel, wear, hire and household costs once', () => {
  const sim = new KanoNorthernDriverLifeSimulation({ storage: createStorage(), now: () => 1000 });
  assert.equal(sim.beginShift(state(), 2, 'career').ok, true);
  const result = sim.settleShift({ earned: 800, gameState: state({ fuel: 80, condition: 92, engine: 98, tyres: 96, distance: 4.2, drops: 7 }), wallet: 2000, dayNumber: 2, mode: 'career' });
  assert.equal(result.ok, true);
  assert.equal(result.report.fuelUsed, 10);
  assert.equal(result.report.fuelCost.due, 80);
  assert.equal(result.report.maintenanceCost.due, 45);
  assert.equal(result.report.vehicleCost.due, 160);
  assert.equal(result.report.householdCost.due, 100);
  assert.equal(result.report.totalPaid, 385);
  assert.equal(result.wallet, 1615);
  assert.equal(result.report.trips, 3);
  assert.equal(result.report.kilometres, 0.7);
  assert.equal(sim.state.totals.gross, 800);
  assert.equal(sim.state.totals.shifts, 1);
  assert.equal(sim.state.activeShift, null);
});

test('deducts daily hire and household costs only once per world day', () => {
  const sim = new KanoNorthernDriverLifeSimulation({ storage: createStorage(), now: () => 1000 });
  sim.beginShift(state({ runStartedAt: 1000 }), 7, 'career');
  const first = sim.settleShift({ earned: 400, gameState: state({ runStartedAt: 1000, fuel: 90, distance: 3.5, drops: 4 }), wallet: 1000, dayNumber: 7, mode: 'career' });
  assert.equal(first.report.vehicleCost.due, 160);
  assert.equal(first.report.householdCost.due, 100);
  sim.beginShift(state({ runStartedAt: 2000 }), 7, 'career');
  const second = sim.settleShift({ earned: 400, gameState: state({ runStartedAt: 2000, fuel: 90, distance: 4, drops: 6 }), wallet: first.wallet + 400, dayNumber: 7, mode: 'career' });
  assert.equal(second.report.vehicleCost.due, 0);
  assert.equal(second.report.householdCost.due, 0);
});

test('records unpaid bills instead of making the banked wallet negative', () => {
  const sim = new KanoNorthernDriverLifeSimulation({ storage: createStorage(), now: () => 1000 });
  sim.beginShift(state(), 1, 'career');
  const result = sim.settleShift({ earned: 10, gameState: state({ fuel: 70, condition: 70, engine: 70, tyres: 70 }), wallet: 20, dayNumber: 1, mode: 'career' });
  assert.equal(result.wallet, 0);
  assert.ok(result.report.arrears.operating > 0);
  assert.ok(result.report.arrears.vehicle > 0);
  assert.ok(result.report.arrears.household > 0);
  assert.ok(result.report.arrears.operating + result.report.arrears.vehicle + result.report.arrears.household > 0);
});

test('savings deposits use the existing wallet and reject invalid or unaffordable values', () => {
  const sim = new KanoNorthernDriverLifeSimulation({ storage: createStorage(), now: () => 1000 });
  assert.equal(sim.depositSavings(50, 500).ok, false);
  assert.equal(sim.depositSavings(600, 500).ok, false);
  const result = sim.depositSavings(300, 500);
  assert.equal(result.ok, true);
  assert.equal(result.wallet, 200);
  assert.equal(sim.state.savings, 300);
});

test('paying arrears never exceeds available wallet and pays vehicle bills first', () => {
  const sim = new KanoNorthernDriverLifeSimulation({ storage: createStorage(), now: () => 1000 });
  sim.state.arrears = { vehicle: 250, household: 100, operating: 80 };
  const result = sim.payArrears(300);
  assert.equal(result.amount, 300);
  assert.equal(result.wallet, 0);
  assert.equal(result.remaining.vehicle, 0);
  assert.equal(result.remaining.household, 50);
  assert.equal(result.remaining.operating, 80);
});

test('meal entries and career ledger survive reload', () => {
  const storage = createStorage();
  const sim = new KanoNorthernDriverLifeSimulation({ storage, now: () => 1000 });
  sim.recordMeal({ amount: 450, food: 'Akara and pap', day: 3 });
  sim.updateProfile({ name: 'Amina', gender: 'female' });
  const restored = new KanoNorthernDriverLifeSimulation({ storage, now: () => 2000 });
  assert.equal(restored.state.profile.name, 'Amina');
  assert.equal(restored.state.totals.meals, 450);
  assert.equal(restored.state.totals.paidExpenses, 450);
  assert.ok(restored.state.ledger.some(row => row.type === 'meal' && row.amount === -450));
});

test('refuses to settle a missing, mismatched or already closed shift', () => {
  const sim = new KanoNorthernDriverLifeSimulation({ storage: createStorage(), now: () => 1000 });
  assert.equal(sim.settleShift({ earned: 20, gameState: state(), wallet: 100, dayNumber: 1, mode: 'career' }).reason, 'no_active_shift');
  sim.beginShift(state({ runStartedAt: 1000 }), 1, 'career');
  assert.equal(sim.settleShift({ earned: 20, gameState: state({ runStartedAt: 2000 }), wallet: 100, dayNumber: 1, mode: 'career' }).reason, 'shift_id_mismatch');
});
